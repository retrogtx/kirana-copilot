/**
 * POST /api/telegram — Telegram webhook endpoint
 *
 * Telegram POSTs every update (message, callback_query, etc.) here.
 * grammY's webhookCallback converts the incoming Request into a bot update.
 */

import { webhookCallback } from "grammy";
import { bot } from "./bot";

const handler = webhookCallback(bot, "std/http");

export const POST = async (req: Request) => {
  return handler(req);
};
