/**
 * Kirana Copilot — Telegram Bot
 *
 * Full pipeline:
 *   voice → transcribe → context → intent extraction → confirm → execute → reply
 */

import { Bot, InlineKeyboard, type Context } from "grammy";
import OpenAI from "openai";
import { buildContext } from "../../../lib/context";
import { extractIntent } from "../../../lib/ai/intent";
import { executeIntent } from "../../../lib/executor";
import type { IntentResult } from "../../../lib/ai/schemas";

// ── Bot init ────────────────────────────────────────────────────────────────

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is unset");

export const bot = new Bot(token);

// ── Pending confirmations (in-memory, keyed by chat_id) ─────────────────────
// Acceptable for hackathon — confirmations must happen quickly before cold start.

const pendingActions = new Map<number, IntentResult>();

// ── OpenAI client (for Whisper STT) ─────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── /start command ──────────────────────────────────────────────────────────

bot.command("start", (ctx) =>
  ctx.reply(
    "Namaste! Main Kirana Copilot hoon. Aap bolo: sale log karo, stock add karo, udhar likho, ya aaj ka hisaab. Text ya voice dono chalega.",
  ),
);

// ── Callback queries (Confirm / Cancel) ─────────────────────────────────────

bot.on("callback_query:data", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const action = ctx.callbackQuery.data;
  const pending = pendingActions.get(chatId);

  // Always answer the callback to remove the loading spinner
  await ctx.answerCallbackQuery();

  if (!pending) {
    await ctx.editMessageText("No pending action found. Please try again.");
    return;
  }

  if (action === "confirm") {
    pendingActions.delete(chatId);
    try {
      const result = await executeIntent(pending);
      await ctx.editMessageText(result.reply);
    } catch (err) {
      console.error("Execute error:", err);
      await ctx.editMessageText("Error executing action. Please try again.");
    }
  } else if (action === "cancel") {
    pendingActions.delete(chatId);
    await ctx.editMessageText("Action cancelled.");
  }
});

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
    // Download voice file from Telegram
    const file = await ctx.api.getFile(ctx.message.voice.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();

    // Send to Whisper for transcription
    const transcription = await openai.audio.transcriptions.create({
      file: new File([arrayBuffer], "voice.ogg", { type: "audio/ogg" }),
      model: "whisper-1",
      language: "hi", // Hindi primary, Whisper handles Hinglish well
    });

    const text = transcription.text.trim();
    if (!text) {
      await ctx.reply("Voice note samajh nahi aayi. Dobara try karo.");
      return;
    }

    await ctx.reply(`Transcription: "${text}"\n\nProcessing...`);
    await processMessage(ctx, text);
  } catch (err) {
    console.error("Voice transcription error:", err);
    await ctx.reply("Voice note process karne mein error aaya. Text mein try karo.");
  }
});

// ── Core pipeline ───────────────────────────────────────────────────────────

async function processMessage(ctx: Context, text: string) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  try {
    // 1. Build store context from DB
    const context = await buildContext();

    // 2. Extract intent via Claude
    const intent = await extractIntent(text, context);

    // 3. If confirmation needed, store pending + send inline keyboard
    if (intent.needs_confirmation) {
      pendingActions.set(chatId, intent);

      const keyboard = new InlineKeyboard()
        .text("Confirm", "confirm")
        .text("Cancel", "cancel");

      await ctx.reply(intent.confirmation_prompt || intent.reply, {
        reply_markup: keyboard,
      });
      return;
    }

    // 4. Execute directly
    const result = await executeIntent(intent);
    await ctx.reply(result.reply);
  } catch (err) {
    console.error("Pipeline error:", err);
    await ctx.reply("Kuch gadbad ho gayi. Dobara try karo.");
  }
}
