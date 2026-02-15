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

// ── Users (Telegram identity) ───────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  username: text("username"),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Organizations ───────────────────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Org members (links users to orgs with a role) ───────────────────────────

export const orgMembers = pgTable("org_members", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id")
    .notNull()
    .references(() => organizations.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  role: text("role").notNull().default("member"), // "admin" | "member"
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

// ── Stores (one per org, linked via orgId) ──────────────────────────────────

export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id")
    .notNull()
    .references(() => organizations.id),
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

// ── Auto-reorders (items ordered from Amazon / JioMart etc.) ────────────────

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id")
    .notNull()
    .references(() => stores.id),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id),
  qty: integer("qty").notNull(),
  source: text("source").notNull(), // AMAZON_IN | JIOMART | BIGBASKET
  searchUrl: text("search_url").notNull(),
  estimatedCost: numeric("estimated_cost"),
  status: text("status").notNull().default("PLACED"), // PLACED | CONFIRMED | DELIVERED | CANCELLED
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
