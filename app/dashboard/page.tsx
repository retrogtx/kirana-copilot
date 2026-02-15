import { getSession } from "../../lib/auth";
import { getUserOrg } from "../../lib/store";
import {
  getDailySummary,
  getInventory,
  getLedgerOverview,
  getRecentTransactions,
} from "../../lib/dashboard";
import { db } from "../../lib/db";
import { users } from "../../lib/db/schema";
import { eq } from "drizzle-orm";
import { LogoutButton } from "./logout-button";
import { DashboardContent } from "./dashboard-content";
import type { DashboardData } from "./dashboard-content";
import { TelegramLoginWidget } from "../telegram-login-widget";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex max-w-xs flex-col items-center text-center">
          <h1 className="text-lg font-semibold">Sign in to your dashboard</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Use your Telegram account to access your store&apos;s dashboard.
          </p>
          <div className="mt-6">
            <TelegramLoginWidget />
          </div>
          <a
            href="/"
            className="mt-6 text-[12px] text-muted transition-colors hover:text-foreground"
          >
            &larr; Back to home
          </a>
        </div>
      </div>
    );
  }

  const [user] = await db
    .select({
      firstName: users.firstName,
      username: users.username,
      photoUrl: users.photoUrl,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  const org = await getUserOrg(session.userId);

  // No org yet — tell them to set up via the Telegram bot
  if (!org) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="max-w-xs text-center">
          <p className="text-sm font-medium text-foreground">
            No organization found
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Message the bot on Telegram to create or join an organization.
          </p>
          <a
            href="https://t.me/KhataCopilotBot"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Open Telegram Bot
          </a>
          <div className="mt-4">
            <LogoutButton />
          </div>
        </div>
      </div>
    );
  }

  const [summary, inventory, ledger, recentTxns] = await Promise.all([
    getDailySummary(org.storeId),
    getInventory(org.storeId),
    getLedgerOverview(org.storeId),
    getRecentTransactions(org.storeId),
  ]);

  // Serialize dates for the client component
  const initialData: DashboardData = {
    summary,
    inventory,
    ledger: ledger.map((p) => ({
      ...p,
      recentEntries: p.recentEntries.map((e) => ({
        ...e,
        ts: e.ts.toISOString(),
      })),
    })),
    recentTxns: recentTxns.map((t) => ({
      ...t,
      ts: t.ts.toISOString(),
    })),
  };

  return (
    <DashboardContent
      org={{
        orgName: org.orgName,
        role: org.role,
        inviteCode: org.inviteCode,
      }}
      user={{
        firstName: user.firstName,
        username: user.username,
        photoUrl: user.photoUrl,
      }}
      initialData={initialData}
    />
  );
}
