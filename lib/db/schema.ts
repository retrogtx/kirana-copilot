import {
  bigint,
  integer,
  json,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// ── Stores (one per Telegram chat) ──────────────────────────────────────────

export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  telegramChatId: bigint("telegram_chat_id", { mode: "number" })
    .notNull()
    .unique(),
  name: text("name").notNull().default("My Kirana Store"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Items (SKU catalog, scoped to store) ────────────────────────────────────

export const items = pgTable("items", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id")
    .notNull()
    .references(() => stores.id),
  name: text("name").notNull(),
  aliases: json("aliases").$type<string[]>().notNull().default([]),
  unit: text("unit"), // e.g. "pcs", "kg", "litre"
  currentStock: integer("current_stock").notNull().default(0),
  minStock: integer("min_stock").notNull().default(5),
  lastCostPrice: numeric("last_cost_price"),
});

// ── Transactions (sales, stock-ins, adjustments — scoped to store) ──────────

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id")
    .notNull()
    .references(() => stores.id),
  type: text("type").notNull(), // SALE | STOCK_IN | ADJUST
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id),
  qty: integer("qty").notNull(),
  price: numeric("price"),
  ts: timestamp("ts").notNull().defaultNow(),
});

// ── Ledger parties (people who owe / are owed — scoped to store) ────────────

export const ledgerParties = pgTable("ledger_parties", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id")
    .notNull()
    .references(() => stores.id),
  name: text("name").notNull(),
  phone: text("phone"),
});

// ── Ledger entries (udhar / payment records) ────────────────────────────────

export const ledgerEntries = pgTable("ledger_entries", {
  id: serial("id").primaryKey(),
  partyId: integer("party_id")
    .notNull()
    .references(() => ledgerParties.id),
  deltaAmount: numeric("delta_amount").notNull(), // positive = they owe shop
  note: text("note"),
  ts: timestamp("ts").notNull().defaultNow(),
});

// ── Reminders ───────────────────────────────────────────────────────────────

export const reminders = pgTable("reminders", {
  id: serial("id").primaryKey(),
  partyId: integer("party_id")
    .notNull()
    .references(() => ledgerParties.id),
  amount: numeric("amount"),
  dueTs: timestamp("due_ts").notNull(),
  status: text("status").notNull().default("pending"), // pending | sent | done
});
