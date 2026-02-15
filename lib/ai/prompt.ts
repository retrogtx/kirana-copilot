import type { StoreContext } from "../context";

/**
 * Build the system prompt for Claude, injecting live store context.
 */
export function buildSystemPrompt(context: StoreContext): string {
  const catalogBlock = context.items.length
    ? context.items
        .map(
          (i) =>
            `- [id:${i.id}] ${i.name} (aliases: ${i.aliases.length ? i.aliases.join(", ") : "none"}) | unit: ${i.unit ?? "pcs"} | stock: ${i.currentStock} | min: ${i.minStock}`,
        )
        .join("\n")
    : "(No items in catalog yet. If the user mentions an item, set item_id to null.)";

  const recentTxns = context.recentTransactions.length
    ? context.recentTransactions
        .map(
          (t) =>
            `- ${t.type} | item_id:${t.itemId} | qty:${t.qty}${t.price ? ` | ₹${t.price}` : ""} | ${t.ts}`,
        )
        .join("\n")
    : "(No transactions yet.)";

  const partiesBlock = context.ledgerParties.length
    ? context.ledgerParties
        .map(
          (p) =>
            `- ${p.name}${p.phone ? ` (${p.phone})` : ""} | balance: ₹${p.balance}`,
        )
        .join("\n")
    : "(No ledger parties yet.)";

  return `You are an ops assistant for a kirana (grocery) store. You help the shopkeeper manage sales, inventory, udhar (credit), and daily accounts.

RULES:
- You must output ONLY valid JSON matching the provided schema. No markdown, no explanation.
- You must NOT invent item_ids. If an item is not in the catalog below, set item_id to null. The system will ask the user to confirm or create the item.
- Keep replies SHORT, actionable, and bilingual (Hindi + English/Hinglish) if the user speaks that way.
- For udhar (LEDGER_ADD_DEBT, LEDGER_RECEIVE_PAYMENT) and any money changes, set needs_confirmation = true.
- If the user's message is ambiguous or could match multiple items, set needs_confirmation = true and ask in confirmation_prompt.
- If a sale would cause negative stock, set needs_confirmation = true and warn in confirmation_prompt.
- If you cannot determine the intent, use HELP and explain what commands are available.
- confidence should reflect how certain you are (0.0 to 1.0).

ALLOWED INTENTS:
RECORD_SALE, ADD_STOCK, LEDGER_ADD_DEBT, LEDGER_RECEIVE_PAYMENT, CHECK_LOW_STOCK, SUGGEST_REORDER, DAILY_SUMMARY, HELP

STORE CATALOG:
${catalogBlock}

RECENT TRANSACTIONS (last 20):
${recentTxns}

LEDGER PARTIES (udhar):
${partiesBlock}

TODAY: ${new Date().toISOString().slice(0, 10)}`;
}
