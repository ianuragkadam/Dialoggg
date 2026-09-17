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
  const collectionApi = await read("src/app/api/v1/project-types/route.ts");
  const itemApi = await read("src/app/api/v1/project-types/[id]/route.ts");

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
  assert.match(component, /authenticatedFetch/);
  assert.match(component, /Live company setting/);
  assert.match(component, /affectedProjects/);
  assert.match(page, /listProjectTypes/);
  assert.match(collectionApi, /createProjectType/);
  assert.match(itemApi, /renameProjectType/);
  assert.match(itemApi, /PROJECT_TYPE_IN_USE/);
});

test("public registration is removed and disabled server-side", async () => {
  await assert.rejects(access(path.join(root, "src/app/register/page.tsx")));
  const login = await read("src/components/LoginForm.tsx");
  const route = await read("src/app/api/auth/register/route.ts");
  assert.doesNotMatch(login, /Create your company|\/register/);
  assert.match(route, /status:\s*404/);
  assert.doesNotMatch(route, /INSERT INTO company|createSession/);
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
  assert.match(create, /single-use invitation/);
  assert.match(detail, /Tenant privacy boundary/);
  assert.match(detail, /Microsoft folders stay exactly where they are/);
  assert.match(login, /super_admin.+platform\/companies/);
  assert.match(`${list}\n${create}\n${detail}`, /api\/v1\/platform\/companies/);
  assert.doesNotMatch(`${list}\n${create}\n${detail}`, /UI preview only|reset on refresh|Confirm UI preview/);
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

test("Resources UI covers fixed Categories, one-to-one links, lifecycle, and conflict warning", async () => {
  const data = await read("src/lib/resources-ui.ts");
  const list = await read("src/components/ResourcesPrototype.tsx");
  const create = await read("src/components/ResourceFormPrototype.tsx");
  const detail = await read("src/components/ResourceDetailPrototype.tsx");
  for (const category of ["Employee", "Subcontractor", "Supplier", "Equipment", "Other"]) assert.match(data, new RegExp(`"${category}"`));
  assert.match(list, /no category builder/);
  assert.match(list, /Deactivate Resource\?/);
  assert.match(create, /Optional User link/);
  assert.match(create, /already linked one-to-one/);
  assert.match(create, /Confirm Resource/);
  assert.match(detail, /Change linked User/);
  assert.match(detail, /Schedule conflict warning/);
  assert.match(detail, /Historical assignments and names remain visible/);
  assert.match(`${list}\n${create}\n${detail}`, /UI preview/);
});

test("Projects UI covers complete fields, lifecycle, rebase, and External boundaries", async () => {
  const data = await read("src/lib/projects-ui.ts");
  const list = await read("src/components/ProjectsPrototype.tsx");
  const form = await read("src/components/ProjectFormPrototype.tsx");
  const detail = await read("src/components/ProjectWorkspacePrototype.tsx");
  assert.match(data, /project_type_id/);
  assert.doesNotMatch(data, /PROJECT_TYPES\s*=/);
  assert.match(list, /External\/Client assigned Projects only/);
  for (const field of ["Project Name", "Client Name", "Client Email", "Address", "City", "State", "Zip", "Phone Number", "Project Type", "Project Start Date"]) assert.match(form, new RegExp(field));
  assert.match(form, /Completed Tasks never move/);
  assert.match(form, /Shift unfinished Tasks/);
  assert.match(detail, /Complete Project\?/);
  assert.match(detail, /Archive Project\?/);
  assert.match(detail, /Permanently delete Project\?/);
  assert.match(detail, /Simple read-only Gantt/);
  assert.match(`${list}\n${form}\n${detail}`, /UI preview/);
});

test("Project Plan workflow UI covers approved scheduling rules without replacing the original Gantt", async () => {
  const review = await read("src/components/ProjectPlanWorkflowReview.tsx");
  const tabs = await read("src/app/(app)/projects/[id]/tabs-client.tsx");
  const gantt = await read("src/components/GanttChart.tsx");
  for (const value of ["Leaf Task", "Header Task", "Time Period", "Finish-to-Start", "Start-to-Start", "Finish-to-Finish", "Start-to-Finish", "Allow work on Saturday", "Allow work on Sunday", "Multiple predecessors", "Bidirectional cascade", "Root Header Task is protected", "Header Task cannot be deleted", "Delete Task?"]) assert.match(review, new RegExp(value.replace(/[+?()]/g, "\\$&")));
  assert.match(review, /latest valid result wins/i);
  assert.match(review, /zero or a positive whole number/i);
  assert.match(review, /Original Gantt retained/);
  assert.match(tabs, /ProjectPlanWorkflowReview/);
  assert.match(tabs, /<GanttChart projectId=/);
  assert.match(gantt, /dhtmlx-gantt/);
  assert.doesNotMatch(review, /import\(.+GanttChart|from ["']@\/components\/GanttChart/);
});

test("Events and Calendar UI covers all three views and approved recurrence decisions", async () => {
  const review = await read("src/components/CalendarWorkflowReview.tsx");
  const master = await read("src/app/(app)/calendar/page.tsx");
  const project = await read("src/components/ProjectCalendar.tsx");
  const resource = await read("src/app/(app)/resources/schedule/page.tsx");
  for (const value of ["Project Calendar", "Master Calendar", "Resource Calendar", "Day", "Week", "Month", "Task · all-day schedule", "Event · calendar-only", "Push to Project Calendar", "Include Completed Projects", "Daily", "Weekly", "Monthly", "No User-selected end date", "This occurrence", "Entire series", "Resource scheduling conflict", "Edit in Project Plan"]) assert.match(review, new RegExp(value.replace(/[+?()]/g, "\\$&")));
  assert.match(review, /This and following.+not part of v1/s);
  assert.match(review, /Task dragging is disabled/);
  assert.match(review, /Company Time Zone/);
  assert.match(`${master}\n${project}\n${resource}`, /CalendarWorkflowReview/);
  assert.match(master, /dayGridDay/);
  assert.match(project, /dayGridDay/);
  assert.match(resource, /resourceTimelineDay/);
});

test("Google Calendar UI covers one-way personal connection and synchronization health", async () => {
  const component = await read("src/components/GoogleCalendarPrototype.tsx");
  const account = await read("src/app/(app)/account/page.tsx");
  const page = await read("src/app/(app)/account/google-calendar/page.tsx");
  for (const value of ["Dialoggg stays the source of truth", "Synchronization is one-way", "dedicated calendar named", "Nothing is written to your primary Google calendar", "Google default reminders", "External/Client", "Remove managed items", "Retain existing items", "Safe Google item preview", "24 hours", "within two minutes", "Resume Google synchronization?"]) assert.match(component, new RegExp(value.replace(/[+?()]/g, "\\$&"), "i"));
  assert.match(component, /one-to-one/);
  assert.match(component, /tokens are encrypted\/protected at rest/);
  assert.match(account, /Manage Google Calendar/);
  assert.match(account, /\/account\/google-calendar/);
  assert.match(page, /getCurrentUser/);
  assert.match(page, /GoogleCalendarPrototype/);
});

test("Microsoft Storage UI covers company setup and Project Common/Private boundaries", async () => {
  const company = await read("src/components/MicrosoftStoragePrototype.tsx");
  const folders = await read("src/components/ProjectFoldersPrototype.tsx");
  const page = await read("src/app/(app)/settings/microsoft-storage/page.tsx");
  const tabs = await read("src/app/(app)/projects/[id]/tabs-client.tsx");
  for (const value of ["OneDrive for Business", "SharePoint document library", "Dialoggg does not store Project files", "Microsoft 365 administrators", "No anonymous links", "Change company folder root?", "Existing Project folders do not move", "Disconnect Microsoft Storage?"]) assert.match(company, new RegExp(value.replace(/[+?()]/g, "\\$&"), "i"));
  for (const value of ["Common", "Private", "Create automatically", "Link existing folder", "Stable Microsoft IDs", "Missing or moved", "Permission denied", "Company disconnected"]) assert.match(folders, new RegExp(value, "i"));
  assert.match(folders, /never renames, moves, or deletes Microsoft folders/);
  assert.match(page, /Owner or Admin/);
  assert.match(tabs, /ProjectFoldersPrototype/);
  assert.match(tabs, /Common and Private/);
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

test("database connection uses a bounded lock wait and module initialization never migrates", async () => {
  const source = await read("src/db/connection.ts");
  const index = await read("src/db/index.ts");
  const busyTimeout = source.indexOf('database.pragma("busy_timeout = 30000")');
  const journalMode = source.indexOf('database.pragma("journal_mode = WAL")');
  assert.ok(busyTimeout >= 0, "SQLite must have a bounded busy timeout");
  assert.ok(journalMode > busyTimeout, "busy timeout must be active before WAL mode");
  assert.match(index, /assertSchemaCompatible/);
  assert.doesNotMatch(index, /CREATE TABLE|ALTER TABLE|runMigrations/);
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
