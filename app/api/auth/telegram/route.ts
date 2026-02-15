/**
 * GET /api/auth/telegram — Telegram Login Widget callback
 *
 * Telegram redirects here with query params: id, first_name, last_name,
 * username, photo_url, auth_date, hash. We verify the HMAC, create/find
 * the user + store, set a session cookie, and redirect to the dashboard.
 */

import { NextResponse } from "next/server";
import { verifyTelegramAuth, createSession } from "../../../../lib/auth";
import { getOrCreateStore } from "../../../../lib/store";
import { eq } from "drizzle-orm";
import { db } from "../../../../lib/db";
import { users } from "../../../../lib/db/schema";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  // 1. Verify Telegram's HMAC signature
  const tgUser = verifyTelegramAuth(params);
  if (!tgUser) {
    return NextResponse.json(
      { error: "Invalid or expired Telegram auth data" },
      { status: 401 },
    );
  }

  // 2. Find or create user + store
  await getOrCreateStore(tgUser);

  // 3. Get the user ID for the session
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.telegramId, tgUser.id))
    .limit(1);

  if (!user) {
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 },
    );
  }

  // 4. Set session cookie
  await createSession(user.id, tgUser.id);

  // 5. Redirect to dashboard
  const baseUrl = process.env.APP_BASE_URL || url.origin;
  return NextResponse.redirect(`${baseUrl}/dashboard`);
}
