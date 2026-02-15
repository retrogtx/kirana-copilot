# Frontend Redesign — Agent Instructions

## What this app is

Kirana Copilot is a Telegram bot ([@KhataCopilotBot](https://t.me/KhataCopilotBot)) that helps Indian kirana (grocery) store owners manage their business via voice/text in Hindi, English, or Hinglish. The web frontend has two jobs:

1. **Landing page** (`app/page.tsx`) — explain what the product does, build trust, and get users to open the Telegram bot
2. **Dashboard** (`app/dashboard/page.tsx`) — read-only overview of the store's sales, inventory, udhar (credit), and activity

The Telegram bot is the primary product. The website is secondary — it exists to explain and to display data. Do NOT over-engineer the frontend.

## Bot link

The Telegram bot link is: `https://t.me/KhataCopilotBot`

## Tech stack (DO NOT change)

- Next.js 16 (App Router, Server Components)
- Tailwind CSS v4 (via `@tailwindcss/postcss`)
- Geist font (sans + mono, already configured in `app/layout.tsx`)
- No component libraries. No shadcn. No Radix. No Framer Motion. Pure Tailwind.
- TypeScript strict mode
- Server components by default. Only use `"use client"` when you need interactivity (the Telegram login widget and logout button already are client components)

## Design direction

### Tone
- Clean, minimal, confident. Not playful, not corporate.
- Think Linear, Vercel, Raycast — information-dense, no wasted space, typography-driven.
- Dark mode primary (the dashboard already is dark). Landing page should also be dark.
- The current UI uses amber/orange as the accent color. Keep that — it maps to the warmth of a kirana store.

### What's wrong with the current UI
- **Landing page**: Generic startup template feel. The gradient orbs, "K" logo box, and feature pills look like every AI landing page. Doesn't communicate what the product actually does or how it works. The Telegram login widget at the bottom is confusing — users should go to the bot first, not login.
- **Dashboard**: The three-column layout is decent but the typography hierarchy is weak. Everything looks the same weight. The hex color hardcoding (`#0a0a0a`, `#ededed`, etc.) ignores the CSS variables already defined in `globals.css`. The empty states are just sad gray text.

---

## Landing Page — Requirements

### Primary goal
Get the user to click through to the Telegram bot (`https://t.me/KhataCopilotBot`). The CTA should be prominent and unmissable.

### Structure (top to bottom)

1. **Hero section**
   - Product name: "Kirana Copilot" (or "Khata Copilot" if it matches the bot name better)
   - One-liner in Hinglish that explains the value: something like "Apni dukaan ka poora hisaab — voice se, AI se, Telegram pe"
   - Primary CTA button: links to `https://t.me/KhataCopilotBot`. Make it look like a Telegram button (not the widget — a regular styled link/button). This is the main action.
   - Secondary action: "Already using the bot? View your dashboard" link that goes to `/dashboard`

2. **How it works — 3 steps**
   - Show the flow visually: (1) Open bot on Telegram → (2) Talk naturally in Hindi/English → (3) Everything gets tracked
   - Use real example messages the bot understands:
     - "Maggi 12 bik gayi 360 mein"
     - "Ramesh ko 450 udhar likh do"
     - "Kya khatam ho raha hai?"
     - "Aaj ka hisaab dikhao"
   - These examples should be styled like chat bubbles or a phone/Telegram mockup — something that makes it feel real, not abstract

3. **Feature highlights**
   - Voice support: "Voice note bhejo, bot samajh lega"
   - Inventory tracking: real-time stock with low-stock alerts
   - Udhar ledger: track who owes what, payment reminders
   - Daily hisaab: end-of-day summary of everything
   - Multi-user: share access with your team via invite codes
   - Do NOT use emoji icons for these. Use subtle visual indicators or just let the typography carry it.

4. **Social proof / trust section** (optional, keep minimal)
   - "Built for the Build India Hackathon"
   - Mention the tech if it helps: "Powered by Claude AI"

5. **Footer CTA**
   - Repeat the Telegram bot link
   - "Sign in to dashboard" secondary link

### Landing page design rules
- NO gradient orbs or blurred background effects
- NO emoji as icons
- NO generic feature pills/cards
- Use the Geist font. Let typography hierarchy do the work — large headings, small muted labels, monospace for example messages
- Whitespace is design. Don't fill every pixel.
- Mobile-first. Must look good on a phone since kirana owners will open this on mobile.
- The page should feel like a product page, not a template

---

## Dashboard — Requirements

### What data is available (server-side, already wired up)

The dashboard page already fetches all this data via `Promise.all`:
- `summary`: `{ date, salesCount, salesQty, salesRevenue, stockInsCount, newUdhar, paymentsReceived }`
- `inventory`: `Array<{ id, name, unit, currentStock, minStock, lastCostPrice, isLow }>`
- `ledger`: `Array<{ id, name, phone, balance, recentEntries: Array<{ amount, note, ts }> }>`
- `recentTxns`: `Array<{ id, type, itemName, qty, price, ts }>`
- `org`: `{ orgName, role, inviteCode, storeId }`
- `user`: `{ firstName, username, photoUrl }`

Do NOT change the data fetching logic or the imports. Only change the JSX and styling.

### Dashboard design rules

- Use the CSS variables from `globals.css` (`var(--background)`, `var(--foreground)`, `var(--accent)`, `var(--surface)`, `var(--border-color)`, `var(--muted)`) instead of hardcoded hex values like `#0a0a0a`, `#ededed`
- The current three-column grid layout (Inventory | Udhar | Activity) is fine conceptually. You can keep it or rework it, but the same data sections must exist.
- Improve the typography hierarchy: section headers should be clearly distinct from data, numbers should use tabular-nums and monospace, labels should be small and muted
- The metrics row (Revenue, Sales, Udhar, Collected) at the top is good — keep it but make the numbers more prominent
- Stock bars should be more visible — the current 3px bars are nearly invisible
- Empty states should be more helpful: instead of just "No items yet", say something like "No items yet — add your first item via the Telegram bot"
- The invite code banner for admins is useful — keep it
- The `Metric` and `formatINR` helper components at the bottom of the file are fine, improve their styling if needed
- The `LogoutButton` component is in `app/dashboard/logout-button.tsx` — you can restyle it but keep it as a client component

### Dashboard layout

- Nav bar: product name / org name / user info / logout — this structure is fine
- Below nav: date + "Overview" heading — fine
- Metrics row: the four key numbers — fine, make them pop more
- Content area: inventory, udhar, transactions — rework the visual weight but keep these three sections
- The page is a Server Component. Keep it that way. If you need client interactivity (tabs, filters, etc.), extract small client components into separate files in `app/dashboard/`

---

## Files you will modify

| File | What to do |
|---|---|
| `app/page.tsx` | Full rewrite of the landing page |
| `app/dashboard/page.tsx` | Restyle the dashboard (keep data fetching, change JSX/classes) |
| `app/globals.css` | Add/modify CSS variables, animations, utility classes as needed |
| `app/telegram-login-widget.tsx` | Move to dashboard login section or keep on landing — your call |
| `app/dashboard/logout-button.tsx` | Restyle if needed |
| `app/layout.tsx` | Only touch if you need to update metadata or add a class to body |

### Files you must NOT modify
- `lib/*` — all backend logic, tools, agent, auth, dashboard data queries
- `app/api/*` — all API routes
- `package.json` — do not add new dependencies
- `drizzle.config.ts`, `tsconfig.json`, `next.config.ts`

---

## CSS / Styling notes

- Tailwind v4 is configured via `@tailwindcss/postcss` in `postcss.config.mjs`. There is no `tailwind.config.ts` file — Tailwind v4 uses CSS-based configuration via `@theme` in `globals.css`.
- Custom CSS variables are defined in `globals.css` under `:root` and `@media (prefers-color-scheme: dark)`. Use these. Add new ones if needed.
- The `@theme inline` block in `globals.css` maps CSS variables to Tailwind utilities (e.g., `bg-background`, `text-foreground`, `text-accent`, `bg-surface`, `border-border`, `text-muted`). You can extend this.
- Animations: `fadeUp` keyframes and `.fade-up` classes exist. You can add more but keep them subtle — no bouncing, no sliding 200px, no spring physics.
- Geist sans is the body font. Geist Mono is available via `font-mono` class. Use mono for numbers, codes, and data.

---

## Important constraints

- No new npm dependencies. Everything must be done with Tailwind + vanilla CSS.
- No images or SVGs that require external hosting. Inline SVGs are fine for simple icons.
- No JavaScript animations. CSS transitions and keyframe animations only.
- The Telegram Login Widget (`app/telegram-login-widget.tsx`) injects a `<script>` tag from Telegram. You cannot style the widget itself — it renders in an iframe. You can only style the container around it.
- The dashboard is a Server Component. Any interactive elements (buttons, tabs, toggles) need to be extracted into `"use client"` files.
- Mobile responsive is mandatory. Most kirana store owners will view this on a phone.
- Respect the existing auth flow: unauthenticated users see landing page, authenticated users redirect to `/dashboard`. This logic is in the page components and must stay.

---

## Reference: what good looks like

Study these for design inspiration (not to copy, but for the level of craft):
- Linear.app — information density, typography, dark mode
- Vercel dashboard — metrics display, clean nav, data tables
- Raycast.com — landing page structure, feature communication
- Stripe dashboard — number formatting, status indicators

The goal is: someone looks at this and thinks "this was designed by a human with taste", not "this was generated by an AI".
