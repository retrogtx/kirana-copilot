import { z } from "zod";

// ── Intent enum (fixed set per AGENTS.md) ───────────────────────────────────

export const intentEnum = z.enum([
  "RECORD_SALE",
  "ADD_STOCK",
  "LEDGER_ADD_DEBT",
  "LEDGER_RECEIVE_PAYMENT",
  "CHECK_LOW_STOCK",
  "SUGGEST_REORDER",
  "DAILY_SUMMARY",
  "HELP",
]);

export type IntentType = z.infer<typeof intentEnum>;

// ── Item entry (shared by RECORD_SALE and ADD_STOCK) ────────────────────────

const itemEntry = z.object({
  name_raw: z.string().describe("The item name as spoken by the user"),
  item_id: z.string().nullable().describe("Matched item ID from catalog, or null if unknown"),
  qty: z.number().describe("Quantity"),
  unit: z.string().nullable().describe("Unit (pcs, kg, litre, etc.) or null"),
  price_total: z.number().nullable().optional().describe("Total sale price for this line (RECORD_SALE)"),
  cost_total: z.number().nullable().optional().describe("Total cost for this line (ADD_STOCK)"),
});

// ── Combined args schema ────────────────────────────────────────────────────
// All fields optional — intent determines which are used.

const argsSchema = z.object({
  // RECORD_SALE / ADD_STOCK
  items: z.array(itemEntry).optional().describe("Items for RECORD_SALE or ADD_STOCK"),
  ts: z.string().nullable().optional().describe("ISO 8601 timestamp if user specified a time"),

  // LEDGER_ADD_DEBT / LEDGER_RECEIVE_PAYMENT
  party_name: z.string().optional().describe("Name of the udhar party"),
  amount: z.number().optional().describe("Udhar/payment amount"),
  note: z.string().nullable().optional().describe("Optional note for ledger entry"),

  // CHECK_LOW_STOCK
  limit: z.number().nullable().optional().describe("Max items to return"),

  // SUGGEST_REORDER
  days: z.number().nullable().optional().describe("Days of stock to plan for"),
  lead_time_days: z.number().nullable().optional().describe("Lead time for reorder"),

  // DAILY_SUMMARY
  date: z.string().nullable().optional().describe("YYYY-MM-DD or null for today"),
});

// ── Top-level intent schema (matches AGENTS.md contract) ────────────────────

export const intentSchema = z.object({
  intent: intentEnum.describe("The detected intent"),
  confidence: z.number().describe("Confidence score 0.0 to 1.0"),
  needs_confirmation: z.boolean().describe("Whether to ask the user to confirm before executing"),
  confirmation_prompt: z.string().describe("The confirmation message to show the user (empty if no confirmation needed)"),
  args: argsSchema.describe("Intent-specific arguments"),
  reply: z.string().describe("Short reply message to send to the user"),
});

export type IntentResult = z.infer<typeof intentSchema>;
