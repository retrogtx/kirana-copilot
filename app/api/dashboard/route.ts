import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth";
import { getUserOrg } from "../../../lib/store";
import {
  getDailySummary,
  getInventory,
  getLedgerOverview,
  getRecentTransactions,
} from "../../../lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(null, { status: 401 });
  }

  const org = await getUserOrg(session.userId);
  if (!org) {
    return NextResponse.json(null, { status: 404 });
  }

  const [summary, inventory, ledger, recentTxns] = await Promise.all([
    getDailySummary(org.storeId),
    getInventory(org.storeId),
    getLedgerOverview(org.storeId),
    getRecentTransactions(org.storeId),
  ]);

  return NextResponse.json({ summary, inventory, ledger, recentTxns });
}
