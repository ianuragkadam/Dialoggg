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
    assert.match(second.stdout, /version 7/);

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
          { version: 5, name: "project_type_invariants" },
          { version: 6, name: "project_template_invariants" },
          { version: 7, name: "membership_access_invariants" },
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

test("membership access migration enforces Owner, tenant, linked Resource, and External assignment invariants", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-membership-invariants-"));
  try {
    const result = migrate(dataDirectory);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const database = new Database(path.join(dataDirectory, "dialoggg.db"));
    database.pragma("foreign_keys = ON");
    try {
      const companyOne = Number(database.prepare("INSERT INTO company (name) VALUES ('Access One')").run().lastInsertRowid);
      const companyTwo = Number(database.prepare("INSERT INTO company (name) VALUES ('Access Two')").run().lastInsertRowid);
      const typeOne = Number(database.prepare("INSERT INTO project_type (company_id, name, normalized_name) VALUES (?, 'Type One', 'type one')").run(companyOne).lastInsertRowid);
      const typeTwo = Number(database.prepare("INSERT INTO project_type (company_id, name, normalized_name) VALUES (?, 'Type Two', 'type two')").run(companyTwo).lastInsertRowid);
      const projectOne = Number(database.prepare("INSERT INTO project (company_id, project_type_id, name, start_date) VALUES (?, ?, 'Project One', '2026-09-17')").run(companyOne, typeOne).lastInsertRowid);
      const projectTwo = Number(database.prepare("INSERT INTO project (company_id, project_type_id, name, start_date) VALUES (?, ?, 'Project Two', '2026-09-17')").run(companyTwo, typeTwo).lastInsertRowid);
      const ownerIdentity = Number(database.prepare("INSERT INTO identity (normalized_email, password_hash, first_name, status) VALUES ('owner@one.test', 'hash', 'Owner', 'active')").run().lastInsertRowid);
      const ownerMembership = Number(database.prepare("INSERT INTO company_membership (identity_id, company_id, role, status) VALUES (?, ?, 'owner', 'active')").run(ownerIdentity, companyOne).lastInsertRowid);
      const externalIdentity = Number(database.prepare("INSERT INTO identity (normalized_email, password_hash, first_name, status) VALUES ('external@one.test', 'hash', 'External', 'active')").run().lastInsertRowid);
      const externalMembership = Number(database.prepare("INSERT INTO company_membership (identity_id, company_id, role, status) VALUES (?, ?, 'external', 'pending')").run(externalIdentity, companyOne).lastInsertRowid);

      assert.throws(() => database.prepare("UPDATE company_membership SET role = 'admin' WHERE id = ?").run(ownerMembership), /FINAL_ACTIVE_OWNER_REQUIRED/);
      assert.throws(() => database.prepare("UPDATE company_membership SET status = 'deactivated' WHERE id = ?").run(ownerMembership), /FINAL_ACTIVE_OWNER_REQUIRED/);
      assert.throws(() => database.prepare("INSERT INTO project_membership (project_id, company_membership_id) VALUES (?, ?)").run(projectTwo, externalMembership), /PROJECT_MEMBERSHIP_SCOPE_INVALID/);
      assert.throws(() => database.prepare("INSERT INTO invitation_token (membership_id, token_hash, expires_at) VALUES (?, 'missing-project', datetime('now', '+1 day'))").run(externalMembership), /EXTERNAL_PROJECT_REQUIRED/);
      database.prepare("INSERT INTO project_membership (project_id, company_membership_id) VALUES (?, ?)").run(projectOne, externalMembership);
      database.prepare("UPDATE company_membership SET status = 'active' WHERE id = ?").run(externalMembership);
      assert.throws(() => database.prepare("DELETE FROM project_membership WHERE company_membership_id = ?").run(externalMembership), /EXTERNAL_PROJECT_REQUIRED/);
      const category = Number(database.prepare("INSERT INTO resource_category (company_id, name) VALUES (?, 'Employee')").run(companyTwo).lastInsertRowid);
      assert.throws(() => database.prepare("INSERT INTO resource (company_id, category_id, name, linked_membership_id) VALUES (?, ?, 'Cross linked', ?)").run(companyTwo, category, externalMembership), /RESOURCE_MEMBERSHIP_SCOPE_INVALID/);
    } finally {
      assert.equal(database.pragma("foreign_key_check").length, 0);
      database.close();
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

test("Project Type migration enforces required same-company types and safe deletion", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-project-type-invariants-"));
  try {
    const result = migrate(dataDirectory);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const database = new Database(path.join(dataDirectory, "dialoggg.db"));
    database.pragma("foreign_keys = ON");
    try {
      const firstCompany = Number(database.prepare("INSERT INTO company (name) VALUES ('First Company')").run().lastInsertRowid);
      const secondCompany = Number(database.prepare("INSERT INTO company (name) VALUES ('Second Company')").run().lastInsertRowid);
      const firstType = Number(database.prepare("INSERT INTO project_type (company_id, name, normalized_name) VALUES (?, 'Acrylic', 'acrylic')").run(firstCompany).lastInsertRowid);
      const secondType = Number(database.prepare("INSERT INTO project_type (company_id, name, normalized_name) VALUES (?, 'Hardwood', 'hardwood')").run(secondCompany).lastInsertRowid);

      assert.throws(
        () => database.prepare("INSERT INTO project (company_id, name, start_date) VALUES (?, 'Missing type', '2026-09-17')").run(firstCompany),
        /PROJECT_TYPE_REQUIRED_OR_INVALID/,
      );
      assert.throws(
        () => database.prepare("INSERT INTO project (company_id, name, project_type_id, start_date) VALUES (?, 'Cross-company type', ?, '2026-09-17')").run(firstCompany, secondType),
        /PROJECT_TYPE_REQUIRED_OR_INVALID/,
      );
      const projectId = Number(database.prepare("INSERT INTO project (company_id, name, project_type_id, start_date) VALUES (?, 'Valid Project', ?, '2026-09-17')").run(firstCompany, firstType).lastInsertRowid);
      assert.throws(() => database.prepare("UPDATE project SET project_type_id = NULL WHERE id = ?").run(projectId), /PROJECT_TYPE_REQUIRED_OR_INVALID/);
      assert.throws(() => database.prepare("DELETE FROM project_type WHERE id = ?").run(firstType), /PROJECT_TYPE_IN_USE/);
      assert.throws(
        () => database.prepare("UPDATE project SET project_type_id = ? WHERE id = ?").run(secondType, projectId),
        /PROJECT_TYPE_REQUIRED_OR_INVALID/,
      );
    } finally {
      assert.equal(database.prepare("SELECT COUNT(*) AS count FROM project WHERE project_type_id IS NULL").get().count, 0);
      database.close();
    }
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("Project Template migration enforces tenant-scoped sources, graph references, offsets, and Task categories", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-project-template-invariants-"));
  try {
    const result = migrate(dataDirectory);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const database = new Database(path.join(dataDirectory, "dialoggg.db"));
    database.pragma("foreign_keys = ON");
    try {
      const companyOne = Number(database.prepare("INSERT INTO company (name) VALUES ('Template Company One')").run().lastInsertRowid);
      const companyTwo = Number(database.prepare("INSERT INTO company (name) VALUES ('Template Company Two')").run().lastInsertRowid);
      const typeOne = Number(database.prepare("INSERT INTO project_type (company_id, name, normalized_name) VALUES (?, 'Type One', 'type one')").run(companyOne).lastInsertRowid);
      const projectOne = Number(database.prepare("INSERT INTO project (company_id, project_type_id, name, start_date) VALUES (?, ?, 'Source One', '2026-09-17')").run(companyOne, typeOne).lastInsertRowid);
      const identity = Number(database.prepare("INSERT INTO identity (normalized_email, password_hash, first_name, status) VALUES ('template@example.test', 'hash', 'Template', 'active')").run().lastInsertRowid);
      const membershipOne = Number(database.prepare("INSERT INTO company_membership (identity_id, company_id, role, status) VALUES (?, ?, 'admin', 'active')").run(identity, companyOne).lastInsertRowid);
      const membershipTwo = Number(database.prepare("INSERT INTO company_membership (identity_id, company_id, role, status) VALUES (?, ?, 'admin', 'active')").run(identity, companyTwo).lastInsertRowid);

      assert.throws(() => database.prepare(`
        INSERT INTO project_template (company_id, source_project_id, name, normalized_name, created_by_membership_id)
        VALUES (?, ?, 'Cross scope', 'cross scope', ?)
      `).run(companyOne, projectOne, membershipTwo), /PROJECT_TEMPLATE_SCOPE_INVALID/);
      const templateId = Number(database.prepare(`
        INSERT INTO project_template (company_id, source_project_id, source_project_name, name, normalized_name, created_by_membership_id)
        VALUES (?, ?, 'Source One', 'Safe Template', 'safe template', ?)
      `).run(companyOne, projectOne, membershipOne).lastInsertRowid);
      assert.throws(() => database.prepare(`
        INSERT INTO template_task (template_id, template_ref, name, relative_start_workdays, duration_workdays)
        VALUES (?, 'negative', 'Negative offset', -1, 1)
      `).run(templateId), /TEMPLATE_TASK_OFFSET_INVALID/);
      database.prepare(`INSERT INTO template_task (template_id, template_ref, name, duration_workdays) VALUES (?, 'a', 'Task A', 1)`).run(templateId);
      database.prepare(`INSERT INTO template_task (template_id, template_ref, name, duration_workdays) VALUES (?, 'b', 'Task B', 1)`).run(templateId);
      assert.throws(() => database.prepare(`
        INSERT INTO template_dependency (template_id, source_ref, target_ref, link_type) VALUES (?, 'a', 'missing', 'fs')
      `).run(templateId), /TEMPLATE_DEPENDENCY_INVALID/);
      database.prepare(`INSERT INTO template_dependency (template_id, source_ref, target_ref, link_type) VALUES (?, 'a', 'b', 'fs')`).run(templateId);

      const categoryTwo = Number(database.prepare("INSERT INTO resource_category (company_id, name) VALUES (?, 'Other Company Category')").run(companyTwo).lastInsertRowid);
      assert.throws(() => database.prepare(`
        INSERT INTO task (project_id, name, start_date, duration, resource_category_id) VALUES (?, 'Scoped Task', '2026-09-17', 1, ?)
      `).run(projectOne, categoryTwo), /TASK_RESOURCE_CATEGORY_SCOPE_INVALID/);
    } finally {
      assert.equal(database.pragma("foreign_key_check").length, 0);
      database.close();
    }
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
