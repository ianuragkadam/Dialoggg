import { spawnSync } from "node:child_process";

const migration = spawnSync(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "src/db/migrate.ts"],
  { cwd: process.cwd(), env: process.env, stdio: "inherit" },
);
if (migration.error) throw migration.error;
if (migration.status !== 0) process.exit(migration.status ?? 1);

await import("./start-production.mjs");
