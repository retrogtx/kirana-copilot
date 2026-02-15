import { eq, sql, lte, gte } from "drizzle-orm";
import { db } from "./db";
import {
  items,
  transactions,
  ledgerParties,
  ledgerEntries,
} from "./db/schema";
import type { IntentResult } from "./ai/schemas";

// ── Types ───────────────────────────────────────────────────────────────────

interface ExecResult {
  success: boolean;
  reply: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Find an item by name_raw: exact name match OR alias match (case-insensitive).
 * If item_id is provided by Claude, look up by id first.
 */
async function resolveItem(nameRaw: string, itemId: string | null) {
  // If Claude gave us an id, trust it
  if (itemId) {
    const [found] = await db
      .select()
      .from(items)
      .where(eq(items.id, parseInt(itemId, 10)))
      .limit(1);
    if (found) return found;
  }

  // Otherwise fuzzy match by name / aliases (case-insensitive)
  const allItems = await db.select().from(items);
  const lower = nameRaw.toLowerCase().trim();

  for (const item of allItems) {
    if (item.name.toLowerCase() === lower) return item;
    if (item.aliases.some((a: string) => a.toLowerCase() === lower))
      return item;
  }

  return null;
}

// ── Executor ────────────────────────────────────────────────────────────────

export async function executeIntent(intent: IntentResult): Promise<ExecResult> {
  switch (intent.intent) {
    case "RECORD_SALE":
      return handleRecordSale(intent);
    case "ADD_STOCK":
      return handleAddStock(intent);
    case "LEDGER_ADD_DEBT":
      return handleLedgerAddDebt(intent);
    case "LEDGER_RECEIVE_PAYMENT":
      return handleLedgerReceivePayment(intent);
    case "CHECK_LOW_STOCK":
      return handleCheckLowStock(intent);
    case "SUGGEST_REORDER":
      return handleSuggestReorder(intent);
    case "DAILY_SUMMARY":
      return handleDailySummary(intent);
    case "HELP":
      return handleHelp();
    default:
      return { success: false, reply: "Unknown intent." };
  }
}

// ── RECORD_SALE ─────────────────────────────────────────────────────────────

async function handleRecordSale(intent: IntentResult): Promise<ExecResult> {
  const saleItems = intent.args.items ?? [];
  if (!saleItems.length) return { success: false, reply: "No items to record." };

  const results: string[] = [];
  const notFound: string[] = [];

  for (const entry of saleItems) {
    const item = await resolveItem(entry.name_raw, entry.item_id);
    if (!item) {
      notFound.push(entry.name_raw);
      continue;
    }

    // Decrement stock
    await db
      .update(items)
      .set({ currentStock: sql`${items.currentStock} - ${entry.qty}` })
      .where(eq(items.id, item.id));

    // Insert transaction
    await db.insert(transactions).values({
      type: "SALE",
      itemId: item.id,
      qty: entry.qty,
      price: entry.price_total?.toString() ?? null,
    });

    results.push(`${item.name} x${entry.qty}`);
  }

  let reply = "";
  if (results.length) reply += `Sale recorded: ${results.join(", ")}.`;
  if (notFound.length)
    reply += ` Items not found: ${notFound.join(", ")}. Add them to the catalog first.`;

  return { success: results.length > 0, reply };
}

// ── ADD_STOCK ───────────────────────────────────────────────────────────────

async function handleAddStock(intent: IntentResult): Promise<ExecResult> {
  const stockItems = intent.args.items ?? [];
  if (!stockItems.length) return { success: false, reply: "No items to add." };

  const results: string[] = [];
  const created: string[] = [];

  for (const entry of stockItems) {
    let item = await resolveItem(entry.name_raw, entry.item_id);

    // Auto-create item if it doesn't exist
    if (!item) {
      const [newItem] = await db
        .insert(items)
        .values({
          name: entry.name_raw.trim(),
          aliases: [],
          unit: entry.unit,
          currentStock: 0,
          minStock: 5,
          lastCostPrice: entry.cost_total?.toString() ?? null,
        })
        .returning();
      item = newItem;
      created.push(entry.name_raw);
    }

    // Increment stock
    await db
      .update(items)
      .set({
        currentStock: sql`${items.currentStock} + ${entry.qty}`,
        lastCostPrice: entry.cost_total?.toString() ?? item.lastCostPrice,
      })
      .where(eq(items.id, item.id));

    // Insert transaction
    await db.insert(transactions).values({
      type: "STOCK_IN",
      itemId: item.id,
      qty: entry.qty,
      price: entry.cost_total?.toString() ?? null,
    });

    results.push(`${item.name} +${entry.qty}`);
  }

  let reply = `Stock added: ${results.join(", ")}.`;
  if (created.length)
    reply += ` New items created: ${created.join(", ")}.`;

  return { success: true, reply };
}

// ── LEDGER_ADD_DEBT ─────────────────────────────────────────────────────────

async function handleLedgerAddDebt(intent: IntentResult): Promise<ExecResult> {
  const { party_name, amount, note } = intent.args;
  if (!party_name || amount == null)
    return { success: false, reply: "Party name and amount required for udhar." };

  // Find or create party
  let [party] = await db
    .select()
    .from(ledgerParties)
    .where(eq(ledgerParties.name, party_name))
    .limit(1);

  if (!party) {
    [party] = await db
      .insert(ledgerParties)
      .values({ name: party_name })
      .returning();
  }

  // Insert ledger entry (positive = they owe shop)
  await db.insert(ledgerEntries).values({
    partyId: party.id,
    deltaAmount: amount.toString(),
    note: note ?? null,
  });

  // Get new balance
  const [{ balance }] = await db
    .select({
      balance: sql<number>`COALESCE(SUM(${ledgerEntries.deltaAmount}::numeric), 0)`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.partyId, party.id));

  return {
    success: true,
    reply: `Udhar recorded: ${party_name} ko ₹${amount} likh diya. Total balance: ₹${balance}.`,
  };
}

// ── LEDGER_RECEIVE_PAYMENT ──────────────────────────────────────────────────

async function handleLedgerReceivePayment(
  intent: IntentResult,
): Promise<ExecResult> {
  const { party_name, amount, note } = intent.args;
  if (!party_name || amount == null)
    return { success: false, reply: "Party name and amount required." };

  const [party] = await db
    .select()
    .from(ledgerParties)
    .where(eq(ledgerParties.name, party_name))
    .limit(1);

  if (!party) {
    return {
      success: false,
      reply: `"${party_name}" not found in ledger. Check the name and try again.`,
    };
  }

  // Insert ledger entry (negative = they paid)
  await db.insert(ledgerEntries).values({
    partyId: party.id,
    deltaAmount: (-amount).toString(),
    note: note ?? null,
  });

  // Get new balance
  const [{ balance }] = await db
    .select({
      balance: sql<number>`COALESCE(SUM(${ledgerEntries.deltaAmount}::numeric), 0)`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.partyId, party.id));

  return {
    success: true,
    reply: `Payment received: ${party_name} se ₹${amount} mil gaye. Remaining balance: ₹${balance}.`,
  };
}

// ── CHECK_LOW_STOCK ─────────────────────────────────────────────────────────

async function handleCheckLowStock(
  intent: IntentResult,
): Promise<ExecResult> {
  const limit = intent.args.limit ?? 20;

  const lowItems = await db
    .select({
      name: items.name,
      currentStock: items.currentStock,
      minStock: items.minStock,
      unit: items.unit,
    })
    .from(items)
    .where(lte(items.currentStock, items.minStock))
    .limit(limit);

  if (!lowItems.length) {
    return { success: true, reply: "Sab stock theek hai! Koi item low nahi hai." };
  }

  const lines = lowItems.map(
    (i) => `• ${i.name}: ${i.currentStock}${i.unit ? ` ${i.unit}` : ""} (min: ${i.minStock})`,
  );

  return {
    success: true,
    reply: `Low stock items:\n${lines.join("\n")}`,
  };
}

// ── SUGGEST_REORDER ─────────────────────────────────────────────────────────

async function handleSuggestReorder(
  intent: IntentResult,
): Promise<ExecResult> {
  const limit = intent.args.limit ?? 10;

  // Items that are at or below min_stock
  const lowItems = await db
    .select({
      id: items.id,
      name: items.name,
      currentStock: items.currentStock,
      minStock: items.minStock,
      unit: items.unit,
    })
    .from(items)
    .where(lte(items.currentStock, items.minStock))
    .limit(limit);

  if (!lowItems.length) {
    return { success: true, reply: "No reorder needed right now. Stock is fine." };
  }

  // For each low item, suggest reorder qty = minStock * 2 - currentStock
  const lines = lowItems.map((i) => {
    const suggestedQty = Math.max(i.minStock * 2 - i.currentStock, i.minStock);
    return `• ${i.name}: order ${suggestedQty}${i.unit ? ` ${i.unit}` : ""} (current: ${i.currentStock}, min: ${i.minStock})`;
  });

  return {
    success: true,
    reply: `Reorder suggestions:\n${lines.join("\n")}`,
  };
}

// ── DAILY_SUMMARY ───────────────────────────────────────────────────────────

async function handleDailySummary(
  intent: IntentResult,
): Promise<ExecResult> {
  const dateStr = intent.args.date ?? new Date().toISOString().slice(0, 10);
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

  // Today's transactions
  const dayTxns = await db
    .select({
      type: transactions.type,
      qty: transactions.qty,
      price: transactions.price,
    })
    .from(transactions)
    .where(
      sql`${transactions.ts} >= ${dayStart} AND ${transactions.ts} <= ${dayEnd}`,
    );

  const sales = dayTxns.filter((t) => t.type === "SALE");
  const stockIns = dayTxns.filter((t) => t.type === "STOCK_IN");
  const totalSaleAmount = sales.reduce(
    (sum, t) => sum + (t.price ? parseFloat(t.price) : 0),
    0,
  );
  const totalSaleQty = sales.reduce((sum, t) => sum + t.qty, 0);

  // Today's ledger entries
  const dayLedger = await db
    .select({
      deltaAmount: ledgerEntries.deltaAmount,
    })
    .from(ledgerEntries)
    .where(
      sql`${ledgerEntries.ts} >= ${dayStart} AND ${ledgerEntries.ts} <= ${dayEnd}`,
    );

  const newUdhar = dayLedger
    .filter((e) => parseFloat(e.deltaAmount) > 0)
    .reduce((sum, e) => sum + parseFloat(e.deltaAmount), 0);
  const received = dayLedger
    .filter((e) => parseFloat(e.deltaAmount) < 0)
    .reduce((sum, e) => sum + Math.abs(parseFloat(e.deltaAmount)), 0);

  const lines = [
    `📊 Hisaab for ${dateStr}:`,
    `• Sales: ${sales.length} transactions, ${totalSaleQty} items, ₹${totalSaleAmount}`,
    `• Stock in: ${stockIns.length} transactions`,
    `• New udhar: ₹${newUdhar}`,
    `• Payments received: ₹${received}`,
  ];

  return { success: true, reply: lines.join("\n") };
}

// ── HELP ────────────────────────────────────────────────────────────────────

function handleHelp(): ExecResult {
  return {
    success: true,
    reply: `Main Kirana Copilot hoon! Yeh commands use karo:

• Sale: "Maggi 12, Dairy Milk 6 bik gaye"
• Stock add: "Milk 10 aaya"
• Udhar: "Ramesh ko 450 udhar likh do"
• Payment: "Ramesh se 200 mil gaye"
• Low stock: "Kya kya khatam ho raha hai?"
• Reorder: "Kal ke liye reorder list bana do"
• Hisaab: "Aaj ka hisaab"

Text ya voice note — dono chalega!`,
  };
}
