/**
 * Kirana Copilot — Telegram Bot
 *
 * Pipeline:
 *   message (text/voice) -> resolve store -> [transcribe] -> runAgent -> reply
 *
 * Includes:
 *   - Message deduplication (idempotency guard against Telegram re-deliveries)
 *   - Voice transcription via OpenAI Whisper
 */

import { Bot, type Context } from "grammy";
import OpenAI from "openai";
import { getOrCreateStore } from "../../../lib/store";
import { runAgent } from "../../../lib/agent";

// ── Bot init ────────────────────────────────────────────────────────

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is unset");

export const bot = new Bot(token);

// ── Idempotency guard ──────────────────────────────────────────────
// Prevents duplicate processing when Telegram re-delivers updates.

const processedUpdates = new Set<string>();
const MAX_PROCESSED = 1000;

function markProcessed(chatId: number, messageId: number): boolean {
  const key = `${chatId}:${messageId}`;
  if (processedUpdates.has(key)) return true; // already processed
  processedUpdates.add(key);
  // Evict oldest to prevent unbounded growth
  if (processedUpdates.size > MAX_PROCESSED) {
    const first = processedUpdates.values().next().value;
    if (first) processedUpdates.delete(first);
  }
  return false; // first time
}

// ── OpenAI client (for Whisper STT) ─────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── /start command ──────────────────────────────────────────────────

bot.command("start", (ctx) =>
  ctx.reply(
    "Namaste! Main Kirana Copilot hoon.\n\n" +
      "Aap mujhse naturally baat karo — main samajh jaunga:\n" +
      '• "Maggi 10 aaya" (stock add)\n' +
      '• "Maggi 3 bik gayi" (sale)\n' +
      '• "Ramesh ko 450 udhar likh do"\n' +
      '• "Ramesh se 200 mil gaye"\n' +
      '• "Ramesh ka kitna udhar hai?"\n' +
      '• "Kya khatam ho raha hai?"\n' +
      '• "Aaj ka hisaab"\n' +
      '• "Recent actions dikhao"\n' +
      '• "Undo last action"\n\n' +
      "Text ya voice note — dono chalega!",
  ),
);

// ── Text messages ───────────────────────────────────────────────────

bot.on("message:text", async (ctx) => {
  const chatId = ctx.chat?.id;
  const messageId = ctx.message?.message_id;
  if (!chatId || !messageId) return;

  if (markProcessed(chatId, messageId)) return;

  const text = ctx.message.text.trim();
  if (!text) return;

  await processMessage(ctx, text);
});

// ── Voice notes ─────────────────────────────────────────────────────

bot.on("message:voice", async (ctx) => {
  const chatId = ctx.chat?.id;
  const messageId = ctx.message?.message_id;
  if (!chatId || !messageId) return;

  if (markProcessed(chatId, messageId)) return;

  await ctx.reply("Voice note mili — transcribe kar raha hoon...");

  try {
    const file = await ctx.api.getFile(ctx.message.voice.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();

    const transcription = await openai.audio.transcriptions.create({
      file: new File([arrayBuffer], "voice.ogg", { type: "audio/ogg" }),
      model: "whisper-1",
      language: "hi",
    });

    const text = transcription.text.trim();
    if (!text) {
      await ctx.reply("Voice note samajh nahi aayi. Dobara try karo.");
      return;
    }

    await ctx.reply(`"${text}"`);
    await processMessage(ctx, text);
  } catch (err) {
    console.error("Voice transcription error:", err);
    await ctx.reply("Voice note process nahi ho payi. Text mein try karo.");
  }
});

// ── Core pipeline ───────────────────────────────────────────────────

async function processMessage(ctx: Context, text: string) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  try {
    const storeId = await getOrCreateStore(chatId);
    const reply = await runAgent(text, storeId);
    await ctx.reply(reply);
  } catch (err) {
    console.error("Agent error:", err);
    await ctx.reply("Kuch gadbad ho gayi. Dobara try karo.");
  }
}
