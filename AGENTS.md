# Kirana Copilot (Build India Hackathon) — CLAUDE.md

## One-liner
Kirana Copilot is a Telegram-first, voice-capable, multilingual (Hindi + English/Hinglish) ops assistant for kirana stores that turns natural messages into validated actions: sales logging, inventory updates, udhar ledger, reorder suggestions, and daily hisaab.

## Why this exists
Kirana shops run on fast informal workflows (voice notes, mental math, udhar in notebooks). Existing software often fails because it requires rigid data entry and training. We use AI as an interface + structuring layer, but keep it reliable via bounded intents, schema validation, and confirmations.

## Product scope (MVP we will ship)
Primary channel: Telegram bot (WhatsApp later).
Core flows:
1. Record sale: “Aaj Maggi 12, Dairy Milk 6 bik gaye”
2. Add stock: “Milk 10 aaya”
3. Udhar ledger: “Ramesh ko 450 udhar likh do” and “Ramesh se 200 mil gaye”
4. Low stock check: “Kya kya khatam ho raha hai?”
5. Reorder suggestions: “Kal ke liye reorder list bana do”
6. Daily summary: “Aaj ka hisaab”

Voice:
- Accept Telegram voice notes
- Transcribe via STT
- Feed transcript into same intent pipeline

Non-goals (for hackathon)
- Payments, UPI, invoicing compliance, GST filing
- Multi-store enterprise features
- Perfect catalog onboarding. We start small with seeded SKUs + aliasing.

## System architecture (high level)
- Telegram Bot Worker: receives updates (long polling), downloads voice files, sends replies
- Core Backend: intent extraction (Claude), action executor (inventory/ledger rules), DB
- DB: SQLite for speed (Postgres optional)
- Optional Web Dashboard: read-only views (today, low stock, ledger)

## Data model (minimal)
Items:
- id, name, aliases[], unit, current_stock, min_stock, last_cost_price(optional)

Transactions:
- id, type (SALE | STOCK_IN | ADJUST), item_id, qty, price(optional), ts

LedgerParty:
- id, name, phone(optional)

LedgerEntry:
- id, party_id, delta_amount (positive means they owe shop), note, ts

Reminders:
- id, party_id, amount(optional), due_ts, status

## Reliability rules (must-have)
- Bounded intents only. No open-domain assistant behavior.
- Every action must be schema-validated.
- Confirmations required when:
  - Money/udhar changes
  - Ambiguous SKU match (multiple candidates)
  - Negative stock would occur
- If uncertain: ask a single clarifying question, do not guess silently.

## Intent set (fixed)
We only allow these intents from Claude:
- RECORD_SALE
- ADD_STOCK
- LEDGER_ADD_DEBT
- LEDGER_RECEIVE_PAYMENT
- CHECK_LOW_STOCK
- SUGGEST_REORDER
- DAILY_SUMMARY
- HELP (explain commands)

## Claude interface contract (structured output)
Claude must return a single JSON object that matches this shape:

{
  "intent": "RECORD_SALE | ADD_STOCK | LEDGER_ADD_DEBT | LEDGER_RECEIVE_PAYMENT | CHECK_LOW_STOCK | SUGGEST_REORDER | DAILY_SUMMARY | HELP",
  "confidence": 0.0,
  "needs_confirmation": true,
  "confirmation_prompt": "string",
  "args": { ... },
  "reply": "string"
}

Args by intent:

RECORD_SALE:
{
  "items": [
    { "name_raw": "string", "item_id": "string|null", "qty": number, "unit": "string|null", "price_total": number|null }
  ],
  "ts": "iso8601|null"
}

ADD_STOCK:
{
  "items": [
    { "name_raw": "string", "item_id": "string|null", "qty": number, "unit": "string|null", "cost_total": number|null }
  ]
}

LEDGER_ADD_DEBT:
{ "party_name": "string", "amount": number, "note": "string|null" }

LEDGER_RECEIVE_PAYMENT:
{ "party_name": "string", "amount": number, "note": "string|null" }

CHECK_LOW_STOCK:
{ "limit": number|null }

SUGGEST_REORDER:
{ "days": number|null, "lead_time_days": number|null, "limit": number|null }

DAILY_SUMMARY:
{ "date": "YYYY-MM-DD|null" }

HELP:
{ }

## Prompting guidance (what Claude should be told)
- You are an ops assistant for a kirana store.
- You must output ONLY JSON with the schema above.
- You must not invent item_ids. If unknown, set item_id = null and ask to confirm mapping.
- Use the store’s item aliases and recent transactions context.
- Keep replies short, actionable, and bilingual only if user is bilingual.

## Application flow (runtime)
1. Telegram update arrives (text or voice).
2. If voice: download file from Telegram and transcribe to text.
3. Build context:
   - shop catalog (items + aliases)
   - recent txns (last N)
   - known ledger parties
4. Send message + context + tool schema to Claude.
5. If needs_confirmation:
   - store pending action keyed by chat_id
   - ask confirm with inline keyboard (Confirm, Edit, Cancel)
6. On confirm:
   - execute intent via Action Executor
   - persist to DB
   - send result + suggestions (low stock, reorder)
7. Scheduler sends due reminders (optional).

## Success criteria (demo-ready)
- Works end-to-end on Telegram with 6 core commands
- Handles at least 20 seeded SKUs + alias mapping
- Produces consistent confirmations and never silently corrupts data
- Shows a clear “before vs after” in 90 seconds: voice note -> structured actions -> hisaab

## Environment variables
TELEGRAM_BOT_TOKEN=...
ANTHROPIC_API_KEY=...
STT_API_KEY=... (optional)
DATABASE_URL=sqlite:./data.db  (or postgres url)
APP_BASE_URL=http://localhost:3000

## Notes
- Telegram long polling is the default for hackathon reliability.
- WhatsApp is intentionally deferred.