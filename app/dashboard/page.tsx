import { redirect } from "next/navigation";
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

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/");

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
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="text-center">
          <p className="text-sm text-[#999]">No organization found.</p>
          <p className="mt-2 text-xs text-[#555]">
            Message the bot on Telegram to create or join an organization.
          </p>
          <p className="mt-1 text-xs text-[#444]">
            Send <span className="font-mono text-[#888]">/start</span> to get
            started.
          </p>
          <div className="mt-6">
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
