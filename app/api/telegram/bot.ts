/**
 * Kirana Copilot — Telegram Bot
 *
 * Pipeline:
 *   message (text/voice) -> resolve user -> check org -> [transcribe] -> runAgent -> reply
 *
 * Organization flow (first-time users):
 *   /start → auto-creates org (user becomes admin, gets invite code)
 *   /join <code> → joins existing org as member
 *
 * Includes:
 *   - Message deduplication (idempotency guard against Telegram re-deliveries)
 *   - Voice transcription via OpenAI Whisper
 */

import { Bot, type Context } from "grammy";
import OpenAI from "openai";
import {
  upsertUser,
  getUserOrg,
  createOrganization,
  joinOrganization,
  resolveStoreForTelegram,
} from "../../../lib/store";
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
// First-time user: auto-creates an org. Returning user: shows help.

bot.command("start", async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const userId = await upsertUser({
    id: from.id,
    first_name: from.first_name,
    last_name: from.last_name,
    username: from.username,
  });

  const existingOrg = await getUserOrg(userId);

  if (existingOrg) {
    // Already in an org — just show help
    await ctx.reply(
      `Welcome back! You're in "${existingOrg.orgName}".\n\n` +
        "Aap mujhse naturally baat karo — main samajh jaunga:\n" +
        '• "Maggi 10 aaya" (stock add)\n' +
        '• "Maggi 3 bik gayi" (sale)\n' +
        '• "Ramesh ko 450 udhar likh do"\n' +
        '• "Ramesh se 200 mil gaye"\n' +
        '• "Kya khatam ho raha hai?"\n' +
        '• "Aaj ka hisaab"\n\n' +
        "Text ya voice note — dono chalega!" +
        (existingOrg.role === "admin"
          ? `\n\nYour invite code: ${existingOrg.inviteCode}\nShare it with your team so they can /join`
          : ""),
    );
    return;
  }

  // First-time user — auto-create an org named after them
  const orgName = `${from.first_name}'s Store`;
  const result = await createOrganization(userId, orgName);

  await ctx.reply(
    `Namaste ${from.first_name}! Your organization "${orgName}" has been created.\n\n` +
      `Your invite code: ${result.inviteCode}\n` +
      `Share this code with your team — they can join by sending:\n/join ${result.inviteCode}\n\n` +
      "Ab baat karo — main samajh jaunga:\n" +
      '• "Maggi 10 aaya" (stock add)\n' +
      '• "Maggi 3 bik gayi" (sale)\n' +
      '• "Ramesh ko 450 udhar likh do"\n' +
      '• "Kya khatam ho raha hai?"\n' +
      '• "Aaj ka hisaab"\n\n' +
      "Text ya voice note — dono chalega!",
  );
});

// ── /join <code> command ─────────────────────────────────────────────
// Join an existing organization using an invite code.

bot.command("join", async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const userId = await upsertUser({
    id: from.id,
    first_name: from.first_name,
    last_name: from.last_name,
    username: from.username,
  });

  // Already in an org?
  const existingOrg = await getUserOrg(userId);
  if (existingOrg) {
    await ctx.reply(
      `You're already in "${existingOrg.orgName}". You can't join another organization.`,
    );
    return;
  }

  const code = ctx.match?.trim();
  if (!code) {
    await ctx.reply(
      "Please provide the invite code.\nUsage: /join KC-XXXXXXXX",
    );
    return;
  }

  const result = await joinOrganization(userId, code);
  if (!result) {
    await ctx.reply(
      "Invalid invite code. Please check and try again.\nUsage: /join KC-XXXXXXXX",
    );
    return;
  }

  await ctx.reply(
    "You've joined the organization! You can now use the bot.\n\n" +
      "Try:\n" +
      '• "Maggi 10 aaya" (stock add)\n' +
      '• "Maggi 3 bik gayi" (sale)\n' +
      '• "Aaj ka hisaab"\n\n' +
      "Text ya voice note — dono chalega!",
  );
});

// ── /org command ─────────────────────────────────────────────────────
// Show current org info. Admins see the invite code.

bot.command("org", async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const userId = await upsertUser({
    id: from.id,
    first_name: from.first_name,
    last_name: from.last_name,
    username: from.username,
  });

  const org = await getUserOrg(userId);
  if (!org) {
    await ctx.reply(
      "You're not in any organization yet.\nSend /start to create one, or /join <code> to join an existing one.",
    );
    return;
  }

  let msg = `Organization: ${org.orgName}\nYour role: ${org.role}`;
  if (org.role === "admin") {
    msg += `\n\nInvite code: ${org.inviteCode}\nShare this with your team — they can send:\n/join ${org.inviteCode}`;
  }

  await ctx.reply(msg);
});

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
  const from = ctx.from;
  if (!from) return;

  try {
    // 1. Resolve user + store from Telegram identity
    const { storeId } = await resolveStoreForTelegram({
      id: from.id,
      first_name: from.first_name,
      last_name: from.last_name,
      username: from.username,
    });

    // 2. If no org/store yet, prompt them to set up
    if (!storeId) {
      await ctx.reply(
        "You're not in any organization yet.\n" +
          "Send /start to create one, or /join <code> to join an existing one.",
      );
      return;
    }

    // 3. Run the agent — Claude calls tools as needed and returns a reply
    const reply = await runAgent(text, storeId);
    await ctx.reply(reply);
  } catch (err) {
    console.error("Agent error:", err);
    await ctx.reply("Kuch gadbad ho gayi. Dobara try karo.");
  }
}
