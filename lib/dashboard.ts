import { eq, sql, desc, and, lte } from "drizzle-orm";
import { db } from "./db";
import {
  items,
  transactions,
  ledgerParties,
  ledgerEntries,
} from "./db/schema";

// ── Types ───────────────────────────────────────────────────────────────────

export interface DailySummary {
  date: string;
  salesCount: number;
  salesQty: number;
  salesRevenue: number;
  stockInsCount: number;
  newUdhar: number;
  paymentsReceived: number;
}

export interface InventoryItem {
  id: number;
  name: string;
  unit: string | null;
  currentStock: number;
  minStock: number;
  lastCostPrice: string | null;
  isLow: boolean;
}

export interface LedgerPartyOverview {
  id: number;
  name: string;
  phone: string | null;
  balance: number;
  recentEntries: {
    amount: number;
    note: string | null;
    ts: Date;
  }[];
}

export interface TransactionRow {
  id: number;
  type: string;
  itemName: string;
  qty: number;
  price: string | null;
  ts: Date;
}

// ── Data functions ──────────────────────────────────────────────────────────

export async function getDailySummary(
  storeId: number,
  date?: string,
): Promise<DailySummary> {
  const dateStr = date ?? new Date().toISOString().slice(0, 10);
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

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

  // Ledger activity
  const storeParties = await db
    .select({ id: ledgerParties.id })
    .from(ledgerParties)
    .where(eq(ledgerParties.storeId, storeId));

  const partyIds = storeParties.map((p) => p.id);
  let newUdhar = 0;
  let paymentsReceived = 0;

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
    paymentsReceived = dayLedger
      .filter((e) => parseFloat(e.deltaAmount) < 0)
      .reduce((sum, e) => sum + Math.abs(parseFloat(e.deltaAmount)), 0);
  }

  return {
    date: dateStr,
    salesCount: sales.length,
    salesQty: sales.reduce((s, t) => s + t.qty, 0),
    salesRevenue: sales.reduce(
      (s, t) => s + (t.price ? parseFloat(t.price) : 0),
      0,
    ),
    stockInsCount: stockIns.length,
    newUdhar,
    paymentsReceived,
  };
}

export async function getInventory(storeId: number): Promise<InventoryItem[]> {
  const allItems = await db
    .select()
    .from(items)
    .where(eq(items.storeId, storeId));

  return allItems.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    currentStock: i.currentStock,
    minStock: i.minStock,
    lastCostPrice: i.lastCostPrice,
    isLow: i.currentStock <= i.minStock,
  }));
}

export async function getLedgerOverview(
  storeId: number,
): Promise<LedgerPartyOverview[]> {
  const parties = await db
    .select({
      id: ledgerParties.id,
      name: ledgerParties.name,
      phone: ledgerParties.phone,
      balance: sql<number>`COALESCE((SELECT SUM(${ledgerEntries.deltaAmount}::numeric) FROM ${ledgerEntries} WHERE ${ledgerEntries.partyId} = ${ledgerParties.id}), 0)`,
    })
    .from(ledgerParties)
    .where(eq(ledgerParties.storeId, storeId));

  const result: LedgerPartyOverview[] = [];

  for (const p of parties) {
    const entries = await db
      .select({
        deltaAmount: ledgerEntries.deltaAmount,
        note: ledgerEntries.note,
        ts: ledgerEntries.ts,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.partyId, p.id))
      .orderBy(desc(ledgerEntries.ts))
      .limit(5);

    result.push({
      id: p.id,
      name: p.name,
      phone: p.phone,
      balance: Number(p.balance),
      recentEntries: entries.map((e) => ({
        amount: parseFloat(e.deltaAmount),
        note: e.note,
        ts: e.ts,
      })),
    });
  }

  return result;
}

export async function getRecentTransactions(
  storeId: number,
): Promise<TransactionRow[]> {
  const txns = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      itemName: items.name,
      qty: transactions.qty,
      price: transactions.price,
      ts: transactions.ts,
    })
    .from(transactions)
    .innerJoin(items, eq(transactions.itemId, items.id))
    .where(eq(transactions.storeId, storeId))
    .orderBy(desc(transactions.ts))
    .limit(20);

  return txns;
}
