import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("transactional email delivery encrypts, expires, retries, dead-letters, and defers safely", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-email-delivery-"));
  const environment = {
    ...process.env,
    NODE_ENV: "test",
    RAILWAY_VOLUME_MOUNT_PATH: dataDirectory,
    APP_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString("base64"),
    INTEGRATION_PROVIDER_MODE: "fake",
    APP_BASE_URL: "http://127.0.0.1:3030",
  };
  try {
    const migration = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/db/migrate.ts"], { cwd: process.cwd(), env: environment, encoding: "utf8" });
    assert.equal(migration.status, 0, `${migration.stdout}\n${migration.stderr}`);
    const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/test-email-delivery.mts"], { cwd: process.cwd(), env: environment, encoding: "utf8" });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Email delivery engine verified/);
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
