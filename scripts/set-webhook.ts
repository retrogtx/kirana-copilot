/**
 * Register the Telegram webhook.
 *
 * Run once after deploy (or whenever the URL changes):
 *   bun run webhook:set
 *
 * Requires:
 *   TELEGRAM_BOT_TOKEN  – bot token from BotFather
 *   APP_BASE_URL         – public HTTPS URL (e.g. https://your-app.vercel.app)
 */

import { Bot } from "grammy";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is unset");

const baseUrl = process.env.APP_BASE_URL;
if (!baseUrl) throw new Error("APP_BASE_URL is unset");

const webhookUrl = `${baseUrl}/api/telegram`;

const bot = new Bot(token);

await bot.api.setWebhook(webhookUrl);
console.log(`Webhook set → ${webhookUrl}`);
