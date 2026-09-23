import { spawnSync } from "node:child_process";
import { assertProductionConfig } from "./validate-production-config.mjs";
import { startEmailWorkerLoop } from "./start-email-worker.mjs";

assertProductionConfig({ ...process.env, NODE_ENV: "production" });

const migration = spawnSync(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "src/db/migrate.ts"],
  { cwd: process.cwd(), env: process.env, stdio: "inherit" },
);
if (migration.error) throw migration.error;
if (migration.status !== 0) process.exit(migration.status ?? 1);

startEmailWorkerLoop();
await import("./start-production.mjs");
