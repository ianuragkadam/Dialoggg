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
  const users = await read("src/components/UsersAccessPrototype.tsx");
  const usersLanguage = await read("src/lib/users-access-ui.ts");
  const tabs = await read("src/app/(app)/projects/[id]/tabs-client.tsx");

  assert.match(language, /Employee \(Internal\)/);
  assert.match(language, /External\/Client/);
  assert.match(shell, /roleLabel\(user\.user_type\)/);
  assert.match(usersLanguage, /Employee \(Internal\)/);
  assert.match(usersLanguage, /External\/Client/);
  assert.match(users, /companyRoleLabel\(user\.role\)/);
  assert.match(tabs, /Project Calendar/);
  assert.match(tabs, /Project Resources/);
  assert.doesNotMatch(`${shell}\n${users}\n${usersLanguage}\n${tabs}`, />\s*Viewer\s*</);
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

test("Project Types UI covers the complete safe management workflow", async () => {
  const component = await read("src/components/ProjectTypesPrototype.tsx");
  const page = await read("src/app/(app)/settings/project-types/page.tsx");
  const shell = await read("src/components/AppShell.tsx");

  assert.match(shell, /Project Types/);
  assert.match(shell, /\/settings\/project-types/);
  assert.match(page, /ProjectTypesPrototype/);
  assert.match(page, /Project Types are restricted/);
  assert.match(component, /Add Project Type/);
  assert.match(component, /Rename Project Type/);
  assert.match(component, /Delete Project Type\?/);
  assert.match(component, /This Project Type can&apos;t be deleted/);
  assert.match(component, /Discard unsaved changes\?/);
  assert.match(component, /No matching Project Types/);
  assert.match(component, /role="alertdialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /Acrylic/);
  assert.match(component, /Hardwood/);
  assert.match(component, /Modular/);
  assert.match(component, /do not alter production Project records/);
});

test("registration performs a reliable full navigation into Projects", async () => {
  const registration = await read("src/app/register/page.tsx");
  assert.match(registration, /window\.location\.assign\("\/projects"\)/);
  assert.doesNotMatch(registration, /router\.push\("\/projects"\)/);
});

test("Login labels are programmatically associated with their fields", async () => {
  const login = await read("src/components/LoginForm.tsx");
  assert.match(login, /htmlFor="login-email"/);
  assert.match(login, /id="login-email"/);
  assert.match(login, /htmlFor="login-password"/);
  assert.match(login, /id="login-password"/);
  assert.match(login, /role="alert"/);
});

test("Project Templates UI covers library, source Plan, detail, and use workflows", async () => {
  const data = await read("src/lib/project-templates-ui.ts");
  const library = await read("src/components/ProjectTemplatesPrototype.tsx");
  const create = await read("src/components/TemplateCreatePrototype.tsx");
  const detail = await read("src/components/TemplateDetailPrototype.tsx");
  const use = await read("src/components/TemplateUsePrototype.tsx");
  const shell = await read("src/components/AppShell.tsx");

  assert.match(shell, /Project Templates/);
  assert.match(shell, /\/templates/);
  assert.match(data, /Backyard Court/);
  assert.match(data, /Commercial Athletic Surface/);
  assert.match(data, /Court Resurfacing/);
  assert.match(library, /Template Library/);
  assert.match(library, /Rename Template/);
  assert.match(library, /Delete Template\?/);
  assert.match(library, /Discard unsaved changes\?/);
  assert.match(create, /Save Project as Template/);
  assert.match(create, /Also save current Resource assignments/);
  assert.match(detail, /Project Plan preview/);
  assert.match(detail, /no separate Template schedule editor/);
  assert.match(use, /Start Project from Template/);
  assert.match(use, /Confirm Project setup/);
  assert.match(use, /existing original Project Plan\/Gantt chart/);
  assert.match(`${library}\n${create}\n${detail}\n${use}`, /UI preview/);
  assert.doesNotMatch(`${library}\n${create}\n${detail}\n${use}`, /import\(.+GanttChart|from ["']@\/components\/GanttChart/);
});

test("Company Administration UI is isolated from tenant navigation and content", async () => {
  const data = await read("src/lib/company-admin-ui.ts");
  const list = await read("src/components/CompaniesPrototype.tsx");
  const create = await read("src/components/CompanyCreatePrototype.tsx");
  const detail = await read("src/components/CompanyDetailPrototype.tsx");
  const shell = await read("src/components/AppShell.tsx");
  const auth = await read("src/lib/auth.ts");
  const login = await read("src/components/LoginForm.tsx");

  assert.match(auth, /isPlatformAdmin/);
  assert.match(shell, /platformOnly/);
  assert.match(shell, /tenantOnly/);
  assert.match(shell, /Companies/);
  assert.match(data, /America\/New_York/);
  assert.match(list, /Platform access boundary/);
  assert.match(list, /Suspend company\?/);
  assert.match(list, /Restore company\?/);
  assert.match(create, /Confirm company setup/);
  assert.match(create, /single-use Owner invitation/);
  assert.match(detail, /Tenant privacy boundary/);
  assert.match(detail, /Microsoft folders stay exactly where they are/);
  assert.match(login, /super_admin.+platform\/companies/);
  assert.match(`${list}\n${create}\n${detail}`, /UI preview/);
});

test("Users, Roles, Invitations, and Project Access UI covers the approved fixed-role workflow", async () => {
  const data = await read("src/lib/users-access-ui.ts");
  const list = await read("src/components/UsersAccessPrototype.tsx");
  const invite = await read("src/components/UserInvitePrototype.tsx");
  const detail = await read("src/components/UserDetailPrototype.tsx");
  const access = await read("src/components/UserProjectAccessPrototype.tsx");

  for (const role of ["Owner", "Admin", "Employee (Internal)", "External/Client"]) {
    assert.match(`${data}\n${list}`, new RegExp(role.replace(/[()]/g, "\\$&")));
  }
  assert.match(list, /Owner required/);
  assert.match(list, /Existing sessions are revoked/);
  assert.match(invite, /72-hour/);
  assert.match(invite, /Also add as a Resource/);
  assert.match(invite, /Assign an External\/Client to at least one Project/);
  assert.match(invite, /Confirm User invitation/);
  assert.match(detail, /Change company Role\?/);
  assert.match(detail, /Cancel invitation\?/);
  assert.match(access, /External\/Client boundary/);
  assert.match(access, /Employee \(Internal\) behavior/);
  assert.match(access, /Confirm Project access changes/);
  assert.match(`${list}\n${invite}\n${detail}\n${access}`, /UI preview/);
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
