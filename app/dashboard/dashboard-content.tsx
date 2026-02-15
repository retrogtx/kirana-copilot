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
  const totalUdhar = ledger.reduce((sum, p) => sum + Math.max(0, p.balance), 0);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] antialiased">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium tracking-tight text-[#888]">
            Kirana Copilot
          </span>
          <span className="text-[11px] text-[#333]">/</span>
          <span className="text-[13px] text-[#555]">{org.orgName}</span>
          {org.role === "admin" && (
            <span className="rounded-full bg-[#1a1a1a] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-500">
              admin
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {user?.photoUrl && (
            <img
              src={user.photoUrl}
              alt=""
              className="h-5 w-5 rounded-full opacity-70"
            />
          )}
          <span className="text-[13px] text-[#555]">{user?.firstName}</span>
          <LogoutButton />
        </div>
      </nav>

      <div className="mx-auto max-w-[1200px] px-6 pb-20">
        {/* Invite code banner for admins */}
        {org.role === "admin" && (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-[#1a1a1a] bg-[#111] px-5 py-3">
            <span className="text-[12px] text-[#666]">
              Invite code — share with your team to join this org
            </span>
            <span className="font-mono text-[14px] font-medium tracking-widest text-amber-500">
              {org.inviteCode}
            </span>
          </div>
        )}

        {/* Header */}
        <div className="pb-8 pt-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#444]">
            {new Date(summary.date + "T00:00:00").toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-[#fafafa]">
            Overview
          </h1>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-x-10 gap-y-6 pb-10 sm:grid-cols-4">
          <Metric label="Revenue" value={formatINR(summary.salesRevenue)} />
          <Metric
            label="Sales"
            value={`${summary.salesQty}`}
            sub={`${summary.salesCount} orders`}
          />
          <Metric
            label="Udhar"
            value={formatINR(summary.newUdhar)}
            warn={summary.newUdhar > 0}
          />
          <Metric
            label="Collected"
            value={formatINR(summary.paymentsReceived)}
          />
        </div>

        <div className="h-px bg-[#1a1a1a]" />

        {/* Three columns */}
        <div className="grid gap-0 lg:grid-cols-12">
          {/* Inventory */}
          <section className="border-r border-[#1a1a1a] py-8 pr-8 lg:col-span-5">
            <div className="mb-5 flex items-baseline justify-between">
              <h2 className="text-[13px] font-medium text-[#888]">Inventory</h2>
              <div className="flex items-center gap-3">
                {lowStockCount > 0 && (
                  <span className="text-[11px] text-[#e5484d]">
                    {lowStockCount} low
                  </span>
                )}
                <span className="text-[11px] text-[#444]">
                  {inventory.length}
                </span>
              </div>
            </div>
            {inventory.length === 0 ? (
              <p className="py-10 text-center text-[12px] text-[#333]">
                No items yet
              </p>
            ) : (
              <div className="space-y-0">
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
                      className="group flex items-center justify-between py-[9px]"
                    >
                      <div className="flex items-center gap-3">
                        {item.isLow && (
                          <span className="h-[5px] w-[5px] rounded-full bg-[#e5484d]" />
                        )}
                        {!item.isLow && (
                          <span className="h-[5px] w-[5px] rounded-full bg-[#2a2a2a] group-hover:bg-[#444]" />
                        )}
                        <span className="text-[13px] text-[#ededed]">
                          {item.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="hidden w-[60px] sm:block">
                          <div className="h-[3px] w-full rounded-full bg-[#1a1a1a]">
                            <div
                              className={`h-[3px] rounded-full ${item.isLow ? "bg-[#e5484d]" : "bg-[#333]"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <span
                          className={`w-8 text-right font-mono text-[13px] ${item.isLow ? "text-[#e5484d]" : "text-[#888]"}`}
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

          {/* Udhar */}
          <section className="border-r border-[#1a1a1a] py-8 px-8 lg:col-span-3">
            <div className="mb-5 flex items-baseline justify-between">
              <h2 className="text-[13px] font-medium text-[#888]">Udhar</h2>
              {totalUdhar > 0 && (
                <span className="font-mono text-[12px] text-[#e5484d]">
                  {formatINR(totalUdhar)}
                </span>
              )}
            </div>
            {ledger.length === 0 ? (
              <p className="py-10 text-center text-[12px] text-[#333]">
                No entries
              </p>
            ) : (
              <div className="space-y-5">
                {ledger.map((party) => (
                  <div key={party.id}>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] text-[#ededed]">
                        {party.name}
                      </span>
                      <span
                        className={`font-mono text-[13px] ${party.balance > 0 ? "text-[#e5484d]" : "text-[#46a758]"}`}
                      >
                        {formatINR(Math.abs(party.balance))}
                      </span>
                    </div>
                    {party.recentEntries.length > 0 && (
                      <div className="mt-1.5 space-y-0.5 pl-0">
                        {party.recentEntries.slice(0, 2).map((e, i) => (
                          <p key={i} className="text-[11px] text-[#444]">
                            {e.amount > 0 ? "+" : "\u2212"}
                            {formatINR(Math.abs(e.amount))}
                            {e.note ? ` ${e.note}` : ""}
                            <span className="ml-1 text-[#333]">
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

          {/* Transactions */}
          <section className="py-8 pl-8 lg:col-span-4">
            <div className="mb-5 flex items-baseline justify-between">
              <h2 className="text-[13px] font-medium text-[#888]">Activity</h2>
              <span className="text-[11px] text-[#444]">
                {recentTxns.length}
              </span>
            </div>
            {recentTxns.length === 0 ? (
              <p className="py-10 text-center text-[12px] text-[#333]">
                No activity
              </p>
            ) : (
              <div className="space-y-0">
                {recentTxns.map((txn) => (
                  <div
                    key={txn.id}
                    className="flex items-center justify-between py-[9px]"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-[5px] w-[5px] rounded-full ${txn.type === "SALE" ? "bg-[#ededed]" : "bg-[#46a758]"}`}
                      />
                      <div>
                        <span className="text-[13px] text-[#ededed]">
                          {txn.itemName}
                        </span>
                        <span className="ml-2 text-[11px] text-[#444]">
                          {formatDateShort(txn.ts)}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`font-mono text-[13px] ${txn.type === "SALE" ? "text-[#888]" : "text-[#46a758]"}`}
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

function Metric({
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
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#555]">
        {label}
      </p>
      <p
        className={`mt-1 text-[22px] font-semibold tabular-nums tracking-tight ${warn ? "text-[#e5484d]" : "text-[#fafafa]"}`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-[#444]">{sub}</p>}
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
