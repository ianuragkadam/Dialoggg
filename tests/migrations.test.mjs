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
    assert.match(second.stdout, /version 12/);

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
          { version: 8, name: "secure_integration_setup_workshop" },
          { version: 9, name: "resource_management_invariants" },
          { version: 10, name: "project_lifecycle_invariants" },
          { version: 11, name: "gantt_plan_invariants" },
          { version: 12, name: "event_calendar_invariants" },
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

test("integration setup migration enforces invitation, provider scope, version, and cascade invariants", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-integration-setup-"));
  try {
    const result = migrate(dataDirectory);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const database = new Database(path.join(dataDirectory, "dialoggg.db"));
    database.pragma("foreign_keys = ON");
    try {
      const companyId = Number(database.prepare("INSERT INTO company (name) VALUES ('Integration Company')").run().lastInsertRowid);
      assert.throws(() => database.prepare(`
        INSERT INTO integration_setup_invitation (token_hash, access_kind, scope_kind, company_id, expires_at)
        VALUES (?, 'workshop', 'platform', ?, datetime('now', '+1 day'))
      `).run("a".repeat(64), companyId), /CHECK constraint failed/);
      const invitationId = Number(database.prepare(`
        INSERT INTO integration_setup_invitation (token_hash, access_kind, scope_kind, company_id, expires_at)
        VALUES (?, 'workshop', 'platform_and_company', ?, datetime('now', '+1 day'))
      `).run("b".repeat(64), companyId).lastInsertRowid);
      assert.throws(() => database.prepare(`
        INSERT INTO integration_config (provider, scope_kind, company_id) VALUES ('google_platform', 'company', ?)
      `).run(companyId), /CHECK constraint failed/);
      const configId = Number(database.prepare(`
        INSERT INTO integration_config (provider, scope_kind, company_id, status)
        VALUES ('microsoft_company', 'company', ?, 'saved')
      `).run(companyId).lastInsertRowid);
      database.prepare(`
        INSERT INTO integration_credential_version (config_id, version, encrypted_envelope, fingerprint, last_four)
        VALUES (?, 1, 'ciphertext-only', '123456789abc', '1234')
      `).run(configId);
      assert.throws(() => database.prepare(`
        INSERT INTO integration_credential_version (config_id, version, encrypted_envelope, fingerprint, last_four)
        VALUES (?, 2, 'second-ciphertext', 'abcdef123456', '5678')
      `).run(configId), /UNIQUE constraint failed/);
      database.prepare(`
        INSERT INTO integration_setup_session (invitation_id, token_hash, csrf_hash, expires_at)
        VALUES (?, ?, ?, datetime('now', '+1 hour'))
      `).run(invitationId, "c".repeat(64), "d".repeat(64));
      database.prepare("DELETE FROM company WHERE id = ?").run(companyId);
      assert.equal(database.prepare("SELECT COUNT(*) AS count FROM integration_setup_invitation").get().count, 0);
      assert.equal(database.prepare("SELECT COUNT(*) AS count FROM integration_setup_session").get().count, 0);
      assert.equal(database.prepare("SELECT COUNT(*) AS count FROM integration_credential_version").get().count, 0);
    } finally {
      assert.equal(database.pragma("foreign_key_check").length, 0);
      database.close();
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
      assert.throws(() => database.prepare("INSERT INTO resource (company_id, category_id, name, normalized_name, linked_membership_id) VALUES (?, ?, 'Cross linked', 'cross linked', ?)").run(companyTwo, category, externalMembership), /RESOURCE_SCOPE_INVALID/);
    } finally {
      assert.equal(database.pragma("foreign_key_check").length, 0);
      database.close();
    }
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("Resource migration enforces fixed categories, tenant scope, one-to-one User links, and active assignments", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-resource-invariants-"));
  try {
    const result = migrate(dataDirectory);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const database = new Database(path.join(dataDirectory, "dialoggg.db"));
    database.pragma("foreign_keys = ON");
    try {
      const companyOne = Number(database.prepare("INSERT INTO company (name) VALUES ('Resource One')").run().lastInsertRowid);
      const companyTwo = Number(database.prepare("INSERT INTO company (name) VALUES ('Resource Two')").run().lastInsertRowid);
      const insertCategory = database.prepare("INSERT INTO resource_category (company_id, name) VALUES (?, ?)");
      for (const companyId of [companyOne, companyTwo]) {
        for (const name of ["Employee", "Subcontractor", "Supplier", "Equipment", "Other"]) insertCategory.run(companyId, name);
      }
      const categoryOne = database.prepare("SELECT id FROM resource_category WHERE company_id = ? AND name = 'Employee'").get(companyOne).id;
      const categoryTwo = database.prepare("SELECT id FROM resource_category WHERE company_id = ? AND name = 'Employee'").get(companyTwo).id;
      const identityOne = Number(database.prepare("INSERT INTO identity (normalized_email, password_hash, first_name, status) VALUES ('resource-one@example.test', 'hash', 'One', 'active')").run().lastInsertRowid);
      const identityTwo = Number(database.prepare("INSERT INTO identity (normalized_email, password_hash, first_name, status) VALUES ('resource-two@example.test', 'hash', 'Two', 'active')").run().lastInsertRowid);
      const membershipOne = Number(database.prepare("INSERT INTO company_membership (identity_id, company_id, role, status) VALUES (?, ?, 'owner', 'active')").run(identityOne, companyOne).lastInsertRowid);
      const membershipTwo = Number(database.prepare("INSERT INTO company_membership (identity_id, company_id, role, status) VALUES (?, ?, 'owner', 'active')").run(identityTwo, companyTwo).lastInsertRowid);
      const linkedIdentity = Number(database.prepare("INSERT INTO identity (normalized_email, password_hash, first_name, status) VALUES ('resource-link@example.test', 'hash', 'Linked', 'active')").run().lastInsertRowid);
      const linkedMembership = Number(database.prepare("INSERT INTO company_membership (identity_id, company_id, role, status) VALUES (?, ?, 'employee', 'active')").run(linkedIdentity, companyOne).lastInsertRowid);
      const resourceOne = Number(database.prepare(`
        INSERT INTO resource (company_id, category_id, name, normalized_name, linked_membership_id, status)
        VALUES (?, ?, 'Crew One', 'crew one', ?, 'active')
      `).run(companyOne, categoryOne, linkedMembership).lastInsertRowid);
      const resourceTwo = Number(database.prepare(`
        INSERT INTO resource (company_id, category_id, name, normalized_name, linked_membership_id, status)
        VALUES (?, ?, 'Crew Two', 'crew two', ?, 'active')
      `).run(companyTwo, categoryTwo, membershipTwo).lastInsertRowid);

      assert.throws(() => insertCategory.run(companyOne, "Custom"), /RESOURCE_CATEGORY_FIXED/);
      assert.throws(() => insertCategory.run(companyOne, "Employee"), /UNIQUE constraint failed/);
      assert.throws(() => database.prepare("UPDATE resource_category SET name = 'Custom' WHERE id = ?").run(categoryOne), /RESOURCE_CATEGORY_FIXED/);
      assert.throws(() => database.prepare("DELETE FROM resource_category WHERE id = ?").run(categoryOne), /RESOURCE_CATEGORY_FIXED/);
      assert.throws(() => database.prepare(`
        INSERT INTO resource (company_id, category_id, name, normalized_name, status)
        VALUES (?, ?, 'Wrong Category', 'wrong category', 'active')
      `).run(companyOne, categoryTwo), /RESOURCE_SCOPE_INVALID/);
      assert.throws(() => database.prepare(`
        INSERT INTO resource (company_id, category_id, name, normalized_name, linked_membership_id, status)
        VALUES (?, ?, 'Second Link', 'second link', ?, 'active')
      `).run(companyOne, categoryOne, linkedMembership), /UNIQUE constraint failed/);
      assert.throws(() => database.prepare(`
        INSERT INTO resource (company_id, category_id, name, normalized_name, status)
        VALUES (?, ?, 'Crew One', 'crew one', 'active')
      `).run(companyOne, categoryOne), /UNIQUE constraint failed/);

      const typeOne = Number(database.prepare("INSERT INTO project_type (company_id, name, normalized_name) VALUES (?, 'Type One', 'type one')").run(companyOne).lastInsertRowid);
      const typeTwo = Number(database.prepare("INSERT INTO project_type (company_id, name, normalized_name) VALUES (?, 'Type Two', 'type two')").run(companyTwo).lastInsertRowid);
      const projectOne = Number(database.prepare("INSERT INTO project (company_id, project_type_id, name, start_date) VALUES (?, ?, 'Project One', '2026-09-19')").run(companyOne, typeOne).lastInsertRowid);
      const projectTwo = Number(database.prepare("INSERT INTO project (company_id, project_type_id, name, start_date) VALUES (?, ?, 'Project Two', '2026-09-19')").run(companyTwo, typeTwo).lastInsertRowid);
      const rootOne = database.prepare("SELECT id FROM task WHERE project_id=? AND is_root=1").get(projectOne).id;
      const rootTwo = database.prepare("SELECT id FROM task WHERE project_id=? AND is_root=1").get(projectTwo).id;
      const taskOne = Number(database.prepare("INSERT INTO task (project_id, parent_id, name, start_date, manual_start_date, duration) VALUES (?, ?, 'Task One', '2026-09-19', '2026-09-19', 1)").run(projectOne, rootOne).lastInsertRowid);
      const taskOneLater = Number(database.prepare("INSERT INTO task (project_id, parent_id, name, start_date, manual_start_date, duration) VALUES (?, ?, 'Task Later', '2026-09-20', '2026-09-20', 1)").run(projectOne, rootOne).lastInsertRowid);
      const taskTwo = Number(database.prepare("INSERT INTO task (project_id, parent_id, name, start_date, manual_start_date, duration) VALUES (?, ?, 'Task Two', '2026-09-19', '2026-09-19', 1)").run(projectTwo, rootTwo).lastInsertRowid);
      database.prepare("INSERT INTO task_resource (task_id, resource_id) VALUES (?, ?)").run(taskOne, resourceOne);
      assert.throws(() => database.prepare("INSERT INTO task_resource (task_id, resource_id) VALUES (?, ?)").run(taskTwo, resourceOne), /TASK_RESOURCE_SCOPE_OR_STATUS_INVALID/);

      const eventOne = Number(database.prepare(`
        INSERT INTO event_series (company_id, project_id, title, timing_mode, start_date, end_date, time_zone, created_by_membership_id)
        VALUES (?, ?, 'Event One', 'all_day', '2026-09-19', '2026-09-20', 'America/New_York', ?)
      `).run(companyOne, projectOne, membershipOne).lastInsertRowid);
      const eventTwo = Number(database.prepare(`
        INSERT INTO event_series (company_id, project_id, title, timing_mode, start_date, end_date, time_zone, created_by_membership_id)
        VALUES (?, ?, 'Event Two', 'all_day', '2026-09-19', '2026-09-20', 'America/New_York', ?)
      `).run(companyTwo, projectTwo, membershipTwo).lastInsertRowid);
      database.prepare("INSERT INTO event_resource (series_id, resource_id) VALUES (?, ?)").run(eventOne, resourceOne);
      assert.throws(() => database.prepare("INSERT INTO event_resource (series_id, resource_id) VALUES (?, ?)").run(eventTwo, resourceOne), /EVENT_RESOURCE_SCOPE_OR_STATUS_INVALID/);

      database.prepare("UPDATE company_membership SET status = 'deactivated' WHERE id = ?").run(linkedMembership);
      database.prepare("UPDATE resource SET status = 'inactive' WHERE id = ?").run(resourceOne);
      assert.equal(database.prepare("SELECT linked_membership_id FROM resource WHERE id = ?").get(resourceOne).linked_membership_id, linkedMembership);
      assert.equal(database.prepare("SELECT COUNT(*) AS count FROM task_resource WHERE resource_id = ?").get(resourceOne).count, 1);
      assert.equal(database.prepare("SELECT COUNT(*) AS count FROM event_resource WHERE resource_id = ?").get(resourceOne).count, 1);
      assert.throws(() => database.prepare("INSERT INTO task_resource (task_id, resource_id) VALUES (?, ?)").run(taskOneLater, resourceOne), /TASK_RESOURCE_SCOPE_OR_STATUS_INVALID/);
      assert.throws(() => database.prepare("INSERT INTO event_resource (series_id, resource_id) VALUES (?, ?)").run(eventOne, resourceTwo), /EVENT_RESOURCE_SCOPE_OR_STATUS_INVALID/);
    } finally {
      assert.equal(database.pragma("foreign_key_check").length, 0);
      database.close();
    }
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("Project lifecycle migration enforces approved transitions and archived-only deletion", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-project-lifecycle-"));
  try {
    const result = migrate(dataDirectory);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const database = new Database(path.join(dataDirectory, "dialoggg.db"));
    database.pragma("foreign_keys = ON");
    try {
      const companyId = Number(database.prepare("INSERT INTO company (name) VALUES ('Lifecycle Company')").run().lastInsertRowid);
      const projectTypeId = Number(database.prepare("INSERT INTO project_type (company_id, name, normalized_name) VALUES (?, 'Lifecycle', 'lifecycle')").run(companyId).lastInsertRowid);
      assert.throws(
        () => database.prepare("INSERT INTO project (company_id, project_type_id, name, status, start_date) VALUES (?, ?, 'Invalid initial state', 'completed', '2026-09-19')").run(companyId, projectTypeId),
        /PROJECT_LIFECYCLE_INVALID/,
      );
      const projectId = Number(database.prepare("INSERT INTO project (company_id, project_type_id, name, start_date) VALUES (?, ?, 'Lifecycle Project', '2026-09-19')").run(companyId, projectTypeId).lastInsertRowid);
      assert.throws(() => database.prepare("DELETE FROM project WHERE id = ?").run(projectId), /PROJECT_ARCHIVE_REQUIRED/);
      database.prepare("UPDATE project SET status = 'completed' WHERE id = ?").run(projectId);
      database.prepare("UPDATE project SET status = 'active' WHERE id = ?").run(projectId);
      database.prepare("UPDATE project SET status = 'archived' WHERE id = ?").run(projectId);
      assert.throws(() => database.prepare("UPDATE project SET status = 'completed' WHERE id = ?").run(projectId), /PROJECT_LIFECYCLE_INVALID/);
      database.prepare("UPDATE project SET status = 'active' WHERE id = ?").run(projectId);
      database.prepare("UPDATE project SET status = 'completed' WHERE id = ?").run(projectId);
      database.prepare("UPDATE project SET status = 'archived' WHERE id = ?").run(projectId);
      database.prepare("INSERT INTO audit_event(project_id,action,target_type,target_id,result) VALUES(?,'project.archive','project',?,'success')").run(projectId, String(projectId));
      assert.equal(database.prepare("DELETE FROM project WHERE id = ?").run(projectId).changes, 1);
      assert.deepEqual(database.prepare("SELECT project_id,target_id FROM audit_event WHERE action='project.archive'").get(), { project_id: null, target_id: String(projectId) });
      assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_project_company_status_updated'").get());
    } finally {
      assert.equal(database.pragma("foreign_key_check").length, 0);
      database.close();
    }
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("Gantt migration creates one protected root and enforces hierarchy and dependency scope", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-gantt-invariants-"));
  try {
    const result = migrate(dataDirectory);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const database = new Database(path.join(dataDirectory, "dialoggg.db"));
    database.pragma("foreign_keys = ON");
    try {
      const companyOne = Number(database.prepare("INSERT INTO company(name) VALUES('Gantt One')").run().lastInsertRowid);
      const companyTwo = Number(database.prepare("INSERT INTO company(name) VALUES('Gantt Two')").run().lastInsertRowid);
      const typeOne = Number(database.prepare("INSERT INTO project_type(company_id,name,normalized_name) VALUES(?,'Court','court')").run(companyOne).lastInsertRowid);
      const typeTwo = Number(database.prepare("INSERT INTO project_type(company_id,name,normalized_name) VALUES(?,'Field','field')").run(companyTwo).lastInsertRowid);
      const projectOne = Number(database.prepare("INSERT INTO project(company_id,project_type_id,name,start_date) VALUES(?,?,'Plan One','2026-09-18')").run(companyOne,typeOne).lastInsertRowid);
      const projectTwo = Number(database.prepare("INSERT INTO project(company_id,project_type_id,name,start_date) VALUES(?,?,'Plan Two','2026-09-18')").run(companyTwo,typeTwo).lastInsertRowid);
      const rootOne = database.prepare("SELECT id,is_header,parent_id FROM task WHERE project_id=? AND is_root=1").get(projectOne);
      const rootTwo = database.prepare("SELECT id FROM task WHERE project_id=? AND is_root=1").get(projectTwo);
      assert.deepEqual({ is_header: rootOne.is_header, parent_id: rootOne.parent_id }, { is_header: 1, parent_id: null });
      assert.equal(database.prepare("SELECT COUNT(*) count FROM task WHERE project_id=? AND is_root=1").get(projectOne).count, 1);
      const header = Number(database.prepare("INSERT INTO task(project_id,parent_id,name,start_date,manual_start_date,duration,is_header) VALUES(?,?, 'Header','2026-09-18','2026-09-18',1,1)").run(projectOne,rootOne.id).lastInsertRowid);
      const first = Number(database.prepare("INSERT INTO task(project_id,parent_id,name,start_date,manual_start_date,duration) VALUES(?,?,'First','2026-09-18','2026-09-18',2)").run(projectOne,header).lastInsertRowid);
      const second = Number(database.prepare("INSERT INTO task(project_id,parent_id,name,start_date,manual_start_date,duration) VALUES(?,?,'Second','2026-09-21','2026-09-21',1)").run(projectOne,header).lastInsertRowid);
      assert.throws(() => database.prepare("INSERT INTO task(project_id,parent_id,name,start_date,manual_start_date,duration) VALUES(?,?,'Cross','2026-09-18','2026-09-18',1)").run(projectOne,rootTwo.id), /GANTT_TASK_SCOPE_INVALID/);
      assert.throws(() => database.prepare("DELETE FROM task WHERE id=?").run(rootOne.id), /GANTT_ROOT_PROTECTED/);
      assert.throws(() => database.prepare("DELETE FROM task WHERE id=?").run(header), /GANTT_HEADER_NOT_EMPTY/);
      assert.throws(() => database.prepare("INSERT INTO task_link(project_id,source_task_id,target_task_id,link_type,lag_days) VALUES(?,?,?,?,?)").run(projectOne,first,header,"fs",0), /GANTT_LINK_SCOPE_INVALID/);
      database.prepare("INSERT INTO task_link(project_id,source_task_id,target_task_id,link_type,lag_days) VALUES(?,?,?,?,?)").run(projectOne,first,second,"fs",0);
      assert.throws(() => database.prepare("INSERT INTO task_link(project_id,source_task_id,target_task_id,link_type,lag_days) VALUES(?,?,?,?,?)").run(projectOne,first,second,"ss",0), /UNIQUE constraint failed/);
      assert.throws(() => database.prepare("UPDATE task_link SET lag_days=-1 WHERE source_task_id=? AND target_task_id=?").run(first,second), /GANTT_LINK_SCOPE_INVALID/);
      database.prepare("UPDATE task SET progress=1 WHERE id=?").run(first);
      assert.throws(() => database.prepare("DELETE FROM task WHERE id=?").run(first), /GANTT_COMPLETED_HISTORY_PROTECTED/);
      assert.equal(database.prepare("SELECT plan_version FROM project WHERE id=?").get(projectOne).plan_version, 1);
      assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='ux_task_project_root'").get());
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
      const projectRoot = database.prepare("SELECT id FROM task WHERE project_id=? AND is_root=1").get(projectOne).id;
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

      const categoryTwo = Number(database.prepare("INSERT INTO resource_category (company_id, name) VALUES (?, 'Employee')").run(companyTwo).lastInsertRowid);
      assert.throws(() => database.prepare(`
        INSERT INTO task (project_id, parent_id, name, start_date, manual_start_date, duration, resource_category_id) VALUES (?, ?, 'Scoped Task', '2026-09-17', '2026-09-17', 1, ?)
      `).run(projectOne, projectRoot, categoryTwo), /TASK_RESOURCE_CATEGORY_SCOPE_INVALID|GANTT_TASK_SCOPE_INVALID/);
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
