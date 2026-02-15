# Kirana Copilot

AI-powered ops assistant for kirana (grocery) stores in India. Talk to it on Telegram — in Hindi, English, or Hinglish — via text or voice. It manages your inventory, sales, udhar ledger, and daily hisaab.

**Stack:** Next.js 16 · Vercel AI SDK · Claude (Anthropic) · grammY · Neon Postgres · Drizzle ORM · Tailwind CSS

---

## Features

- **Natural language** — "Maggi 10 aaya", "Ramesh ko 450 udhar likh do", "Aaj ka hisaab"
- **Voice notes** — Send a voice message on Telegram, Whisper transcribes it, Claude processes it
- **Tool-calling agent** — Claude searches your inventory, looks up customers, records sales, manages udhar — all via tool calls, not rigid intents
- **Multi-store isolation** — Each Telegram user gets their own store. Data never leaks across users.
- **Web dashboard** — Log in with Telegram, see your inventory, udhar ledger, transactions, and daily summary
- **Telegram OAuth** — HMAC-SHA-256 verified login via Telegram Login Widget

---

## Architecture

```
Telegram User
    │
    ├─ text/voice message ──→ Telegram API ──→ POST /api/telegram (webhook)
    │                                              │
    │                                         grammY bot.ts
    │                                              │
    │                                    ┌─────────┴─────────┐
    │                                    │  resolve user +    │
    │                                    │  store from        │
    │                                    │  ctx.from          │
    │                                    └─────────┬─────────┘
    │                                              │
    │                                    ┌─────────┴─────────┐
    │                                    │  if voice:         │
    │                                    │  Whisper STT       │
    │                                    └─────────┬─────────┘
    │                                              │
    │                                    ┌─────────┴─────────┐
    │                                    │  runAgent()        │
    │                                    │  Claude + tools    │
    │                                    │  (scoped by store) │
    │                                    └─────────┬─────────┘
    │                                              │
    │                                    ┌─────────┴─────────┐
    │                                    │  Neon Postgres     │
    │                                    │  (users, stores,   │
    │                                    │  items, txns,      │
    │                                    │  ledger)           │
    │                                    └───────────────────┘
    │
    └─ Telegram Login Widget ──→ GET /api/auth/telegram ──→ JWT cookie ──→ /dashboard
```

---

## Local Setup

### Prerequisites

- [Bun](https://bun.sh/) (or Node.js 20+)
- [ngrok](https://ngrok.com/) (free tier works)
- A Telegram account

### 1. Clone and install

```bash
git clone <repo-url>
cd kirana-copilot
bun install
```

### 2. Create a Telegram bot

1. Open Telegram, search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot`, follow the prompts, get your **bot token**
3. Send `/setdomain` to BotFather, select your bot, enter your ngrok domain (e.g. `xxxx.ngrok-free.app`) — this enables the Telegram Login Widget

### 3. Set up Neon Postgres

1. Go to [neon.tech](https://neon.tech), create a free project
2. Copy the **pooled connection string** from Connection Details

### 4. Get API keys

- **Anthropic:** [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
- **OpenAI:** [platform.openai.com/api-keys](https://platform.openai.com/api-keys) (for Whisper voice transcription)

### 5. Configure environment

```bash
cp .env.example .env
```

Fill in all values in `.env`:

| Variable | Where to get it |
|---|---|
| `TELEGRAM_BOT_TOKEN` | BotFather → your bot token |
| `NEXT_PUBLIC_BOT_USERNAME` | Your bot's username (without @) |
| `APP_BASE_URL` | Your ngrok HTTPS URL |
| `DATABASE_URL` | Neon dashboard → pooled connection string |
| `ANTHROPIC_API_KEY` | Anthropic console |
| `OPENAI_API_KEY` | OpenAI platform |

### 6. Push the database schema

```bash
bun run db:push
```

### 7. Start the dev server

```bash
bun run dev
```

### 8. Start ngrok

In a separate terminal:

```bash
ngrok http 3000
```

Copy the HTTPS URL and update `APP_BASE_URL` in `.env`.

### 9. Register the webhook

```bash
bun run webhook:set
```

This tells Telegram to send all bot updates to `APP_BASE_URL/api/telegram`.

### 10. Test

- **Bot:** Open Telegram, find your bot, send `/start`
- **Dashboard:** Open your ngrok URL in a browser, click "Sign in with Telegram"

---

## Project Structure

```
app/
  page.tsx                      Login page (Telegram Login Widget)
  dashboard/page.tsx            Dashboard (inventory, ledger, transactions)
  api/
    telegram/
      bot.ts                    Bot handlers + agent pipeline
      route.ts                  Webhook endpoint (POST)
    auth/
      telegram/route.ts         Telegram Login Widget callback
      logout/route.ts           Clear session cookie
lib/
  agent.ts                      runAgent() — Claude + tool calling
  tools.ts                      10 tools Claude can call (scoped by storeId)
  store.ts                      getOrCreateStore() — user + store resolution
  auth.ts                       HMAC verification + JWT sessions
  dashboard.ts                  Server-side data queries for dashboard
  db/
    schema.ts                   Drizzle schema (users, stores, items, etc.)
    index.ts                    Neon connection
scripts/
  set-webhook.ts                Register Telegram webhook
  migrate.ts                    Push schema to Neon
drizzle.config.ts               Drizzle Kit config
```

---

## Deploy to Vercel

1. Push to GitHub
2. Import into [Vercel](https://vercel.com)
3. Add all env vars from `.env` to Vercel's Environment Variables settings
4. Deploy
5. Update `APP_BASE_URL` to your Vercel URL
6. Run `bun run webhook:set` to point Telegram to the new URL
7. Update BotFather domain: `/setdomain` → your Vercel domain

---

## Scripts

| Script | Command | What it does |
|---|---|---|
| Dev server | `bun run dev` | Start Next.js dev server |
| Build | `bun run build` | Production build |
| Push schema | `bun run db:push` | Push Drizzle schema to Neon |
| Set webhook | `bun run webhook:set` | Register Telegram webhook URL |

---

## License

Built for the Build India Hackathon.
