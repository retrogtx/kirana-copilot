import { eq } from "drizzle-orm";
import { db } from "./db";
import { users, stores } from "./db/schema";

/** Telegram user info passed from bot context or login widget. */
export interface TelegramUser {
  id: number; // Telegram user ID
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

/**
 * Find or create a user + store from Telegram identity.
 * Used by both the bot (ctx.from) and the dashboard (login widget).
 */
export async function getOrCreateStore(tgUser: TelegramUser): Promise<number> {
  // 1. Upsert user (insert or update on conflict)
  const [user] = await db
    .insert(users)
    .values({
      telegramId: tgUser.id,
      firstName: tgUser.first_name,
      lastName: tgUser.last_name ?? null,
      username: tgUser.username ?? null,
      photoUrl: tgUser.photo_url ?? null,
    })
    .onConflictDoUpdate({
      target: users.telegramId,
      set: {
        firstName: tgUser.first_name,
        lastName: tgUser.last_name ?? null,
        username: tgUser.username ?? null,
        photoUrl: tgUser.photo_url ?? null,
      },
    })
    .returning({ id: users.id });

  // 2. Find or create store for this user
  let [store] = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.userId, user.id))
    .limit(1);

  if (!store) {
    // Use a subquery-safe approach: try insert, if conflict just select
    try {
      [store] = await db
        .insert(stores)
        .values({ userId: user.id })
        .returning({ id: stores.id });
    } catch {
      // Race condition: another request created it first
      [store] = await db
        .select({ id: stores.id })
        .from(stores)
        .where(eq(stores.userId, user.id))
        .limit(1);
    }
  }

  return store.id;
}

/**
 * Get the store ID for an already-known user ID (e.g. from a dashboard session).
 */
export async function getStoreByUserId(userId: number): Promise<number | null> {
  const [store] = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.userId, userId))
    .limit(1);

  return store?.id ?? null;
}
