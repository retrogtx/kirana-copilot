import { redirect } from "next/navigation";
import { getSession } from "../../lib/auth";
import { getStoreByUserId } from "../../lib/store";
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

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const storeId = await getStoreByUserId(session.userId);

  // Get user info for nav
  const [user] = await db
    .select({ firstName: users.firstName, username: users.username })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!storeId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-2xl text-white dark:bg-white dark:text-zinc-900">
            K
          </div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            No store found
          </h1>
          <p className="max-w-sm text-zinc-500 dark:text-zinc-400">
            Start by chatting with the Kirana Copilot bot on Telegram. Add some
            stock, record a sale, and your data will appear here.
          </p>
        </div>
      </div>
    );
  }

  const [summary, inventory, ledger, transactions] = await Promise.all([
    getDailySummary(storeId),
    getInventory(storeId),
    getLedgerOverview(storeId),
    getRecentTransactions(storeId),
  ]);

  const lowStockCount = inventory.filter((i) => i.isLow).length;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Nav */}
      <nav className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white dark:bg-white dark:text-zinc-900">
              K
            </div>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Kirana Copilot
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {user?.firstName ?? "User"}
              {user?.username ? ` (@${user.username})` : ""}
            </span>
            <LogoutButton />
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {/* Today's Summary */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Today&apos;s Summary &mdash; {summary.date}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Sales" value={`${summary.salesCount} txns`} sub={`${summary.salesQty} items`} />
            <SummaryCard label="Revenue" value={`₹${summary.salesRevenue.toLocaleString()}`} />
            <SummaryCard label="New Udhar" value={`₹${summary.newUdhar.toLocaleString()}`} />
            <SummaryCard label="Payments In" value={`₹${summary.paymentsReceived.toLocaleString()}`} />
          </div>
        </section>

        {/* Inventory */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Inventory
            </h2>
            {lowStockCount > 0 && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                {lowStockCount} low stock
              </span>
            )}
          </div>
          {inventory.length === 0 ? (
            <EmptyState text="No items in inventory yet." />
          ) : (
            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-4 py-2.5">Item</th>
                    <th className="px-4 py-2.5">Stock</th>
                    <th className="px-4 py-2.5">Min</th>
                    <th className="px-4 py-2.5">Unit</th>
                    <th className="px-4 py-2.5">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((item) => (
                    <tr
                      key={item.id}
                      className={`border-b border-zinc-50 dark:border-zinc-800/50 ${item.isLow ? "bg-red-50 dark:bg-red-950/20" : ""}`}
                    >
                      <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                        {item.name}
                      </td>
                      <td className={`px-4 py-2.5 ${item.isLow ? "font-semibold text-red-600 dark:text-red-400" : "text-zinc-700 dark:text-zinc-300"}`}>
                        {item.currentStock}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">
                        {item.minStock}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">
                        {item.unit ?? "pcs"}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">
                        {item.lastCostPrice ? `₹${item.lastCostPrice}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Udhar Ledger */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Udhar Ledger
          </h2>
          {ledger.length === 0 ? (
            <EmptyState text="No customers in ledger yet." />
          ) : (
            <div className="space-y-3">
              {ledger.map((party) => (
                <div
                  key={party.id}
                  className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">
                        {party.name}
                      </p>
                      {party.phone && (
                        <p className="text-xs text-zinc-400">{party.phone}</p>
                      )}
                    </div>
                    <p
                      className={`text-lg font-semibold ${party.balance > 0 ? "text-red-600 dark:text-red-400" : party.balance < 0 ? "text-green-600 dark:text-green-400" : "text-zinc-500"}`}
                    >
                      ₹{Math.abs(party.balance).toLocaleString()}
                      {party.balance > 0 ? " due" : party.balance < 0 ? " overpaid" : ""}
                    </p>
                  </div>
                  {party.recentEntries.length > 0 && (
                    <div className="mt-3 space-y-1 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                      {party.recentEntries.map((e, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400"
                        >
                          <span>
                            {e.amount > 0 ? "Udhar" : "Payment"}: ₹{Math.abs(e.amount)}
                            {e.note ? ` — ${e.note}` : ""}
                          </span>
                          <span>
                            {e.ts.toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Transactions */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Recent Transactions
          </h2>
          {transactions.length === 0 ? (
            <EmptyState text="No transactions yet." />
          ) : (
            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Item</th>
                    <th className="px-4 py-2.5">Qty</th>
                    <th className="px-4 py-2.5">Price</th>
                    <th className="px-4 py-2.5">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn) => (
                    <tr
                      key={txn.id}
                      className="border-b border-zinc-50 dark:border-zinc-800/50"
                    >
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            txn.type === "SALE"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                              : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          }`}
                        >
                          {txn.type === "SALE" ? "Sale" : "Stock In"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                        {txn.itemName}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-700 dark:text-zinc-300">
                        {txn.qty}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">
                        {txn.price ? `₹${txn.price}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">
                        {txn.ts.toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Small components ────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
      {sub && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">{sub}</p>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-200 bg-white py-8 text-center text-sm text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
      {text}
    </div>
  );
}
