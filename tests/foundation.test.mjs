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

  const questionIds = [...definition.matchAll(/\r?\n\s*"(fu\d{2})",\r?\n\s*\d+,/g)].map(match => match[1]);
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
  assert.match(component, /reusable label for this company/);
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
  const password = await read("src/components/PasswordField.tsx");
  assert.match(login, /htmlFor="login-email"/);
  assert.match(login, /id="login-email"/);
  assert.match(login, /id="login-password"/);
  assert.match(password, /htmlFor=\{id\}/);
  assert.match(password, /Show \$\{label\.toLowerCase\(\)\}/);
  assert.match(password, /Hide \$\{label\.toLowerCase\(\)\}/);
  assert.match(login, /role="alert"/);
});

test("bug-sheet accessibility, mobile, pagination, favicon, and phone safeguards are wired", async () => {
  const shell = await read("src/components/AppShell.tsx");
  const layoutIcon = await read("src/app/icon.svg");
  const account = await read("src/app/(app)/account/page.tsx");
  const googlePage = await read("src/app/(app)/account/google-calendar/page.tsx");
  const changePassword = await read("src/components/ChangePasswordForm.tsx");
  const projectForm = await read("src/components/ProjectFormPrototype.tsx");
  const userDetail = await read("src/components/UserDetailPrototype.tsx");
  const projectDetail = await read("src/app/(app)/projects/[id]/tabs-client.tsx");
  const phoneFormat = await read("src/lib/phone-format.ts");
  const projects = await read("src/lib/projects.ts");
  const pagination = await read("src/components/PaginationControls.tsx");
  const directories = await Promise.all([
    "CompaniesPrototype.tsx", "ProjectsPrototype.tsx", "ResourcesPrototype.tsx",
    "UsersAccessPrototype.tsx", "ProjectTemplatesPrototype.tsx", "ProjectTypesPrototype.tsx",
  ].map(name => read(`src/components/${name}`)));

  assert.match(shell, /useState\(false\)/);
  assert.match(shell, /aria-controls="primary-navigation"/);
  assert.match(shell, /fixed inset-0 z-30/);
  assert.match(layoutIcon, /<svg/);
  assert.match(account, /Google Calendar requires a company context/);
  assert.match(googlePage, /!user\.company_id/);
  assert.match(changePassword, /PasswordField/);
  assert.match(projectForm, /replace\(\/\\D\/g/);
  assert.match(projectForm, /maxLength=\{10\}/);
  assert.match(projectForm, /formatUsPhoneNumber\(event\.target\.value\)/);
  assert.match(userDetail, /formatUsPhoneNumber\(event\.target\.value\)/);
  assert.match(userDetail, /formatUsPhoneNumber\(value\)/);
  assert.match(projectDetail, /formatUsPhoneNumber\(project\.phone\)/);
  assert.match(phoneFormat, /xxx-xxx-xxxx/);
  assert.match(projects, /Use digits only, up to 10 digits/);
  assert.match(pagination, /Previous/);
  assert.match(pagination, /Next/);
  for (const directory of directories) assert.match(directory, /PaginationControls/);
});

test("Project Templates persist tenant-scoped source Plans and instantiate atomically", async () => {
  const service = await read("src/lib/project-templates.ts");
  const library = await read("src/components/ProjectTemplatesPrototype.tsx");
  const create = await read("src/components/TemplateCreatePrototype.tsx");
  const detail = await read("src/components/TemplateDetailPrototype.tsx");
  const use = await read("src/components/TemplateUsePrototype.tsx");
  const collectionApi = await read("src/app/api/v1/project-templates/route.ts");
  const itemApi = await read("src/app/api/v1/project-templates/[id]/route.ts");
  const instantiateApi = await read("src/app/api/v1/project-templates/[id]/instantiate/route.ts");
  const shell = await read("src/components/AppShell.tsx");

  assert.match(shell, /Project Templates/);
  assert.match(shell, /\/templates/);
  assert.match(library, /Template Library/);
  assert.match(library, /Rename Template/);
  assert.match(library, /Delete Template\?/);
  assert.match(library, /Discard unsaved changes\?/);
  assert.match(library, /authenticatedFetch/);
  assert.match(create, /Save Project as Template/);
  assert.match(create, /Also save current Resource assignments/);
  assert.match(create, /authenticatedFetch/);
  assert.match(detail, /Saved Project Plan/);
  assert.match(detail, /no separate Template schedule editor/);
  assert.match(use, /Start Project from Template/);
  assert.match(use, /Confirm Project setup/);
  assert.match(use, /Open Project Plan/);
  assert.match(use, /authenticatedFetch/);
  assert.match(service, /saveProjectAsTemplate/);
  assert.match(service, /instantiateProjectTemplate/);
  assert.match(service, /calculateTemplateSchedule/);
  assert.match(service, /progress, color, is_header/);
  assert.match(service, /project_template_instantiation/);
  assert.match(collectionApi, /validateMutationRequest/);
  assert.match(itemApi, /deleteProjectTemplate/);
  assert.match(instantiateApi, /project_template\.instantiate/);
  assert.doesNotMatch(`${library}\n${create}\n${detail}\n${use}`, /UI preview/);
  assert.doesNotMatch(`${library}\n${create}\n${detail}\n${use}`, /import\(.+GanttChart|from ["']@\/components\/GanttChart/);
});

test("Company Administration UI is isolated from tenant navigation and content", async () => {
  const data = await read("src/lib/company-admin-ui.ts");
  const list = await read("src/components/CompaniesPrototype.tsx");
  const create = await read("src/components/CompanyCreatePrototype.tsx");
  const edit = await read("src/components/CompanyEditPrototype.tsx");
  const detail = await read("src/components/CompanyDetailPrototype.tsx");
  const administration = await read("src/lib/company-administration.ts");
  const itemApi = await read("src/app/api/v1/platform/companies/[id]/route.ts");
  const migrations = await read("src/db/migrations.ts");
  const shell = await read("src/components/AppShell.tsx");
  const auth = await read("src/lib/auth.ts");
  const login = await read("src/components/LoginForm.tsx");

  assert.match(auth, /isPlatformAdmin/);
  assert.match(shell, /platformOnly/);
  assert.match(shell, /tenantOnly/);
  assert.match(shell, /Companies/);
  assert.match(data, /America\/New_York/);
  assert.match(list, /About Platform Access/);
  assert.match(list, /Delete company access\?/);
  assert.match(list, /deleteTarget\.name/);
  assert.match(list, /\/edit`/);
  assert.match(edit, /Company Name/);
  assert.match(edit, /company's required time zone/);
  assert.match(edit, /COMPANY_NAME_EXISTS|Company details could not be saved/);
  assert.match(itemApi, /validateMutationRequest/);
  assert.match(itemApi, /export async function DELETE/);
  assert.match(administration, /historicalDataRetained: true/);
  assert.match(migrations, /recoverable_platform_company_retirement_and_editing/);
  assert.match(list, /Suspend company\?/);
  assert.match(list, /Restore company\?/);
  assert.match(create, /Confirm company setup/);
  assert.match(create, /single-use invitation/);
  assert.match(detail, /Integration health/);
  assert.match(detail, /Connection summary only/);
  assert.match(detail, /Only the Platform Owner can change the subscription end date/);
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
  assert.match(detail, /Owner approval required/);
  assert.match(list, /revoke stale sessions/i);
  assert.match(invite, /72-hour/);
  assert.match(invite, /Also add as a Resource/);
  assert.match(invite, /Assign an External\/Client to at least one Project/);
  assert.match(invite, /Confirm User invitation/);
  assert.match(detail, /Change company Role\?/);
  assert.match(detail, /Cancel invitation\?/);
  assert.match(access, /External\/Client isolation/);
  assert.match(access, /Employee assignment semantics/);
  assert.match(access, /Confirm Project access changes/);
  assert.match(`${list}\n${invite}\n${detail}\n${access}`, /authenticatedFetch/);
  assert.doesNotMatch(`${list}\n${invite}\n${detail}\n${access}`, /UI preview/);
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
  assert.match(create, /already linked to another Resource/);
  assert.match(create, /Confirm Resource/);
  assert.match(detail, /Change linked User/);
  assert.match(detail, /Schedule conflict warning/);
  assert.match(detail, /Historical assignments and names remain visible/);
  assert.match(`${list}\n${create}\n${detail}`, /authenticatedFetch/);
  assert.doesNotMatch(`${list}\n${create}\n${detail}`, /UI preview|reset on refresh|non-persistent/);
});

test("Projects UI covers complete fields, lifecycle, rebase, and External boundaries", async () => {
  const data = await read("src/lib/projects-ui.ts");
  const list = await read("src/components/ProjectsPrototype.tsx");
  const lifecycle = await read("src/components/ProjectStatusControl.tsx");
  const form = await read("src/components/ProjectFormPrototype.tsx");
  const detail = await read("src/components/ProjectWorkspacePrototype.tsx");
  assert.match(data, /project_type_id/);
  assert.doesNotMatch(data, /PROJECT_TYPES\s*=/);
  assert.match(list, /All jobs/);
  assert.match(list, /Archived/);
  for (const field of ["Project Name", "Client Name", "Client Email", "Address", "City", "State", "Zip", "Phone Number", "Project Type", "Project Start Date"]) assert.match(form, new RegExp(field));
  assert.match(form, /Completed Tasks never move/);
  assert.match(form, /Shift unfinished Tasks/);
  assert.match(lifecycle, /Complete Job/);
  assert.match(lifecycle, /Are you sure you want to mark this job complete\? It will be moved to Archived\./);
  assert.match(lifecycle, /Restore to Active/);
  assert.doesNotMatch(`${list}\n${lifecycle}\n${detail}`, /Deactivated|Inactive|Completed/);
  assert.match(detail, /Permanently delete Project\?/);
  assert.match(detail, /Simple read-only Gantt/);
  assert.match(`${form}\n${detail}`, /authenticatedFetch/);
  assert.doesNotMatch(`${list}\n${form}\n${detail}`, /UI preview|no production data changed|non-persistent/);
});

test("Project job-site and phone fields remain available but optional in add and edit", async () => {
  const form = await read("src/components/ProjectFormPrototype.tsx");
  const projects = await read("src/lib/projects.ts");
  for (const key of ["address", "city", "state", "zip", "phone"]) {
    assert.doesNotMatch(form, new RegExp(`\\["${key}", "Enter the`));
    assert.doesNotMatch(projects, new RegExp(`\\["${key}","`));
  }
  assert.match(form, /const optional = \["project-address", "project-city", "project-state", "project-zip", "client-phone"\]/);
  assert.match(projects, /input\[key\] \?\?= ""/);
  assert.match(form, /mode === "create" \? "POST" : "PUT"/);
});

test("Project Plan hierarchy review reads live saved tasks and hands edits to the original Gantt", async () => {
  const review = await read("src/components/ProjectPlanWorkflowReview.tsx");
  const tabs = await read("src/app/(app)/projects/[id]/tabs-client.tsx");
  const gantt = await read("src/components/GanttChart.tsx");
  for (const value of ["Project hierarchy · live data", "Project root task rules", "saved tasks", "Edit in Gantt", "No tasks have been added", "dialoggg:open-plan-task", "dialoggg:project-plan-updated"]) assert.match(review, new RegExp(value.replace(/[+?()·]/g, "\\$&")));
  assert.match(tabs, /ProjectPlanWorkflowReview/);
  assert.match(tabs, /ProjectPlanWorkflowReview projectId=\{project\.id\}/);
  assert.match(gantt, /function focusTaskStart\(taskId: number\)/);
  assert.match(gantt, /gantt\.posFromDate\(task\.start_date\) - timelineWidth \/ 2/);
  assert.match(gantt, /if \(taskId != null\) pendingSavedTaskFocusRef\.current = Number\(taskId\);\s*await reload\(\)/);
  assert.match(gantt, /gantt\.render\(\);\s*if \(pendingSavedTaskFocusRef\.current !== null\)/);
  assert.match(tabs, /<GanttChart projectId=/);
  assert.match(tabs, /projectStartDate=\{project\.start_date\}/);
  assert.match(gantt, /const startIso = defaultNewTaskStartDate\(projectStartDate, clickedTask\)/);
  assert.match(gantt, /start_date: projectStartDate, duration: 1/);
  assert.match(gantt, /plan-add-child-task/);
  assert.match(gantt, /openNewTaskFromRow\(header, taskId\)/);
  assert.match(gantt, /createPortal\(/);
  assert.match(gantt, /document\.querySelector\("\.tenant-theme"\) \|\| document\.body/);
  assert.match(gantt, /dhtmlx-gantt/);
  assert.match(gantt, /dialoggg:open-plan-task/);
  assert.match(gantt, /dialoggg:project-plan-updated/);
  assert.doesNotMatch(review, /import\(.+GanttChart|from ["']@\/components\/GanttChart/);
});

test("Events and Calendar UI covers all three views and approved recurrence decisions", async () => {
  const review = await read("src/components/CalendarWorkflowReview.tsx");
  const master = await read("src/app/(app)/calendar/page.tsx");
  const project = await read("src/components/ProjectCalendar.tsx");
  const resource = await read("src/app/(app)/resources/schedule/page.tsx");
  for (const value of ["Project Calendar", "Master Calendar", "Resource Calendar", "Day", "Week", "Month", "Push to Project Calendar", "Active Jobs", "All Jobs", "Daily", "Weekly", "Monthly", "Company Time Zone", "This occurrence", "Entire series", "Resource scheduling conflict", "Edit in Project Plan"]) assert.match(review, new RegExp(value.replace(/[+?()]/g, "\\$&")));
  assert.match(review, /This and following.+not part of v1/s);
  assert.match(review, /Tasks can't be dragged here/);
  assert.match(review, /Company Time Zone/);
  assert.match(`${master}\n${project}\n${resource}`, /CalendarWorkflowReview/);
  assert.match(master, /dayGridDay/);
  assert.match(project, /dayGridDay/);
  assert.match(resource, /resourceTimelineDay/);
});

test("Google Calendar UI covers one-way personal connection and synchronization health", async () => {
  const component = await read("src/components/GoogleCalendarManager.tsx");
  const account = await read("src/app/(app)/account/page.tsx");
  const page = await read("src/app/(app)/account/google-calendar/page.tsx");
  for (const value of ["Dialoggg remains the source of truth", "It’s one-way", "calendar named", "Your own calendars and events are never read or changed", "Google default reminders", "Clients see only what’s shared with them", "Remove managed items", "Retain existing items", "Safe Google item preview", "24-hour retry window", "within a few minutes", "Resume Google synchronization?"]) assert.match(component, new RegExp(value.replace(/[+?()]/g, "\\$&"), "i"));
  assert.match(component, /calendar\.app\.created/);
  assert.match(component, /Each person connects their own/);
  assert.match(account, /Manage Google Calendar/);
  assert.match(account, /\/account\/google-calendar/);
  assert.match(page, /getCurrentUser/);
  assert.match(page, /GoogleCalendarManager/);
});

test("Microsoft Storage UI covers company setup and Project Common/Private boundaries", async () => {
  const company = await read("src/components/MicrosoftStoragePrototype.tsx");
  const folders = await read("src/components/ProjectFoldersPrototype.tsx");
  const projectApi = await read("src/app/api/v1/projects/route.ts");
  const page = await read("src/app/(app)/settings/microsoft-storage/page.tsx");
  const tabs = await read("src/app/(app)/projects/[id]/tabs-client.tsx");
  for (const value of ["OneDrive for Business", "SharePoint document library", "Dialoggg never stores your files", "Microsoft 365 account", "No one at Dialoggg can see your files", "Change company folder root?", "Existing Project folders do not move", "Disconnect Microsoft Storage?"]) assert.match(company, new RegExp(value.replace(/[+?()]/g, "\\$&"), "i"));
  for (const value of ["Common", "Private", "Create a new folder", "Use a folder I already have", "Stable Microsoft IDs", "Missing or moved", "Permission denied", "Company disconnected"]) assert.match(folders, new RegExp(value, "i"));
  assert.match(company, /New projects will automatically get Common and Private folders/);
  assert.match(projectApi, /autoCreateProjectFolders/);
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
  const startup = await read("scripts/start-with-migration.mjs");
  assert.match(config, /reactStrictMode:\s*true/);
  assert.match(config, /poweredByHeader:\s*false/);
  assert.match(config, /X-Content-Type-Options/);
  assert.match(config, /X-Frame-Options/);
  assert.match(config, /Referrer-Policy/);
  assert.match(config, /Strict-Transport-Security/);
  assert.match(config, /max-age=63072000/);
  assert.match(startup, /assertProductionConfig\(\{ \.\.\.process\.env, NODE_ENV: "production" \}\)/);
});

test("cross-module security uses a canonical origin, bounded passwords, and private calendar feeds", async () => {
  const requestSecurity = await read("src/lib/request-security.ts");
  const login = await read("src/app/api/auth/login/route.ts");
  const passwordPolicy = await read("src/lib/password-policy.ts");
  const calendar = await read("src/lib/ical.ts");
  const feed = await read("src/app/api/ical/[token]/route.ts");
  for (const route of [
    "src/app/api/calendar/feed-url/route.ts",
    "src/app/api/projects/[id]/feed-url/route.ts",
    "src/app/api/resources/[id]/feed-url/route.ts",
  ]) {
    const source = await read(route);
    assert.match(source, /canonicalAppOrigin/);
    assert.match(source, /no-store/);
  }
  assert.match(requestSecurity, /APP_BASE_URL/);
  assert.match(requestSecurity, /APP_BASE_URL_REQUIRED/);
  assert.doesNotMatch(requestSecurity, /x-forwarded-host|x-forwarded-proto/);
  assert.match(login, /validateRequestOrigin/);
  assert.match(passwordPolicy, /MAX_PASSWORD_BYTES\s*=\s*72/);
  assert.match(passwordPolicy, /TextEncoder/);
  assert.match(calendar, /\\r\\n\?\|\\n/);
  assert.match(feed, /private, no-store/);
  assert.match(feed, /\[a-f0-9\]\{36\}/);
});

test("secure integration workshop separates scopes, hashes invitations, encrypts versions, and redacts review output", async () => {
  const migration = await read("src/db/migrations.ts");
  const service = await read("src/lib/integration-setup.ts");
  const crypto = await read("src/lib/integration-crypto.ts");
  const providers = await read("src/lib/integration-providers.ts");
  const workshop = await read("src/components/IntegrationSetupWorkshop.tsx");
  const api = await read("src/app/api/integration-setup/route.ts");
  const session = await read("src/app/api/integration-setup/session/route.ts");
  for (const table of ["integration_setup_invitation", "integration_setup_session", "integration_config", "integration_credential_version", "integration_validation_attempt", "integration_oauth_state"]) assert.match(migration, new RegExp(`CREATE TABLE ${table}`));
  assert.match(migration, /platform_and_company/);
  assert.match(service, /sha256\(rawToken\)/);
  assert.match(service, /validateRequestOrigin/);
  assert.doesNotMatch(service, /x-forwarded-host|x-forwarded-proto/);
  assert.match(crypto, /aes-256-gcm/i);
  assert.match(crypto, /setAAD/);
  assert.match(providers, /code_challenge_method/);
  assert.match(providers, /calendar\.app\.created/);
  assert.match(providers, /Files\.ReadWrite/);
  assert.match(api, /validateIntegrationMutation/);
  assert.match(api, /RATE_LIMITED/);
  assert.match(session, /httpOnly:\s*true/);
  assert.match(workshop, /Never enter a personal Google or Microsoft password/);
  assert.match(workshop, /Internal read-only view/);
  assert.match(workshop, /Secret fields are never autosaved/i);
  assert.doesNotMatch(workshop, /localStorage|sessionStorage/);
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
