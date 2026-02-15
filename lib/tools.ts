import { tool } from "ai";
import { z } from "zod";
import { eq, sql, lte, and } from "drizzle-orm";
import { db } from "./db";
import {
  items,
  transactions,
  ledgerParties,
  ledgerEntries,
} from "./db/schema";

/**
 * Create the full tool set for a given store. The storeId is baked into every
 * tool via closure so Claude can never access another store's data.
 */
export function createTools(storeId: number) {
  return {
    // ── READ tools ────────────────────────────────────────────────────────

    search_items: tool({
      description:
        "Search for items in the store catalog by name or alias. Use this before recording a sale or checking stock for a specific item.",
      inputSchema: z.object({
        query: z.string().describe("Item name or alias to search for"),
      }),
      execute: async ({ query }) => {
        const allItems = await db
          .select()
          .from(items)
          .where(eq(items.storeId, storeId));

        const lower = query.toLowerCase().trim();
        const matches = allItems.filter(
          (item) =>
            item.name.toLowerCase().includes(lower) ||
            item.aliases.some((a: string) => a.toLowerCase().includes(lower)),
        );

        if (!matches.length) {
          return { found: false, message: `No item matching "${query}" found in catalog.`, items: [] };
        }

        return {
          found: true,
          items: matches.map((i) => ({
            id: i.id,
            name: i.name,
            aliases: i.aliases,
            unit: i.unit,
            currentStock: i.currentStock,
            minStock: i.minStock,
            lastCostPrice: i.lastCostPrice,
          })),
        };
      },
    }),

    get_inventory: tool({
      description:
        "List all items in the store with their current stock levels. Use for general inventory overview.",
      inputSchema: z.object({}),
      execute: async () => {
        const allItems = await db
          .select()
          .from(items)
          .where(eq(items.storeId, storeId));

        if (!allItems.length) {
          return { message: "No items in catalog yet.", items: [] };
        }

        return {
          items: allItems.map((i) => ({
            id: i.id,
            name: i.name,
            unit: i.unit,
            currentStock: i.currentStock,
            minStock: i.minStock,
          })),
        };
      },
    }),

    check_low_stock: tool({
      description:
        "Get items that are at or below their minimum stock level. Use when user asks about low stock or what needs restocking.",
      inputSchema: z.object({}),
      execute: async () => {
        const lowItems = await db
          .select()
          .from(items)
          .where(
            and(
              eq(items.storeId, storeId),
              lte(items.currentStock, items.minStock),
            ),
          );

        if (!lowItems.length) {
          return { message: "All items are above minimum stock.", items: [] };
        }

        return {
          items: lowItems.map((i) => ({
            id: i.id,
            name: i.name,
            unit: i.unit,
            currentStock: i.currentStock,
            minStock: i.minStock,
          })),
        };
      },
    }),

    // ── WRITE tools: Inventory ────────────────────────────────────────────

    record_sale: tool({
      description:
        "Record a sale: decrements stock and logs the transaction. Use search_items first to get the item_id. If the item doesn't exist, tell the user to add stock first.",
      inputSchema: z.object({
        item_id: z.number().describe("The item ID from search_items"),
        qty: z.number().describe("Quantity sold"),
        price: z.number().nullable().describe("Total sale price in INR, or null if unknown"),
      }),
      execute: async ({ item_id, qty, price }) => {
        // Verify item belongs to this store
        const [item] = await db
          .select()
          .from(items)
          .where(and(eq(items.id, item_id), eq(items.storeId, storeId)))
          .limit(1);

        if (!item) return { success: false, message: "Item not found in your store." };

        if (item.currentStock < qty) {
          return {
            success: false,
            message: `Not enough stock for ${item.name}. Current stock: ${item.currentStock}, requested: ${qty}.`,
          };
        }

        await db
          .update(items)
          .set({ currentStock: sql`${items.currentStock} - ${qty}` })
          .where(eq(items.id, item_id));

        await db.insert(transactions).values({
          storeId,
          type: "SALE",
          itemId: item_id,
          qty,
          price: price?.toString() ?? null,
        });

        const newStock = item.currentStock - qty;
        return {
          success: true,
          message: `Sale recorded: ${item.name} x${qty}. Stock: ${item.currentStock} → ${newStock}.`,
          warning: newStock <= item.minStock ? `Low stock alert: ${item.name} is now at ${newStock}.` : null,
        };
      },
    }),

    add_stock: tool({
      description:
        "Add stock for an item. If the item doesn't exist in the catalog, it will be auto-created. Use this when goods arrive at the store.",
      inputSchema: z.object({
        name: z.string().describe("Item name (used to find or create the item)"),
        qty: z.number().describe("Quantity to add"),
        unit: z.string().nullable().describe("Unit (pcs, kg, litre, etc.)"),
        cost_per_unit: z.number().nullable().describe("Cost per unit in INR, or null if unknown"),
      }),
      execute: async ({ name, qty, unit, cost_per_unit }) => {
        // Try to find existing item
        const allItems = await db
          .select()
          .from(items)
          .where(eq(items.storeId, storeId));

        const lower = name.toLowerCase().trim();
        let item = allItems.find(
          (i) =>
            i.name.toLowerCase() === lower ||
            i.aliases.some((a: string) => a.toLowerCase() === lower),
        );

        let created = false;

        if (!item) {
          // Auto-create
          const [newItem] = await db
            .insert(items)
            .values({
              storeId,
              name: name.trim(),
              aliases: [],
              unit,
              currentStock: 0,
              minStock: 5,
              lastCostPrice: cost_per_unit?.toString() ?? null,
            })
            .returning();
          item = newItem;
          created = true;
        }

        // Increment stock
        await db
          .update(items)
          .set({
            currentStock: sql`${items.currentStock} + ${qty}`,
            lastCostPrice: cost_per_unit?.toString() ?? item.lastCostPrice,
          })
          .where(eq(items.id, item.id));

        // Log transaction
        const totalCost = cost_per_unit ? cost_per_unit * qty : null;
        await db.insert(transactions).values({
          storeId,
          type: "STOCK_IN",
          itemId: item.id,
          qty,
          price: totalCost?.toString() ?? null,
        });

        const newStock = item.currentStock + qty;
        return {
          success: true,
          created,
          message: `${created ? "New item created. " : ""}Stock added: ${item.name} +${qty}. Stock: ${item.currentStock} → ${newStock}.`,
        };
      },
    }),

    // ── READ tools: Ledger ────────────────────────────────────────────────

    lookup_party: tool({
      description:
        "Look up a customer/party by name and get their current udhar balance. Use this to check how much someone owes.",
      inputSchema: z.object({
        name: z.string().describe("Customer/party name to search for"),
      }),
      execute: async ({ name }) => {
        const lower = name.toLowerCase().trim();

        const allParties = await db
          .select()
          .from(ledgerParties)
          .where(eq(ledgerParties.storeId, storeId));

        const party = allParties.find(
          (p) => p.name.toLowerCase().includes(lower),
        );

        if (!party) {
          return { found: false, message: `No customer named "${name}" found.` };
        }

        // Get balance
        const [{ balance }] = await db
          .select({
            balance: sql<number>`COALESCE(SUM(${ledgerEntries.deltaAmount}::numeric), 0)`,
          })
          .from(ledgerEntries)
          .where(eq(ledgerEntries.partyId, party.id));

        // Get recent entries
        const recentEntries = await db
          .select()
          .from(ledgerEntries)
          .where(eq(ledgerEntries.partyId, party.id))
          .orderBy(sql`${ledgerEntries.ts} DESC`)
          .limit(5);

        return {
          found: true,
          party: {
            id: party.id,
            name: party.name,
            phone: party.phone,
            balance: Number(balance),
          },
          recentEntries: recentEntries.map((e) => ({
            amount: Number(e.deltaAmount),
            note: e.note,
            ts: e.ts,
          })),
        };
      },
    }),

    list_parties: tool({
      description:
        "List all customers/parties with their udhar balances. Use for a full ledger overview.",
      inputSchema: z.object({}),
      execute: async () => {
        const allParties = await db
          .select({
            id: ledgerParties.id,
            name: ledgerParties.name,
            phone: ledgerParties.phone,
            balance: sql<number>`COALESCE((SELECT SUM(${ledgerEntries.deltaAmount}::numeric) FROM ${ledgerEntries} WHERE ${ledgerEntries.partyId} = ${ledgerParties.id}), 0)`,
          })
          .from(ledgerParties)
          .where(eq(ledgerParties.storeId, storeId));

        if (!allParties.length) {
          return { message: "No customers in ledger yet.", parties: [] };
        }

        return {
          parties: allParties.map((p) => ({
            id: p.id,
            name: p.name,
            phone: p.phone,
            balance: Number(p.balance),
          })),
        };
      },
    }),

    // ── WRITE tools: Ledger ───────────────────────────────────────────────

    add_debt: tool({
      description:
        "Record udhar (credit) for a customer. Positive amount means they owe the shop. Auto-creates the customer if new. Use lookup_party first if unsure whether the customer exists.",
      inputSchema: z.object({
        party_name: z.string().describe("Customer name"),
        amount: z.number().describe("Amount they owe (positive number)"),
        note: z.string().nullable().describe("Optional note about what the debt is for"),
      }),
      execute: async ({ party_name, amount, note }) => {
        // Find or create party
        const allParties = await db
          .select()
          .from(ledgerParties)
          .where(eq(ledgerParties.storeId, storeId));

        const lower = party_name.toLowerCase().trim();
        let party = allParties.find((p) => p.name.toLowerCase() === lower);

        if (!party) {
          const [newParty] = await db
            .insert(ledgerParties)
            .values({ storeId, name: party_name.trim() })
            .returning();
          party = newParty;
        }

        // Insert ledger entry (positive = they owe shop)
        await db.insert(ledgerEntries).values({
          partyId: party.id,
          deltaAmount: amount.toString(),
          note,
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
          message: `Udhar recorded: ${party.name} ko ₹${amount} likh diya. Total balance: ₹${Number(balance)}.`,
        };
      },
    }),

    receive_payment: tool({
      description:
        "Record a payment received from a customer (reduces their udhar). Use lookup_party first to verify the customer exists and check their balance.",
      inputSchema: z.object({
        party_name: z.string().describe("Customer name"),
        amount: z.number().describe("Amount received (positive number)"),
        note: z.string().nullable().describe("Optional note"),
      }),
      execute: async ({ party_name, amount, note }) => {
        const allParties = await db
          .select()
          .from(ledgerParties)
          .where(eq(ledgerParties.storeId, storeId));

        const lower = party_name.toLowerCase().trim();
        const party = allParties.find((p) => p.name.toLowerCase() === lower);

        if (!party) {
          return {
            success: false,
            message: `Customer "${party_name}" not found in ledger. Check the name.`,
          };
        }

        // Insert ledger entry (negative = payment received)
        await db.insert(ledgerEntries).values({
          partyId: party.id,
          deltaAmount: (-amount).toString(),
          note,
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
          message: `Payment received: ${party.name} se ₹${amount} mil gaye. Remaining balance: ₹${Number(balance)}.`,
        };
      },
    }),

    // ── Summary ───────────────────────────────────────────────────────────

    get_daily_summary: tool({
      description:
        "Get a summary of today's (or a specific date's) activity: sales, stock-ins, and ledger changes.",
      inputSchema: z.object({
        date: z
          .string()
          .nullable()
          .describe("Date in YYYY-MM-DD format, or null for today"),
      }),
      execute: async ({ date }) => {
        const dateStr = date ?? new Date().toISOString().slice(0, 10);
        const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
        const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

        // Transactions
        const dayTxns = await db
          .select({
            type: transactions.type,
            qty: transactions.qty,
            price: transactions.price,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.storeId, storeId),
              sql`${transactions.ts} >= ${dayStart} AND ${transactions.ts} <= ${dayEnd}`,
            ),
          );

        const sales = dayTxns.filter((t) => t.type === "SALE");
        const stockIns = dayTxns.filter((t) => t.type === "STOCK_IN");
        const totalSaleAmount = sales.reduce(
          (sum, t) => sum + (t.price ? parseFloat(t.price) : 0),
          0,
        );
        const totalSaleQty = sales.reduce((sum, t) => sum + t.qty, 0);

        // Ledger activity — join through parties scoped to this store
        const storeParties = await db
          .select({ id: ledgerParties.id })
          .from(ledgerParties)
          .where(eq(ledgerParties.storeId, storeId));

        const partyIds = storeParties.map((p) => p.id);

        let newUdhar = 0;
        let received = 0;

        if (partyIds.length) {
          const dayLedger = await db
            .select({ deltaAmount: ledgerEntries.deltaAmount })
            .from(ledgerEntries)
            .where(
              sql`${ledgerEntries.partyId} IN (${sql.join(partyIds.map((id) => sql`${id}`), sql`, `)}) AND ${ledgerEntries.ts} >= ${dayStart} AND ${ledgerEntries.ts} <= ${dayEnd}`,
            );

          newUdhar = dayLedger
            .filter((e) => parseFloat(e.deltaAmount) > 0)
            .reduce((sum, e) => sum + parseFloat(e.deltaAmount), 0);
          received = dayLedger
            .filter((e) => parseFloat(e.deltaAmount) < 0)
            .reduce((sum, e) => sum + Math.abs(parseFloat(e.deltaAmount)), 0);
        }

        return {
          date: dateStr,
          sales: {
            count: sales.length,
            totalQty: totalSaleQty,
            totalAmount: totalSaleAmount,
          },
          stockIns: { count: stockIns.length },
          ledger: { newUdhar, paymentsReceived: received },
        };
      },
    }),
  };
}
