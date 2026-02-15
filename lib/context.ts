import { desc, sql } from "drizzle-orm";
import { db } from "./db";
import { items, transactions, ledgerParties, ledgerEntries } from "./db/schema";

// ── Types ───────────────────────────────────────────────────────────────────

export interface StoreContext {
  items: {
    id: number;
    name: string;
    aliases: string[];
    unit: string | null;
    currentStock: number;
    minStock: number;
  }[];
  recentTransactions: {
    type: string;
    itemId: number;
    qty: number;
    price: string | null;
    ts: Date;
  }[];
  ledgerParties: {
    id: number;
    name: string;
    phone: string | null;
    balance: number;
  }[];
}

// ── Builder ─────────────────────────────────────────────────────────────────

/**
 * Pull live store state from the DB for injection into the Claude prompt.
 */
export async function buildContext(): Promise<StoreContext> {
  // All items in catalog
  const allItems = await db
    .select({
      id: items.id,
      name: items.name,
      aliases: items.aliases,
      unit: items.unit,
      currentStock: items.currentStock,
      minStock: items.minStock,
    })
    .from(items);

  // Last 20 transactions
  const recentTxns = await db
    .select({
      type: transactions.type,
      itemId: transactions.itemId,
      qty: transactions.qty,
      price: transactions.price,
      ts: transactions.ts,
    })
    .from(transactions)
    .orderBy(desc(transactions.ts))
    .limit(20);

  // All ledger parties with running balance (sum of delta_amount)
  const partiesWithBalance = await db
    .select({
      id: ledgerParties.id,
      name: ledgerParties.name,
      phone: ledgerParties.phone,
      balance:
        sql<number>`COALESCE((SELECT SUM(${ledgerEntries.deltaAmount}::numeric) FROM ${ledgerEntries} WHERE ${ledgerEntries.partyId} = ${ledgerParties.id}), 0)`.as(
          "balance",
        ),
    })
    .from(ledgerParties);

  return {
    items: allItems,
    recentTransactions: recentTxns,
    ledgerParties: partiesWithBalance,
  };
}
