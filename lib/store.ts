import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "./db";
import { users, organizations, orgMembers, stores } from "./db/schema";

/** Telegram user info passed from bot context or login widget. */
export interface TelegramUser {
  id: number; // Telegram user ID
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

/** Generate a short, unique invite code like "KIRANA-X7F2A3" */
function generateInviteCode(): string {
  const hex = randomBytes(4).toString("hex").toUpperCase(); // 8 chars
  return `KC-${hex}`;
}

// ── User upsert ─────────────────────────────────────────────────────────────

/**
 * Find or create a user from Telegram identity. Returns the internal user ID.
 */
export async function upsertUser(tgUser: TelegramUser): Promise<number> {
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

  return user.id;
}

// ── Organization operations ─────────────────────────────────────────────────

/**
 * Create a new organization. The creating user becomes admin.
 * Also creates a store for the org.
 * Returns { orgId, storeId, inviteCode }.
 */
export async function createOrganization(
  userId: number,
  orgName: string,
): Promise<{ orgId: number; storeId: number; inviteCode: string }> {
  const inviteCode = generateInviteCode();

  const [org] = await db
    .insert(organizations)
    .values({ name: orgName, inviteCode })
    .returning({ id: organizations.id, inviteCode: organizations.inviteCode });

  // Add creator as admin
  await db.insert(orgMembers).values({
    orgId: org.id,
    userId,
    role: "admin",
  });

  // Create the store for this org
  const [store] = await db
    .insert(stores)
    .values({ orgId: org.id, name: orgName })
    .returning({ id: stores.id });

  return { orgId: org.id, storeId: store.id, inviteCode: org.inviteCode };
}

/**
 * Join an existing organization by invite code.
 * Returns { orgId, storeId } or null if code is invalid.
 */
export async function joinOrganization(
  userId: number,
  inviteCode: string,
): Promise<{ orgId: number; storeId: number } | null> {
  // Find org by invite code
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.inviteCode, inviteCode.trim().toUpperCase()))
    .limit(1);

  if (!org) return null;

  // Check if already a member of this org
  const existing = await db
    .select({ id: orgMembers.id })
    .from(orgMembers)
    .where(
      and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, userId)),
    )
    .limit(1);

  if (existing.length === 0) {
    await db.insert(orgMembers).values({
      orgId: org.id,
      userId,
      role: "member",
    });
  }

  // Get the store
  const [store] = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.orgId, org.id))
    .limit(1);

  return { orgId: org.id, storeId: store.id };
}

// ── Lookups ─────────────────────────────────────────────────────────────────

/** Get the user's org membership (org, store, role). Null if they haven't joined one. */
export async function getUserOrg(
  userId: number,
): Promise<{
  orgId: number;
  orgName: string;
  storeId: number;
  role: string;
  inviteCode: string;
} | null> {
  const [membership] = await db
    .select({
      orgId: orgMembers.orgId,
      role: orgMembers.role,
      orgName: organizations.name,
      inviteCode: organizations.inviteCode,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, userId))
    .limit(1);

  if (!membership) return null;

  const [store] = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.orgId, membership.orgId))
    .limit(1);

  if (!store) return null;

  return {
    orgId: membership.orgId,
    orgName: membership.orgName,
    storeId: store.id,
    role: membership.role,
    inviteCode: membership.inviteCode,
  };
}

/** Get store ID for a user (through their org). Used by dashboard. */
export async function getStoreByUserId(
  userId: number,
): Promise<number | null> {
  const org = await getUserOrg(userId);
  return org?.storeId ?? null;
}

/**
 * Resolve a Telegram user to a store ID (for bot usage).
 * Upserts the user, then finds their org's store.
 * Returns null if they haven't joined an org yet.
 */
export async function resolveStoreForTelegram(
  tgUser: TelegramUser,
): Promise<{ userId: number; storeId: number | null }> {
  const userId = await upsertUser(tgUser);
  const org = await getUserOrg(userId);
  return { userId, storeId: org?.storeId ?? null };
}
