"use client";

import { useState, useEffect } from "react";
import { LogoutButton } from "./logout-button";

// ── Types (JSON-serialized — dates are strings) ─────────────────────

interface Summary {
  date: string;
  salesCount: number;
  salesQty: number;
  salesRevenue: number;
  stockInsCount: number;
  newUdhar: number;
  paymentsReceived: number;
}

interface InventoryItem {
  id: number;
  name: string;
  unit: string | null;
  currentStock: number;
  minStock: number;
  lastCostPrice: string | null;
  isLow: boolean;
}

interface LedgerParty {
  id: number;
  name: string;
  phone: string | null;
  balance: number;
  recentEntries: { amount: number; note: string | null; ts: string }[];
}

interface Transaction {
  id: number;
  type: string;
  itemName: string;
  qty: number;
  price: string | null;
  ts: string;
}

export interface DashboardData {
  summary: Summary;
  inventory: InventoryItem[];
  ledger: LedgerParty[];
  recentTxns: Transaction[];
}

interface Props {
  org: { orgName: string; role: string; inviteCode: string };
  user: { firstName: string; username: string | null; photoUrl: string | null };
  initialData: DashboardData;
}

// ── Component ───────────────────────────────────────────────────────

export function DashboardContent({ org, user, initialData }: Props) {
  const [data, setData] = useState<DashboardData>(initialData);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/dashboard");
        if (res.ok) {
          const fresh = await res.json();
          setData(fresh);
        }
      } catch {
        // Silently ignore — will retry next interval
      }
    }, 5000);

    return () => clearInterval(poll);
  }, []);

  const { summary, inventory, ledger, recentTxns } = data;
  const lowStockCount = inventory.filter((i) => i.isLow).length;
  const totalUdhar = ledger.reduce(
    (sum, p) => sum + Math.max(0, p.balance),
    0,
  );

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      {/* Nav */}
      <nav className="flex items-center justify-between border-b border-border px-5 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-semibold tracking-tight">
            Kirana Copilot
          </span>
          <span className="text-subtle">/</span>
          <span className="text-[13px] text-muted">{org.orgName}</span>
          {org.role === "admin" && (
            <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
              admin
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {user?.photoUrl && (
            <img
              src={user.photoUrl}
              alt=""
              className="h-6 w-6 rounded-full"
            />
          )}
          <span className="hidden text-[13px] text-muted sm:inline">
            {user?.firstName}
          </span>
          <LogoutButton />
        </div>
      </nav>

      <div className="mx-auto max-w-[1200px] px-5 pb-20 sm:px-6">
        {/* Invite code banner for admins */}
        {org.role === "admin" && (
          <div className="mt-5 flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
            <span className="text-[12px] text-muted">
              Invite code — share with your team
            </span>
            <code className="font-mono text-[14px] font-semibold tracking-widest text-accent">
              {org.inviteCode}
            </code>
          </div>
        )}

        {/* Header */}
        <div className="pb-6 pt-6 sm:pt-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-subtle">
            {new Date(summary.date + "T00:00:00").toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <h1 className="mt-1.5 text-[26px] font-bold tracking-tight sm:text-[32px]">
            Overview
          </h1>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-4 pb-8 sm:grid-cols-4 sm:gap-6">
          <MetricCard
            label="Revenue"
            value={formatINR(summary.salesRevenue)}
          />
          <MetricCard
            label="Sales"
            value={String(summary.salesQty)}
            sub={`${summary.salesCount} orders`}
          />
          <MetricCard
            label="Credit"
            value={formatINR(summary.newUdhar)}
            warn={summary.newUdhar > 0}
          />
          <MetricCard
            label="Collected"
            value={formatINR(summary.paymentsReceived)}
          />
        </div>

        <div className="h-px bg-border" />

        {/* Three columns */}
        <div className="grid gap-0 lg:grid-cols-12">
          {/* ── Inventory ───────────────────────────────── */}
          <section className="border-b border-border py-6 sm:py-8 lg:col-span-5 lg:border-b-0 lg:border-r lg:pr-8">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-[14px] font-semibold">Inventory</h2>
              <div className="flex items-center gap-3">
                {lowStockCount > 0 && (
                  <span className="text-[11px] font-medium text-danger">
                    {lowStockCount} low
                  </span>
                )}
                <span className="text-[11px] text-subtle">
                  {inventory.length} items
                </span>
              </div>
            </div>
            {inventory.length === 0 ? (
              <EmptyState message="No items yet — add your first item via the Telegram bot." />
            ) : (
              <div className="space-y-0.5">
                {inventory.map((item) => {
                  const maxRef = Math.max(
                    item.minStock * 3,
                    item.currentStock,
                    1,
                  );
                  const pct = Math.min(
                    100,
                    (item.currentStock / maxRef) * 100,
                  );
                  return (
                    <div
                      key={item.id}
                      className="row-hover -mx-2 flex items-center justify-between rounded-md px-2 py-2"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${item.isLow ? "bg-danger" : "bg-border"}`}
                        />
                        <span
                          className={`text-[13px] ${item.isLow ? "font-medium" : ""}`}
                        >
                          {item.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="hidden w-16 sm:block">
                          <div className="stock-bar">
                            <div
                              className={`stock-bar-fill ${item.isLow ? "bg-danger" : "bg-muted"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <span
                          className={`w-10 text-right font-mono text-[13px] tabular-nums ${item.isLow ? "font-semibold text-danger" : "text-muted"}`}
                        >
                          {item.currentStock}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Udhar ────────────────────────────────────── */}
          <section className="border-b border-border py-6 sm:py-8 lg:col-span-3 lg:border-b-0 lg:border-r lg:px-8">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-[14px] font-semibold">Credit</h2>
              {totalUdhar > 0 && (
                <span className="font-mono text-[12px] font-medium text-danger">
                  {formatINR(totalUdhar)}
                </span>
              )}
            </div>
            {ledger.length === 0 ? (
              <EmptyState message="No entries yet — record credit via the Telegram bot." />
            ) : (
              <div className="space-y-4">
                {ledger.map((party) => (
                  <div key={party.id}>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium">
                        {party.name}
                      </span>
                      <span
                        className={`font-mono text-[13px] tabular-nums font-semibold ${party.balance > 0 ? "text-danger" : "text-success"}`}
                      >
                        {formatINR(Math.abs(party.balance))}
                      </span>
                    </div>
                    {party.recentEntries.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {party.recentEntries.slice(0, 2).map((e, i) => (
                          <p key={i} className="text-[11px] text-muted">
                            {e.amount > 0 ? "+" : "\u2212"}
                            {formatINR(Math.abs(e.amount))}
                            {e.note ? ` — ${e.note}` : ""}
                            <span className="ml-1.5 text-subtle">
                              {formatDateShort(e.ts)}
                            </span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Activity ─────────────────────────────────── */}
          <section className="py-6 sm:py-8 lg:col-span-4 lg:pl-8">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-[14px] font-semibold">Activity</h2>
              <span className="text-[11px] text-subtle">
                {recentTxns.length} transactions
              </span>
            </div>
            {recentTxns.length === 0 ? (
              <EmptyState message="No activity yet — record a sale or stock-in via the bot." />
            ) : (
              <div className="space-y-0.5">
                {recentTxns.map((txn) => (
                  <div
                    key={txn.id}
                    className="row-hover -mx-2 flex items-center justify-between rounded-md px-2 py-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${txn.type === "SALE" ? "bg-foreground" : "bg-success"}`}
                      />
                      <div>
                        <span className="text-[13px]">{txn.itemName}</span>
                        <span className="ml-2 text-[11px] text-subtle">
                          {formatDateShort(txn.ts)}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`font-mono text-[13px] tabular-nums ${txn.type === "SALE" ? "text-muted" : "font-medium text-success"}`}
                    >
                      {txn.type === "SALE" ? `\u2212${txn.qty}` : `+${txn.qty}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-[24px] font-bold tabular-nums tracking-tight ${warn ? "text-danger" : "text-foreground"}`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-subtle">{sub}</p>}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <p className="max-w-[200px] text-center text-[12px] leading-relaxed text-muted">
        {message}
      </p>
    </div>
  );
}

function formatINR(n: number) {
  if (n === 0) return "\u20B90";
  return `\u20B9${n.toLocaleString("en-IN")}`;
}

function formatDateShort(ts: string) {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}
