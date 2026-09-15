import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

const root = process.cwd();
const read = relativePath => readFile(path.join(root, relativePath), "utf8");

test("approved product language is centralized and used by the interface", async () => {
  const language = await read("src/lib/product-language.ts");
  const shell = await read("src/components/AppShell.tsx");
  const users = await read("src/app/(app)/users/page.tsx");
  const tabs = await read("src/app/(app)/projects/[id]/tabs-client.tsx");

  assert.match(language, /Employee \(Internal\)/);
  assert.match(language, /External\/Client/);
  assert.match(shell, /roleLabel\(user\.user_type\)/);
  assert.match(users, /roleLabel\("viewer"\)/);
  assert.match(tabs, /Project Calendar/);
  assert.match(tabs, /Project Resources/);
  assert.doesNotMatch(`${shell}\n${users}\n${tabs}`, />\s*Viewer\s*</);
  assert.doesNotMatch(tabs, /Announcement/);
});

test("follow-up workshop keeps nineteen plain-language questions with examples", async () => {
  const definition = await read("src/lib/follow-up-questionnaire.ts");
  const workshopRegistry = await read("src/lib/requirements-workshops.ts");

  const questionIds = [...definition.matchAll(/\n\s*"(fu\d{2})",\n\s*\d+,/g)].map(match => match[1]);
  assert.equal(questionIds.length, 19);
  assert.equal(new Set(questionIds).size, 19);
  assert.deepEqual(questionIds, Array.from({ length: 19 }, (_, index) => `fu${String(index + 1).padStart(2, "0")}`));
  assert.match(definition, /Simple example|Example:/i);
  assert.match(definition, /recommended|true/);
  assert.match(definition, /dialoggg-reboot-follow-up-v1/);
  assert.match(workshopRegistry, /Dialoggg Follow-up Workshop/);
});

test("retired modules are absent from routes and fresh database schema", async () => {
  const retiredRoutes = [
    "src/app/(app)/discussion/page.tsx",
    "src/app/(app)/gallery/page.tsx",
    "src/app/(app)/storage/page.tsx",
    "src/app/(app)/billing/page.tsx",
  ];
  for (const relativePath of retiredRoutes) {
    await assert.rejects(access(path.join(root, relativePath)));
  }

  const schema = await read("src/db/schema.ts");
  for (const retiredTable of ["announcement", "discussion_thread", "discussion_comment", "project_photo", "storage_file"]) {
    assert.doesNotMatch(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${retiredTable}`, "i"));
  }
  assert.doesNotMatch(schema, /plan_type|expiration_date/i);
});

test("production security headers and strict rendering are enabled", async () => {
  const config = await read("next.config.mjs");
  assert.match(config, /reactStrictMode:\s*true/);
  assert.match(config, /poweredByHeader:\s*false/);
  assert.match(config, /X-Content-Type-Options/);
  assert.match(config, /X-Frame-Options/);
  assert.match(config, /Referrer-Policy/);
});

test("database backup command creates a verified SQLite copy", async () => {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-backup-test-"));
  try {
    const livePath = path.join(temporaryDirectory, "dialoggg.db");
    const backupPath = path.join(temporaryDirectory, "verified-backup.db");
    const database = new Database(livePath);
    database.exec("CREATE TABLE proof (value TEXT NOT NULL); INSERT INTO proof VALUES ('preserved');");
    database.close();

    const result = spawnSync(process.execPath, ["scripts/backup-database.mjs", backupPath], {
      cwd: root,
      env: { ...process.env, RAILWAY_VOLUME_MOUNT_PATH: temporaryDirectory },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(backup.prepare("SELECT value FROM proof").pluck().get(), "preserved");
      assert.equal(backup.pragma("integrity_check", { simple: true }), "ok");
    } finally {
      backup.close();
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("database restore requires confirmation and retains a rollback copy", async () => {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-restore-test-"));
  try {
    const livePath = path.join(temporaryDirectory, "dialoggg.db");
    const backupPath = path.join(temporaryDirectory, "incoming-backup.db");
    for (const [databasePath, value] of [[livePath, "before"], [backupPath, "restored"]]) {
      const database = new Database(databasePath);
      database.exec("CREATE TABLE proof (value TEXT NOT NULL)");
      database.prepare("INSERT INTO proof VALUES (?)").run(value);
      database.close();
    }

    const refused = spawnSync(process.execPath, ["scripts/restore-database.mjs", backupPath], {
      cwd: root,
      env: { ...process.env, RAILWAY_VOLUME_MOUNT_PATH: temporaryDirectory },
      encoding: "utf8",
    });
    assert.notEqual(refused.status, 0);

    const restored = spawnSync(process.execPath, ["scripts/restore-database.mjs", backupPath, "--confirm"], {
      cwd: root,
      env: { ...process.env, RAILWAY_VOLUME_MOUNT_PATH: temporaryDirectory },
      encoding: "utf8",
    });
    assert.equal(restored.status, 0, restored.stderr || restored.stdout);

    const database = new Database(livePath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(database.prepare("SELECT value FROM proof").pluck().get(), "restored");
    } finally {
      database.close();
    }
    const names = await readdir(temporaryDirectory);
    assert.ok(names.some(name => name.startsWith("dialoggg-pre-restore-") && name.endsWith(".db")));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
