import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

const root = process.cwd();
const migrate = dataDirectory => spawnSync(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "src/db/migrate.ts"],
  {
    cwd: root,
    env: { ...process.env, NODE_ENV: "test", RAILWAY_VOLUME_MOUNT_PATH: dataDirectory },
    encoding: "utf8",
  },
);

const migrateProduction = dataDirectory => spawnSync(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "src/db/migrate.ts"],
  {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production", RAILWAY_VOLUME_MOUNT_PATH: dataDirectory },
    encoding: "utf8",
  },
);

test("versioned migration backfills identity/membership data and is idempotent", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-migration-"));
  const databasePath = path.join(dataDirectory, "dialoggg.db");
  try {
    const legacy = new Database(databasePath);
    legacy.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE company (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'active'
      );
      CREATE TABLE user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        phone TEXT,
        user_type TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES company(id)
      );
      INSERT INTO company (id, name) VALUES (1, 'Migration Company');
      INSERT INTO user (id, company_id, email, password_hash, full_name, user_type)
        VALUES (1, 1, 'viewer@example.test', 'hash-one', 'Jamie Morgan', 'viewer');
      INSERT INTO user (id, company_id, email, password_hash, full_name, user_type)
        VALUES (2, NULL, 'platform@example.test', 'hash-two', 'Platform Admin', 'super_admin');
    `);
    legacy.close();

    const first = migrate(dataDirectory);
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
    assert.match(first.stdout, /Applied migration 1/);
    assert.match(first.stdout, /Applied migration 2/);

    const second = migrate(dataDirectory);
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
    assert.doesNotMatch(second.stdout, /Applied migration/);
    assert.match(second.stdout, /version 4/);

    const migrated = new Database(databasePath, { readonly: true });
    try {
      assert.equal(migrated.pragma("integrity_check", { simple: true }), "ok");
      assert.deepEqual(
        migrated.prepare("SELECT version, name FROM schema_migration ORDER BY version").all(),
        [
          { version: 1, name: "legacy_foundation" },
          { version: 2, name: "identity_membership_and_v1_domain_foundation" },
          { version: 3, name: "invitation_reset_and_membership_resource_link" },
          { version: 4, name: "company_lifecycle_and_unique_name" },
        ],
      );
      assert.equal(migrated.prepare("SELECT COUNT(*) AS count FROM identity").get().count, 2);
      assert.deepEqual(
        migrated.prepare("SELECT role, status FROM company_membership").get(),
        { role: "employee", status: "active" },
      );
      assert.equal(
        migrated.prepare("SELECT is_platform_admin FROM identity WHERE normalized_email = ?").get("platform@example.test").is_platform_admin,
        1,
      );
      assert.equal(
        migrated.prepare("SELECT COUNT(*) AS count FROM company_membership WHERE identity_id = (SELECT id FROM identity WHERE normalized_email = ?)").get("platform@example.test").count,
        0,
      );
      assert.equal(migrated.prepare("SELECT COUNT(*) AS count FROM resource_category WHERE company_id = 1").get().count, 5);
      assert.deepEqual(
        migrated.prepare("SELECT state, pause_reason FROM company_google_sync_state WHERE company_id = 1").get(),
        { state: "active", pause_reason: null },
      );
    } finally {
      migrated.close();
    }
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("migration history tampering fails closed", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-migration-checksum-"));
  try {
    const first = migrate(dataDirectory);
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);

    const database = new Database(path.join(dataDirectory, "dialoggg.db"));
    database.prepare("UPDATE schema_migration SET checksum = 'tampered' WHERE version = 1").run();
    database.close();

    const second = migrate(dataDirectory);
    assert.notEqual(second.status, 0);
    assert.match(`${second.stdout}\n${second.stderr}`, /modified after application|checksum/i);
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("production migration creates and verifies a pre-migration backup", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-production-migration-"));
  try {
    const database = new Database(path.join(dataDirectory, "dialoggg.db"));
    database.exec(`
      CREATE TABLE company (id INTEGER PRIMARY KEY, name TEXT NOT NULL, status TEXT DEFAULT 'active');
      CREATE TABLE user (
        id INTEGER PRIMARY KEY, company_id INTEGER, email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, full_name TEXT, phone TEXT, user_type TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO company (id, name) VALUES (1, 'Backup Source');
      INSERT INTO user (id, company_id, email, password_hash, full_name, user_type)
        VALUES (1, 1, 'backup@example.test', 'hash', 'Backup User', 'admin');
    `);
    database.close();
    const result = migrateProduction(dataDirectory);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Pre-migration backup verified:/);
    assert.match(result.stdout, /sha256 [a-f0-9]{64}/);
    const backupDirectory = path.join(dataDirectory, "backups");
    const { readdir } = await import("node:fs/promises");
    const files = (await readdir(backupDirectory)).filter(file => file.endsWith(".db"));
    assert.equal(files.length, 1);
    const backup = new Database(path.join(backupDirectory, files[0]), { readonly: true });
    try {
      assert.equal(backup.pragma("integrity_check", { simple: true }), "ok");
      assert.equal(backup.prepare("SELECT name FROM company WHERE id = 1").get().name, "Backup Source");
    } finally { backup.close(); }
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
