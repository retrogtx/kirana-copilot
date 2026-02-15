import { eq } from "drizzle-orm";
import { db } from "./db";
import { stores } from "./db/schema";

/**
 * Get the store ID for a Telegram chat, or create a new store on first contact.
 */
export async function getOrCreateStore(chatId: number): Promise<number> {
  // Try to find existing store
  const [existing] = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.telegramChatId, chatId))
    .limit(1);

  if (existing) return existing.id;

  // First time — create store
  const [newStore] = await db
    .insert(stores)
    .values({ telegramChatId: chatId })
    .returning({ id: stores.id });

  return newStore.id;
}
