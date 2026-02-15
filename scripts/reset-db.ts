/**
 * Drop all tables and re-push the schema. Nuclear option for dev.
 *
 * Usage:
 *   bun run db:reset
 */

import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is unset");

const sql = neon(url);
await sql`DROP TABLE IF EXISTS reminders, ledger_entries, ledger_parties, transactions, items, stores, org_members, organizations, users CASCADE`;
console.log("All tables dropped.");

import { execSync } from "child_process";
execSync("bunx drizzle-kit push --force", { stdio: "inherit" });
console.log("Schema re-pushed.");
