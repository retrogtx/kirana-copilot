/**
 * Shared Bot instance — Kirana Copilot
 *
 * All handlers are registered here so the same Bot object can be used by:
 *   - The webhook API route (production / Vercel)
 *   - A long-polling script (optional local dev fallback)
 */

import { Bot } from "grammy";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is unset");

export const bot = new Bot(token);

// ── Commands ────────────────────────────────────────────────────────────────

bot.command("start", (ctx) =>
  ctx.reply(
    "Namaste! Main Kirana Copilot hoon. Aap bolo: sale log karo, stock add karo, udhar likho, ya aaj ka hisaab. Text ya voice dono chalega.",
  ),
);

// ── Text messages ───────────────────────────────────────────────────────────

bot.on("message:text", (ctx) => {
  const text = ctx.message.text.trim();
  if (!text) return;
  // Placeholder until intent pipeline is wired: acknowledge receipt
  ctx.reply(
    `Received: "${text.slice(0, 100)}${text.length > 100 ? "…" : ""}". Intent pipeline coming next.`,
  );
});

// ── Voice notes ─────────────────────────────────────────────────────────────

bot.on("message:voice", async (ctx) => {
  // Voice: will be downloaded + transcribed via STT, then same intent pipeline
  await ctx.reply(
    "Voice note received. Transcription + intent pipeline coming soon.",
  );
});
