/**
 * GET /api/auth/telegram — Telegram Login Widget callback
 *
 * Telegram redirects here with query params: id, first_name, last_name,
 * username, photo_url, auth_date, hash. We verify the HMAC, upsert
 * the user, set a session cookie, and redirect to the dashboard.
 */

import { NextResponse } from "next/server";
import { verifyTelegramAuth, createSession } from "../../../../lib/auth";
import { upsertUser } from "../../../../lib/store";

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

  // 2. Upsert user
  const userId = await upsertUser(tgUser);

  // 3. Set session cookie
  await createSession(userId, tgUser.id);

  // 4. Redirect to dashboard
  const baseUrl = process.env.APP_BASE_URL || url.origin;
  return NextResponse.redirect(`${baseUrl}/dashboard`);
}
