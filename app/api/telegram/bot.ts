/**
 * Kirana Copilot — Telegram Bot
 *
 * Simplified pipeline:
 *   message (text/voice) → resolve store → [transcribe] → runAgent → reply
 *
 * Claude handles everything via tool calls: searching items, recording sales,
 * looking up customers, managing udhar — all scoped to the user's store.
 */

import { Bot, type Context } from "grammy";
import OpenAI from "openai";
import { getOrCreateStore } from "../../../lib/store";
import { runAgent } from "../../../lib/agent";

// ── Bot init ────────────────────────────────────────────────────────────────

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is unset");

export const bot = new Bot(token);

// ── OpenAI client (for Whisper STT) ─────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── /start command ──────────────────────────────────────────────────────────

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
      '• "Aaj ka hisaab"\n\n' +
      "Text ya voice note — dono chalega!",
  ),
);

// ── Text messages ───────────────────────────────────────────────────────────

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (!text) return;
  await processMessage(ctx, text);
});

// ── Voice notes ─────────────────────────────────────────────────────────────

bot.on("message:voice", async (ctx) => {
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

    await ctx.reply(`🎤 "${text}"`);
    await processMessage(ctx, text);
  } catch (err) {
    console.error("Voice transcription error:", err);
    await ctx.reply("Voice note process nahi ho payi. Text mein try karo.");
  }
});

// ── Core pipeline ───────────────────────────────────────────────────────────

async function processMessage(ctx: Context, text: string) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  try {
    // 1. Resolve store (auto-creates on first message)
    const storeId = await getOrCreateStore(chatId);

    // 2. Run the agent — Claude calls tools as needed and returns a reply
    const reply = await runAgent(text, storeId);

    // 3. Send reply
    await ctx.reply(reply);
  } catch (err) {
    console.error("Agent error:", err);
    await ctx.reply("Kuch gadbad ho gayi. Dobara try karo.");
  }
}
