/**
 * Push the Drizzle schema to Neon Postgres.
 *
 * Usage:
 *   bun run db:push
 */

import { execSync } from "child_process";

execSync("bunx drizzle-kit push", { stdio: "inherit" });
