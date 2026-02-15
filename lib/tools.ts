import { tool } from "ai";
import { z } from "zod";
import { eq, sql, lte, and, gte, desc, or } from "drizzle-orm";
import { db } from "./db";
import {
  items,
  transactions,
  ledgerParties,
  ledgerEntries,
} from "./db/schema";

// ── Ranked matching helpers ─────────────────────────────────────────

type ItemRow = typeof items.$inferSelect;
type PartyRow = typeof ledgerParties.$inferSelect;

function rankItemMatches(
  allItems: ItemRow[],
  query: string,
  limit: number,
): ItemRow[] {
  const q = query.toLowerCase().trim();
  const scored: { item: ItemRow; score: number }[] = [];

  for (const item of allItems) {
    let score = 0;
    const nameLower = item.name.toLowerCase();
    const aliases = (
      Array.isArray(item.aliases) ? item.aliases : []
    ) as string[];

    if (nameLower === q) score = 100;
    else if (aliases.some((a) => a.toLowerCase() === q)) score = 90;
    else if (nameLower.startsWith(q)) score = 70;
    else if (aliases.some((a) => a.toLowerCase().startsWith(q))) score = 60;
    else if (nameLower.includes(q)) score = 40;
    else if (aliases.some((a) => a.toLowerCase().includes(q))) score = 30;
    else continue;

    scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}

function rankPartyMatches(
  allParties: PartyRow[],
  query: string,
  limit: number,
): PartyRow[] {
  const q = query.toLowerCase().trim();
  const scored: { party: PartyRow; score: number }[] = [];

  for (const party of allParties) {
    let score = 0;
    const nameLower = party.name.toLowerCase();

    if (nameLower === q) score = 100;
    else if (nameLower.startsWith(q)) score = 70;
    else if (q.startsWith(nameLower)) score = 50;
    else if (nameLower.includes(q)) score = 40;
    else if (q.includes(nameLower)) score = 20;
    else continue;

    scored.push({ party, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.party);
}

// ── IST timezone helper ─────────────────────────────────────────────

function getISTDayBounds(dateStr?: string | null): {
  start: Date;
  end: Date;
  label: string;
} {
  const d =
    dateStr ??
    new Date()
      .toLocaleString("en-CA", { timeZone: "Asia/Kolkata" })
      .slice(0, 10);
  return {
    start: new Date(`${d}T00:00:00.000+05:30`),
    end: new Date(`${d}T23:59:59.999+05:30`),
    label: d,
  };
}

// ── Standardized response ───────────────────────────────────────────

interface ToolResponse {
  ok: boolean;
  code: string;
  message: string;
  data?: Record<string, unknown>;
}

function success(
  code: string,
  message: string,
  data?: Record<string, unknown>,
): ToolResponse {
  return { ok: true, code, message, data };
}

function fail(
  code: string,
  message: string,
  data?: Record<string, unknown>,
): ToolResponse {
  return { ok: false, code, message, data };
}

// ── Tool factory ────────────────────────────────────────────────────

/**
 * Create the full tool set for a given store. The storeId is baked into every
 * tool via closure so Claude can never access another store's data.
 */
export function createTools(storeId: number) {
  return {
    // ── READ: Catalog ───────────────────────────────────────────────

    search_items: tool({
      description:
        "Search for items in the store catalog by name or alias. Returns ranked results (exact match > alias > prefix > substring). Use this before recording a sale to get the item ID.",
      inputSchema: z.object({
        query: z.string().describe("Item name or alias to search for"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(5)
          .describe("Max results to return (default 5)"),
      }),
      execute: async ({ query, limit }) => {
        const allItems = await db
          .select()
          .from(items)
          .where(eq(items.storeId, storeId));

        const matches = rankItemMatches(allItems, query, limit);

        if (!matches.length) {
          return fail(
            "NOT_FOUND",
            `No item matching "${query}" found in catalog.`,
          );
        }

        return success("FOUND", `Found ${matches.length} item(s).`, {
          items: matches.map((i) => ({
            id: i.id,
            name: i.name,
            aliases: i.aliases,
            unit: i.unit,
            currentStock: i.currentStock,
            minStock: i.minStock,
            lastCostPrice: i.lastCostPrice,
          })),
        });
      },
    }),

    get_inventory: tool({
      description:
        "List all items in the store with current stock levels, sorted by lowest stock first. Includes a low stock count.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(50)
          .describe("Max items to return (default 50)"),
      }),
      execute: async ({ limit }) => {
        const allItems = await db
          .select()
          .from(items)
          .where(eq(items.storeId, storeId))
          .orderBy(sql`${items.currentStock} - ${items.minStock}`)
          .limit(limit);

        const lowStockCount = allItems.filter(
          (i) => i.currentStock <= i.minStock,
        ).length;

        if (!allItems.length) {
          return success("EMPTY", "No items in catalog yet.", {
            items: [],
            lowStockCount: 0,
          });
        }

        return success("OK", `${allItems.length} item(s) in catalog.`, {
          items: allItems.map((i) => ({
            id: i.id,
            name: i.name,
            unit: i.unit,
            currentStock: i.currentStock,
            minStock: i.minStock,
          })),
          lowStockCount,
        });
      },
    }),

    check_low_stock: tool({
      description:
        "Get items at or below their minimum stock level, sorted by urgency (most critical first).",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("Max items to return (default 20)"),
      }),
      execute: async ({ limit }) => {
        const lowItems = await db
          .select()
          .from(items)
          .where(
            and(
              eq(items.storeId, storeId),
              lte(items.currentStock, items.minStock),
            ),
          )
          .orderBy(sql`${items.currentStock} - ${items.minStock}`)
          .limit(limit);

        if (!lowItems.length) {
          return success("NO_LOW_STOCK", "All items are above minimum stock.");
        }

        return success(
          "LOW_STOCK_FOUND",
          `${lowItems.length} item(s) at or below minimum stock.`,
          {
            items: lowItems.map((i) => ({
              id: i.id,
              name: i.name,
              unit: i.unit,
              currentStock: i.currentStock,
              minStock: i.minStock,
            })),
          },
        );
      },
    }),

    // ── WRITE: Inventory ────────────────────────────────────────────

    record_sale: tool({
      description:
        "Record a sale: atomically decrements stock (fails if insufficient) and logs the transaction. Use search_items first to get the item_id.",
      inputSchema: z.object({
        item_id: z.number().int().describe("The item ID from search_items"),
        qty: z
          .number()
          .int()
          .positive()
          .describe("Quantity sold (must be > 0)"),
        price: z
          .number()
          .min(0)
          .nullable()
          .describe("Total sale price in INR, or null if unknown"),
      }),
      execute: async ({ item_id, qty, price }) => {
        // Atomic guarded update — only decrements if store owns item AND stock >= qty
        const updated = await db
          .update(items)
          .set({ currentStock: sql`${items.currentStock} - ${qty}` })
          .where(
            and(
              eq(items.id, item_id),
              eq(items.storeId, storeId),
              gte(items.currentStock, qty),
            ),
          )
          .returning({
            id: items.id,
            name: items.name,
            newStock: items.currentStock,
            minStock: items.minStock,
            unit: items.unit,
          });

        if (!updated.length) {
          // Check why it failed
          const [item] = await db
            .select()
            .from(items)
            .where(and(eq(items.id, item_id), eq(items.storeId, storeId)))
            .limit(1);

          if (!item) return fail("ITEM_NOT_FOUND", "Item not found in your store.");

          return fail(
            "INSUFFICIENT_STOCK",
            `Not enough stock for ${item.name}. Current: ${item.currentStock}, needed: ${qty}.`,
            { currentStock: item.currentStock },
          );
        }

        // Log transaction
        await db.insert(transactions).values({
          storeId,
          type: "SALE",
          itemId: item_id,
          qty,
          price: price?.toString() ?? null,
        });

        const { name, newStock, minStock } = updated[0];
        const warning =
          newStock <= minStock
            ? `Low stock alert: ${name} is now at ${newStock} (min: ${minStock}).`
            : null;

        return success(
          "SALE_RECORDED",
          `Sale recorded: ${name} x${qty}. Stock now: ${newStock}.`,
          { newStock, warning },
        );
      },
    }),

    record_sale_batch: tool({
      description:
        "Record multiple sales in one call. Each item is atomically guarded against insufficient stock. Use search_items first to get item IDs.",
      inputSchema: z.object({
        items: z
          .array(
            z.object({
              item_id: z.number().int().describe("Item ID"),
              qty: z.number().int().positive().describe("Quantity sold"),
              price: z
                .number()
                .min(0)
                .nullable()
                .describe("Total price or null"),
            }),
          )
          .min(1)
          .max(20)
          .describe("List of items to sell"),
      }),
      execute: async ({ items: saleItems }) => {
        const recorded: string[] = [];
        const failed: string[] = [];
        const warnings: string[] = [];

        for (const entry of saleItems) {
          const updated = await db
            .update(items)
            .set({
              currentStock: sql`${items.currentStock} - ${entry.qty}`,
            })
            .where(
              and(
                eq(items.id, entry.item_id),
                eq(items.storeId, storeId),
                gte(items.currentStock, entry.qty),
              ),
            )
            .returning({
              id: items.id,
              name: items.name,
              newStock: items.currentStock,
              minStock: items.minStock,
            });

          if (!updated.length) {
            const [item] = await db
              .select({ name: items.name, currentStock: items.currentStock })
              .from(items)
              .where(and(eq(items.id, entry.item_id), eq(items.storeId, storeId)))
              .limit(1);
            failed.push(
              item
                ? `${item.name} (stock: ${item.currentStock}, needed: ${entry.qty})`
                : `item#${entry.item_id} (not found)`,
            );
            continue;
          }

          await db.insert(transactions).values({
            storeId,
            type: "SALE",
            itemId: entry.item_id,
            qty: entry.qty,
            price: entry.price?.toString() ?? null,
          });

          const { name, newStock, minStock } = updated[0];
          recorded.push(`${name} x${entry.qty}`);
          if (newStock <= minStock) {
            warnings.push(`${name}: ${newStock} left (min: ${minStock})`);
          }
        }

        const parts: string[] = [];
        if (recorded.length) parts.push(`Sold: ${recorded.join(", ")}.`);
        if (failed.length) parts.push(`Failed: ${failed.join(", ")}.`);
        if (warnings.length) parts.push(`Low stock: ${warnings.join(", ")}.`);

        return recorded.length
          ? success("SALE_RECORDED", parts.join(" "), {
              recorded: recorded.length,
              failed: failed.length,
            })
          : fail("SALE_FAILED", parts.join(" "));
      },
    }),

    add_stock: tool({
      description:
        "Add stock for an item. If item_id is provided, uses it directly. Otherwise searches by name and auto-creates if not found.",
      inputSchema: z.object({
        item_id: z
          .number()
          .int()
          .nullable()
          .describe("Item ID (preferred — use search_items first). Null to match by name."),
        name: z.string().describe("Item name (used to find or create if item_id is null)"),
        qty: z
          .number()
          .positive()
          .describe("Quantity to add (must be > 0)"),
        unit: z
          .string()
          .nullable()
          .describe("Unit (pcs, kg, litre, etc.)"),
        cost_per_unit: z
          .number()
          .min(0)
          .nullable()
          .describe("Cost per unit in INR, or null if unknown"),
      }),
      execute: async ({ item_id, name, qty, unit, cost_per_unit }) => {
        let item: ItemRow | undefined;
        let created = false;

        // If item_id given, verify it belongs to this store
        if (item_id != null) {
          const [found] = await db
            .select()
            .from(items)
            .where(and(eq(items.id, item_id), eq(items.storeId, storeId)))
            .limit(1);
          item = found;
        }

        // If no item_id or not found, try ranked matching by name
        if (!item) {
          const allItems = await db
            .select()
            .from(items)
            .where(eq(items.storeId, storeId));

          const matches = rankItemMatches(allItems, name, 3);

          if (matches.length > 1) {
            // Multiple close matches — check if top match is exact
            const topName = matches[0].name.toLowerCase();
            const queryLower = name.toLowerCase().trim();
            const topAliases = (
              Array.isArray(matches[0].aliases) ? matches[0].aliases : []
            ) as string[];

            if (
              topName === queryLower ||
              topAliases.some((a) => a.toLowerCase() === queryLower)
            ) {
              item = matches[0];
            } else {
              // Ambiguous — return candidates for disambiguation
              return fail(
                "AMBIGUOUS_MATCH",
                `Multiple items match "${name}". Which one?`,
                {
                  candidates: matches.map((m) => ({
                    id: m.id,
                    name: m.name,
                    aliases: m.aliases,
                  })),
                },
              );
            }
          } else if (matches.length === 1) {
            item = matches[0];
          }
        }

        // Auto-create if not found
        if (!item) {
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
        return success(
          created ? "ITEM_CREATED_AND_STOCKED" : "STOCK_ADDED",
          `${created ? "New item created. " : ""}Stock added: ${item.name} +${qty}. Stock: ${item.currentStock} -> ${newStock}.`,
          { itemId: item.id, newStock, created },
        );
      },
    }),

    add_stock_batch: tool({
      description:
        "Add stock for multiple items in one call. Auto-creates items if not found.",
      inputSchema: z.object({
        items: z
          .array(
            z.object({
              name: z.string().describe("Item name"),
              qty: z.number().positive().describe("Quantity to add"),
              unit: z.string().nullable().describe("Unit or null"),
              cost_per_unit: z.number().min(0).nullable().describe("Cost per unit or null"),
            }),
          )
          .min(1)
          .max(20)
          .describe("List of items to stock"),
      }),
      execute: async ({ items: stockItems }) => {
        const results: string[] = [];
        const created: string[] = [];

        for (const entry of stockItems) {
          const allItems = await db
            .select()
            .from(items)
            .where(eq(items.storeId, storeId));

          const matches = rankItemMatches(allItems, entry.name, 1);
          let item = matches[0];
          let wasCreated = false;

          if (!item) {
            const [newItem] = await db
              .insert(items)
              .values({
                storeId,
                name: entry.name.trim(),
                aliases: [],
                unit: entry.unit,
                currentStock: 0,
                minStock: 5,
                lastCostPrice: entry.cost_per_unit?.toString() ?? null,
              })
              .returning();
            item = newItem;
            wasCreated = true;
            created.push(entry.name);
          }

          await db
            .update(items)
            .set({
              currentStock: sql`${items.currentStock} + ${entry.qty}`,
              lastCostPrice:
                entry.cost_per_unit?.toString() ?? item.lastCostPrice,
            })
            .where(eq(items.id, item.id));

          const totalCost = entry.cost_per_unit
            ? entry.cost_per_unit * entry.qty
            : null;
          await db.insert(transactions).values({
            storeId,
            type: "STOCK_IN",
            itemId: item.id,
            qty: entry.qty,
            price: totalCost?.toString() ?? null,
          });

          results.push(
            `${item.name} +${entry.qty}${wasCreated ? " (new)" : ""}`,
          );
        }

        let msg = `Stock added: ${results.join(", ")}.`;
        if (created.length) msg += ` New items: ${created.join(", ")}.`;

        return success("STOCK_ADDED", msg, {
          added: results.length,
          created: created.length,
        });
      },
    }),

    // ── READ: Ledger ────────────────────────────────────────────────

    lookup_party: tool({
      description:
        "Look up a customer/party by name and get their udhar balance. Returns ranked matches for disambiguation.",
      inputSchema: z.object({
        name: z.string().describe("Customer/party name to search for"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(5)
          .default(3)
          .describe("Max matches to return (default 3)"),
      }),
      execute: async ({ name, limit }) => {
        const allParties = await db
          .select()
          .from(ledgerParties)
          .where(eq(ledgerParties.storeId, storeId));

        const matches = rankPartyMatches(allParties, name, limit);

        if (!matches.length) {
          return fail(
            "NOT_FOUND",
            `No customer named "${name}" found.`,
          );
        }

        // Get balances and recent entries for all matches
        const results = [];
        for (const party of matches) {
          const [{ balance }] = await db
            .select({
              balance:
                sql<number>`COALESCE(SUM(${ledgerEntries.deltaAmount}::numeric), 0)`,
            })
            .from(ledgerEntries)
            .where(eq(ledgerEntries.partyId, party.id));

          const recentEntries = await db
            .select()
            .from(ledgerEntries)
            .where(eq(ledgerEntries.partyId, party.id))
            .orderBy(desc(ledgerEntries.ts))
            .limit(5);

          results.push({
            id: party.id,
            name: party.name,
            phone: party.phone,
            balance: Number(balance),
            recentEntries: recentEntries.map((e) => ({
              id: e.id,
              amount: Number(e.deltaAmount),
              note: e.note,
              ts: e.ts,
            })),
          });
        }

        if (results.length === 1) {
          const p = results[0];
          return success(
            "FOUND",
            `${p.name}: balance ₹${p.balance}.`,
            { party: p },
          );
        }

        return success(
          "MULTIPLE_MATCHES",
          `Found ${results.length} matches for "${name}".`,
          { parties: results },
        );
      },
    }),

    list_parties: tool({
      description:
        "List all customers/parties with udhar balances, sorted by highest outstanding balance first.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("Max parties to return (default 20)"),
      }),
      execute: async ({ limit }) => {
        const allParties = await db
          .select({
            id: ledgerParties.id,
            name: ledgerParties.name,
            phone: ledgerParties.phone,
            balance:
              sql<number>`COALESCE((SELECT SUM(${ledgerEntries.deltaAmount}::numeric) FROM ${ledgerEntries} WHERE ${ledgerEntries.partyId} = ${ledgerParties.id}), 0)`,
          })
          .from(ledgerParties)
          .where(eq(ledgerParties.storeId, storeId))
          .orderBy(
            sql`COALESCE((SELECT SUM(${ledgerEntries.deltaAmount}::numeric) FROM ${ledgerEntries} WHERE ${ledgerEntries.partyId} = ${ledgerParties.id}), 0) DESC`,
          )
          .limit(limit);

        if (!allParties.length) {
          return success("EMPTY", "No customers in ledger yet.", {
            parties: [],
          });
        }

        const totalOutstanding = allParties.reduce(
          (sum, p) => sum + Math.max(Number(p.balance), 0),
          0,
        );

        return success(
          "OK",
          `${allParties.length} customer(s). Total outstanding: ₹${totalOutstanding}.`,
          {
            parties: allParties.map((p) => ({
              id: p.id,
              name: p.name,
              phone: p.phone,
              balance: Number(p.balance),
            })),
            totalOutstanding,
          },
        );
      },
    }),

    // ── WRITE: Ledger ───────────────────────────────────────────────

    add_debt: tool({
      description:
        "Record udhar (credit) for a customer. Auto-creates customer if new. Uses ranked matching for existing customers.",
      inputSchema: z.object({
        party_name: z.string().describe("Customer name"),
        amount: z
          .number()
          .positive()
          .describe("Amount they owe (must be > 0)"),
        note: z
          .string()
          .nullable()
          .describe("Optional note about the debt"),
      }),
      execute: async ({ party_name, amount, note }) => {
        const allParties = await db
          .select()
          .from(ledgerParties)
          .where(eq(ledgerParties.storeId, storeId));

        const matches = rankPartyMatches(allParties, party_name, 3);
        let party: PartyRow | undefined;

        if (matches.length > 1) {
          // Check if top match is exact
          if (matches[0].name.toLowerCase() === party_name.toLowerCase().trim()) {
            party = matches[0];
          } else {
            return fail(
              "AMBIGUOUS_MATCH",
              `Multiple customers match "${party_name}". Which one?`,
              {
                candidates: matches.map((m) => ({
                  id: m.id,
                  name: m.name,
                })),
              },
            );
          }
        } else if (matches.length === 1) {
          party = matches[0];
        }

        if (!party) {
          const [newParty] = await db
            .insert(ledgerParties)
            .values({ storeId, name: party_name.trim() })
            .returning();
          party = newParty;
        }

        await db.insert(ledgerEntries).values({
          partyId: party.id,
          deltaAmount: amount.toString(),
          note,
        });

        const [{ balance }] = await db
          .select({
            balance:
              sql<number>`COALESCE(SUM(${ledgerEntries.deltaAmount}::numeric), 0)`,
          })
          .from(ledgerEntries)
          .where(eq(ledgerEntries.partyId, party.id));

        return success(
          "DEBT_ADDED",
          `Udhar recorded: ${party.name} ko ₹${amount} likh diya. Total balance: ₹${Number(balance)}.`,
          { partyId: party.id, newBalance: Number(balance) },
        );
      },
    }),

    receive_payment: tool({
      description:
        "Record a payment received from a customer (reduces udhar). Uses ranked matching. Warns if balance goes negative.",
      inputSchema: z.object({
        party_name: z.string().describe("Customer name"),
        amount: z
          .number()
          .positive()
          .describe("Amount received (must be > 0)"),
        note: z.string().nullable().describe("Optional note"),
      }),
      execute: async ({ party_name, amount, note }) => {
        const allParties = await db
          .select()
          .from(ledgerParties)
          .where(eq(ledgerParties.storeId, storeId));

        const matches = rankPartyMatches(allParties, party_name, 3);

        if (!matches.length) {
          return fail(
            "PARTY_NOT_FOUND",
            `Customer "${party_name}" not found in ledger. Check the name.`,
          );
        }

        let party = matches[0];
        if (
          matches.length > 1 &&
          party.name.toLowerCase() !== party_name.toLowerCase().trim()
        ) {
          return fail(
            "AMBIGUOUS_MATCH",
            `Multiple customers match "${party_name}". Which one?`,
            {
              candidates: matches.map((m) => ({ id: m.id, name: m.name })),
            },
          );
        }

        await db.insert(ledgerEntries).values({
          partyId: party.id,
          deltaAmount: (-amount).toString(),
          note,
        });

        const [{ balance }] = await db
          .select({
            balance:
              sql<number>`COALESCE(SUM(${ledgerEntries.deltaAmount}::numeric), 0)`,
          })
          .from(ledgerEntries)
          .where(eq(ledgerEntries.partyId, party.id));

        const numBalance = Number(balance);
        const warning =
          numBalance < 0
            ? ` Warning: balance is negative (₹${numBalance}) — shop owes ${party.name}.`
            : "";

        return success(
          "PAYMENT_RECEIVED",
          `Payment received: ${party.name} se ₹${amount} mil gaye. Remaining balance: ₹${numBalance}.${warning}`,
          { partyId: party.id, newBalance: numBalance },
        );
      },
    }),

    // ── Summary ─────────────────────────────────────────────────────

    get_daily_summary: tool({
      description:
        "Get a summary of today's (or a specific date's) activity. Uses IST (Asia/Kolkata) timezone for day boundaries.",
      inputSchema: z.object({
        date: z
          .string()
          .nullable()
          .describe("Date in YYYY-MM-DD format, or null for today (IST)"),
      }),
      execute: async ({ date }) => {
        const { start: dayStart, end: dayEnd, label: dateLabel } =
          getISTDayBounds(date);

        // Transactions for the day
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
              gte(transactions.ts, dayStart),
              lte(transactions.ts, dayEnd),
            ),
          );

        const sales = dayTxns.filter((t) => t.type === "SALE");
        const stockIns = dayTxns.filter((t) => t.type === "STOCK_IN");
        const adjustments = dayTxns.filter((t) => t.type === "ADJUST");
        const totalSaleAmount = sales.reduce(
          (sum, t) => sum + (t.price ? parseFloat(t.price) : 0),
          0,
        );
        const totalSaleQty = sales.reduce((sum, t) => sum + t.qty, 0);

        // Ledger activity scoped to this store's parties
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
              and(
                or(...partyIds.map((id) => eq(ledgerEntries.partyId, id))),
                gte(ledgerEntries.ts, dayStart),
                lte(ledgerEntries.ts, dayEnd),
              ),
            );

          newUdhar = dayLedger
            .filter((e) => parseFloat(e.deltaAmount) > 0)
            .reduce((sum, e) => sum + parseFloat(e.deltaAmount), 0);
          received = dayLedger
            .filter((e) => parseFloat(e.deltaAmount) < 0)
            .reduce((sum, e) => sum + Math.abs(parseFloat(e.deltaAmount)), 0);
        }

        // Low stock count
        const lowItems = await db
          .select({ id: items.id })
          .from(items)
          .where(
            and(
              eq(items.storeId, storeId),
              lte(items.currentStock, items.minStock),
            ),
          );

        return success("SUMMARY_GENERATED", `Hisaab for ${dateLabel}.`, {
          date: dateLabel,
          sales: {
            count: sales.length,
            totalQty: totalSaleQty,
            totalAmount: totalSaleAmount,
          },
          stockIns: { count: stockIns.length },
          adjustments: { count: adjustments.length },
          ledger: { newUdhar, paymentsReceived: received },
          lowStockCount: lowItems.length,
        });
      },
    }),

    suggest_reorder: tool({
      description:
        "Suggest items to reorder based on current stock vs minimum stock. Returns suggested quantities.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Max items to suggest (default 10)"),
      }),
      execute: async ({ limit }) => {
        const lowItems = await db
          .select()
          .from(items)
          .where(
            and(
              eq(items.storeId, storeId),
              lte(items.currentStock, items.minStock),
            ),
          )
          .orderBy(sql`${items.currentStock} - ${items.minStock}`)
          .limit(limit);

        if (!lowItems.length) {
          return success(
            "NO_REORDER_NEEDED",
            "No reorder needed. All items above minimum stock.",
          );
        }

        const suggestions = lowItems.map((i) => {
          const suggestedQty = Math.max(
            i.minStock * 2 - i.currentStock,
            i.minStock,
          );
          return {
            id: i.id,
            name: i.name,
            unit: i.unit,
            currentStock: i.currentStock,
            minStock: i.minStock,
            suggestedQty,
            lastCostPrice: i.lastCostPrice,
          };
        });

        return success(
          "REORDER_SUGGESTED",
          `${suggestions.length} item(s) need reordering.`,
          { suggestions },
        );
      },
    }),

    // ── Catalog management ──────────────────────────────────────────

    add_item: tool({
      description:
        "Explicitly create a new item in the catalog without adding stock. Use when user wants to register a product.",
      inputSchema: z.object({
        name: z.string().describe("Item name"),
        aliases: z
          .array(z.string())
          .default([])
          .describe("Alternative names / Hindi names"),
        unit: z
          .string()
          .nullable()
          .describe("Unit (pcs, kg, litre, etc.)"),
        min_stock: z
          .number()
          .int()
          .min(0)
          .default(5)
          .describe("Minimum stock threshold (default 5)"),
      }),
      execute: async ({ name, aliases, unit, min_stock }) => {
        // Check for duplicates
        const allItems = await db
          .select()
          .from(items)
          .where(eq(items.storeId, storeId));

        const existing = rankItemMatches(allItems, name, 1);
        if (
          existing.length &&
          existing[0].name.toLowerCase() === name.toLowerCase().trim()
        ) {
          return fail(
            "ITEM_EXISTS",
            `"${name}" already exists (id: ${existing[0].id}).`,
            { existingId: existing[0].id },
          );
        }

        const [newItem] = await db
          .insert(items)
          .values({
            storeId,
            name: name.trim(),
            aliases,
            unit,
            currentStock: 0,
            minStock: min_stock,
          })
          .returning();

        return success(
          "ITEM_CREATED",
          `Item added: ${newItem.name} (id: ${newItem.id}, unit: ${unit ?? "pcs"}, min stock: ${min_stock}${aliases.length ? `, aliases: ${aliases.join(", ")}` : ""}).`,
          { itemId: newItem.id },
        );
      },
    }),

    add_item_alias: tool({
      description:
        'Add an alias (Hindi name, abbreviation, etc.) to an existing item. E.g., map "doodh" to "Amul Milk 500ml".',
      inputSchema: z.object({
        item_id: z.number().int().describe("Item ID to add alias to"),
        alias: z.string().describe("New alias to add"),
      }),
      execute: async ({ item_id, alias }) => {
        const [item] = await db
          .select()
          .from(items)
          .where(and(eq(items.id, item_id), eq(items.storeId, storeId)))
          .limit(1);

        if (!item)
          return fail("ITEM_NOT_FOUND", "Item not found in your store.");

        const currentAliases = (
          Array.isArray(item.aliases) ? item.aliases : []
        ) as string[];

        if (
          currentAliases.some((a) => a.toLowerCase() === alias.toLowerCase())
        ) {
          return fail(
            "ALIAS_EXISTS",
            `"${alias}" is already an alias for ${item.name}.`,
          );
        }

        const newAliases = [...currentAliases, alias.trim()];
        await db
          .update(items)
          .set({ aliases: newAliases })
          .where(eq(items.id, item.id));

        return success(
          "ALIAS_ADDED",
          `Alias added: "${alias}" -> ${item.name}. All aliases: ${newAliases.join(", ")}.`,
          { itemId: item.id, aliases: newAliases },
        );
      },
    }),

    set_min_stock: tool({
      description:
        "Update the minimum stock threshold for an item. This controls low-stock alerts and reorder suggestions.",
      inputSchema: z.object({
        item_id: z.number().int().describe("Item ID"),
        min_stock: z
          .number()
          .int()
          .min(0)
          .describe("New minimum stock value"),
      }),
      execute: async ({ item_id, min_stock }) => {
        const [item] = await db
          .select()
          .from(items)
          .where(and(eq(items.id, item_id), eq(items.storeId, storeId)))
          .limit(1);

        if (!item)
          return fail("ITEM_NOT_FOUND", "Item not found in your store.");

        const oldMin = item.minStock;
        await db
          .update(items)
          .set({ minStock: min_stock })
          .where(eq(items.id, item.id));

        return success(
          "MIN_STOCK_SET",
          `Min stock for ${item.name}: ${oldMin} -> ${min_stock}.`,
          { itemId: item.id, oldMinStock: oldMin, newMinStock: min_stock },
        );
      },
    }),

    adjust_stock: tool({
      description:
        "Correct stock for damaged goods, expired items, or count errors. Positive qty adds, negative removes. Guards against going below zero.",
      inputSchema: z.object({
        item_id: z.number().int().describe("Item ID"),
        qty: z
          .number()
          .int()
          .describe(
            "Adjustment quantity (positive to add, negative to remove)",
          ),
        reason: z
          .string()
          .describe("Reason (damaged, expired, count correction, etc.)"),
      }),
      execute: async ({ item_id, qty, reason }) => {
        if (qty === 0)
          return fail(
            "INVALID_INPUT",
            "Adjustment quantity cannot be zero.",
          );

        const [item] = await db
          .select()
          .from(items)
          .where(and(eq(items.id, item_id), eq(items.storeId, storeId)))
          .limit(1);

        if (!item)
          return fail("ITEM_NOT_FOUND", "Item not found in your store.");

        // For negative adjustments, guard against going below zero
        if (qty < 0) {
          const updated = await db
            .update(items)
            .set({
              currentStock: sql`${items.currentStock} + ${qty}`,
            })
            .where(
              and(
                eq(items.id, item_id),
                gte(items.currentStock, Math.abs(qty)),
              ),
            )
            .returning({ newStock: items.currentStock });

          if (!updated.length) {
            return fail(
              "INSUFFICIENT_STOCK",
              `Cannot remove ${Math.abs(qty)} — only ${item.currentStock} in stock.`,
            );
          }
        } else {
          await db
            .update(items)
            .set({
              currentStock: sql`${items.currentStock} + ${qty}`,
            })
            .where(eq(items.id, item_id));
        }

        await db.insert(transactions).values({
          storeId,
          type: "ADJUST",
          itemId: item_id,
          qty,
          price: null,
        });

        const direction = qty > 0 ? "added" : "removed";
        return success(
          "STOCK_ADJUSTED",
          `Stock adjusted: ${Math.abs(qty)} ${item.unit ?? "pcs"} ${direction} for ${item.name} (${reason}).`,
          { itemId: item_id, adjustment: qty },
        );
      },
    }),

    // ── Audit & Undo ────────────────────────────────────────────────

    list_recent_actions: tool({
      description:
        "List recent transactions and ledger entries with their IDs. Use before undo_action to show the user what can be undone.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(5)
          .describe("Number of recent actions to show (default 5)"),
      }),
      execute: async ({ limit }) => {
        // Recent transactions
        const recentTxns = await db
          .select({
            id: transactions.id,
            type: transactions.type,
            itemId: transactions.itemId,
            qty: transactions.qty,
            price: transactions.price,
            ts: transactions.ts,
          })
          .from(transactions)
          .where(eq(transactions.storeId, storeId))
          .orderBy(desc(transactions.ts))
          .limit(limit);

        // Resolve item names
        const itemIds = [...new Set(recentTxns.map((t) => t.itemId))];
        const itemMap = new Map<number, string>();
        if (itemIds.length) {
          const itemRows = await db
            .select({ id: items.id, name: items.name })
            .from(items)
            .where(or(...itemIds.map((id) => eq(items.id, id))));
          for (const row of itemRows) itemMap.set(row.id, row.name);
        }

        // Recent ledger entries (via store's parties)
        const storePartyIds = await db
          .select({ id: ledgerParties.id })
          .from(ledgerParties)
          .where(eq(ledgerParties.storeId, storeId));

        const pIds = storePartyIds.map((p) => p.id);
        let recentLedger: {
          id: number;
          partyId: number;
          deltaAmount: string;
          note: string | null;
          ts: Date;
        }[] = [];

        if (pIds.length) {
          recentLedger = await db
            .select({
              id: ledgerEntries.id,
              partyId: ledgerEntries.partyId,
              deltaAmount: ledgerEntries.deltaAmount,
              note: ledgerEntries.note,
              ts: ledgerEntries.ts,
            })
            .from(ledgerEntries)
            .where(or(...pIds.map((id) => eq(ledgerEntries.partyId, id))))
            .orderBy(desc(ledgerEntries.ts))
            .limit(limit);
        }

        // Resolve party names
        const partyMap = new Map<number, string>();
        if (recentLedger.length) {
          const partyIds = [
            ...new Set(recentLedger.map((l) => l.partyId)),
          ];
          const partyRows = await db
            .select({ id: ledgerParties.id, name: ledgerParties.name })
            .from(ledgerParties)
            .where(or(...partyIds.map((id) => eq(ledgerParties.id, id))));
          for (const row of partyRows) partyMap.set(row.id, row.name);
        }

        return success("RECENT_LISTED", "Recent actions retrieved.", {
          transactions: recentTxns.map((t) => ({
            id: t.id,
            label: `T${t.id}`,
            type: t.type,
            itemName: itemMap.get(t.itemId) ?? `item#${t.itemId}`,
            qty: t.qty,
            price: t.price,
            ts: t.ts,
          })),
          ledgerEntries: recentLedger.map((l) => ({
            id: l.id,
            label: `L${l.id}`,
            type: parseFloat(l.deltaAmount) > 0 ? "UDHAR" : "PAYMENT",
            partyName: partyMap.get(l.partyId) ?? `party#${l.partyId}`,
            amount: Math.abs(parseFloat(l.deltaAmount)),
            note: l.note,
            ts: l.ts,
          })),
        });
      },
    }),

    undo_action: tool({
      description:
        "Undo a recent transaction or ledger entry by its ID. Use list_recent_actions first to show available actions. Transactions: reverses stock change and deletes the record. Ledger: deletes the entry.",
      inputSchema: z.object({
        action_type: z
          .enum(["transaction", "ledger"])
          .describe("Type: 'transaction' (T-prefix) or 'ledger' (L-prefix)"),
        action_id: z.number().int().describe("ID of the action to undo"),
      }),
      execute: async ({ action_type, action_id }) => {
        if (action_type === "transaction") {
          const [txn] = await db
            .select()
            .from(transactions)
            .where(
              and(
                eq(transactions.id, action_id),
                eq(transactions.storeId, storeId),
              ),
            )
            .limit(1);

          if (!txn)
            return fail(
              "NOT_FOUND",
              `Transaction T${action_id} not found.`,
            );

          // Reverse stock change
          if (txn.type === "SALE") {
            await db
              .update(items)
              .set({
                currentStock: sql`${items.currentStock} + ${txn.qty}`,
              })
              .where(eq(items.id, txn.itemId));
          } else if (txn.type === "STOCK_IN") {
            const updated = await db
              .update(items)
              .set({
                currentStock: sql`${items.currentStock} - ${txn.qty}`,
              })
              .where(
                and(
                  eq(items.id, txn.itemId),
                  gte(items.currentStock, txn.qty),
                ),
              )
              .returning();

            if (!updated.length) {
              return fail(
                "UNDO_FAILED",
                `Cannot undo STOCK_IN T${action_id} — current stock is less than ${txn.qty}.`,
              );
            }
          } else if (txn.type === "ADJUST") {
            // Reverse: if qty was +5, subtract 5; if qty was -3, add 3
            await db
              .update(items)
              .set({
                currentStock: sql`${items.currentStock} - ${txn.qty}`,
              })
              .where(eq(items.id, txn.itemId));
          }

          // Delete transaction
          await db
            .delete(transactions)
            .where(eq(transactions.id, action_id));

          const [item] = await db
            .select({ name: items.name })
            .from(items)
            .where(eq(items.id, txn.itemId))
            .limit(1);

          return success(
            "ACTION_UNDONE",
            `Undone: ${txn.type} of ${item?.name ?? "unknown"} x${txn.qty} (T${action_id}).`,
          );
        } else {
          // Ledger entry undo
          const [entry] = await db
            .select()
            .from(ledgerEntries)
            .where(eq(ledgerEntries.id, action_id))
            .limit(1);

          if (!entry)
            return fail(
              "NOT_FOUND",
              `Ledger entry L${action_id} not found.`,
            );

          // Verify party belongs to this store
          const [party] = await db
            .select()
            .from(ledgerParties)
            .where(
              and(
                eq(ledgerParties.id, entry.partyId),
                eq(ledgerParties.storeId, storeId),
              ),
            )
            .limit(1);

          if (!party)
            return fail(
              "NOT_FOUND",
              `Ledger entry L${action_id} doesn't belong to your store.`,
            );

          await db
            .delete(ledgerEntries)
            .where(eq(ledgerEntries.id, action_id));

          const amt = parseFloat(entry.deltaAmount);
          const label = amt > 0 ? "udhar" : "payment";

          return success(
            "ACTION_UNDONE",
            `Undone: ${label} of ₹${Math.abs(amt)} for ${party.name} (L${action_id}).`,
          );
        }
      },
    }),
  };
}
