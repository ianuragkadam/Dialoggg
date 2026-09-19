import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("Gantt engine covers working days, four dependency types, cascade, cycles, rollups, and concurrency", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-gantt-engine-"));
  try {
    const env = { ...process.env, NODE_ENV: "test", RAILWAY_VOLUME_MOUNT_PATH: dataDirectory };
    const migrate = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/db/migrate.ts"], { cwd: root, env, encoding: "utf8" });
    assert.equal(migrate.status, 0, `${migrate.stdout}\n${migrate.stderr}`);
    const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/test-gantt-engine.mts"], { cwd: root, env, encoding: "utf8" });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /golden checks passed/);
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
