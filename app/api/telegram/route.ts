/**
 * POST /api/telegram — Telegram webhook endpoint
 *
 * Telegram POSTs every update (message, callback_query, etc.) here.
 * grammY's webhookCallback converts the incoming Request into a bot update.
 */

import { webhookCallback } from "grammy";
import { bot } from "./bot";

// Allow up to 60s for Claude tool-calling (Vercel serverless limit)
export const maxDuration = 60;

const handler = webhookCallback(bot, "std/http", {
  timeoutMilliseconds: 55_000, // grammY response timeout (under Vercel's 60s limit)
});

export const POST = async (req: Request) => {
  return handler(req);
};
