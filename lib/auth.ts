import { createHmac, createHash } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { TelegramUser } from "./store";

const SESSION_COOKIE = "kirana_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getJwtSecret() {
  const secret = process.env.JWT_SECRET ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!secret) throw new Error("JWT_SECRET or TELEGRAM_BOT_TOKEN must be set");
  return new TextEncoder().encode(secret);
}

// ── Telegram Login Widget verification ──────────────────────────────────────

/**
 * Verify data from the Telegram Login Widget.
 * See: https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramAuth(data: Record<string, string>): TelegramUser | null {
  const { hash, ...rest } = data;
  if (!hash) return null;

  // Check auth_date is not stale (allow up to 1 day)
  const authDate = parseInt(rest.auth_date, 10);
  if (isNaN(authDate) || Date.now() / 1000 - authDate > 86400) return null;

  // Build data-check-string: sorted key=value pairs joined by \n
  const checkString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("\n");

  // Secret key = SHA256(bot_token)
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is unset");

  const secretKey = createHash("sha256").update(botToken).digest();
  const hmac = createHmac("sha256", secretKey).update(checkString).digest("hex");

  if (hmac !== hash) return null;

  return {
    id: parseInt(rest.id, 10),
    first_name: rest.first_name,
    last_name: rest.last_name || undefined,
    username: rest.username || undefined,
    photo_url: rest.photo_url || undefined,
  };
}

// ── JWT session management ──────────────────────────────────────────────────

/**
 * Create a signed JWT and set it as an HTTP-only cookie.
 */
export async function createSession(userId: number, telegramId: number) {
  const token = await new SignJWT({ userId, telegramId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getJwtSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

/**
 * Read and verify the session cookie. Returns { userId, telegramId } or null.
 */
export async function getSession(): Promise<{
  userId: number;
  telegramId: number;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return {
      userId: payload.userId as number,
      telegramId: payload.telegramId as number,
    };
  } catch {
    return null;
  }
}

/**
 * Require a valid session or throw. For use in dashboard API routes.
 */
export async function requireSession(): Promise<{
  userId: number;
  telegramId: number;
}> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

/**
 * Clear the session cookie (logout).
 */
export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
