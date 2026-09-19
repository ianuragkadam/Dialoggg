import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { authenticatedHeaders, bootstrapAccount, login, prepareTestDatabase } from "./test-fixtures.mjs";

const results = [];
let appServer;
let appOutput = "";
let browser;
async function check(name, operation) {
  try { await operation(); results.push({ name, status: "PASS" }); process.stdout.write(`PASS  ${name}\n`); }
  catch (error) { const message = error instanceof Error ? error.message : String(error); results.push({ name, status: "FAIL", message }); process.stdout.write(`FAIL  ${name}\n      ${message}\n`); }
}
async function freePort() { const listener = createServer(); await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); }); const address = listener.address(); const port = typeof address === "object" && address ? address.port : 0; await new Promise(resolve => listener.close(resolve)); return port; }
async function loadPlaywright() { const supplied = process.env.DIALOGGG_PLAYWRIGHT_PATH; if (supplied) return import(pathToFileURL(path.join(supplied, "index.mjs")).href); try { return await import("playwright"); } catch { throw new Error("Playwright unavailable; set DIALOGGG_PLAYWRIGHT_PATH."); } }
function authCookies(response) { const combined = response.headers.get("set-cookie") || ""; const session = combined.match(/dialoggg_session=([^;]+)/)?.[1]; const csrf = combined.match(/dialoggg_csrf=([^;]+)/)?.[1]; assert.ok(session); assert.ok(csrf); return { session, csrf }; }
async function addAuth(context, values) { await context.addCookies([{ name: "dialoggg_session", value: values.session, domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }, { name: "dialoggg_csrf", value: values.csrf, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Strict" }]); }

const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-resources-ui-"));
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const suffix = Date.now().toString(36);
const password = "Resources-UI-Test-1!";
const emails = {
  admin: `resource-admin-${suffix}@example.test`,
  employee: `resource-employee-${suffix}@example.test`,
  candidate: `resource-candidate-${suffix}@example.test`,
  external: `resource-external-${suffix}@example.test`,
  otherAdmin: `resource-other-${suffix}@example.test`,
};
let jamieId;
let otherResourceId;
let permitId;
let seededTaskId;
let seededEventId;

try {
  const playwright = await loadPlaywright();
  prepareTestDatabase(dataDirectory);
  const admin = bootstrapAccount(dataDirectory, { companyName: "Resource QA", fullName: "Resource Admin", email: emails.admin, password, role: "admin" });
  const employee = bootstrapAccount(dataDirectory, { companyId: admin.companyId, fullName: "Jamie Morgan", email: emails.employee, password, role: "employee" });
  const candidate = bootstrapAccount(dataDirectory, { companyId: admin.companyId, fullName: "Priya Shah", email: emails.candidate, password, role: "employee" });
  bootstrapAccount(dataDirectory, { companyId: admin.companyId, fullName: "External Client", email: emails.external, password, role: "external" });
  const otherAdmin = bootstrapAccount(dataDirectory, { companyName: "Other Resource QA", fullName: "Other Admin", email: emails.otherAdmin, password, role: "admin" });

  const seed = new Database(path.join(dataDirectory, "dialoggg.db"));
  seed.pragma("foreign_keys = ON");
  try {
    const employeeCategory = seed.prepare("SELECT id FROM resource_category WHERE company_id = ? AND name = 'Employee'").get(admin.companyId).id;
    const equipmentCategory = seed.prepare("SELECT id FROM resource_category WHERE company_id = ? AND name = 'Equipment'").get(admin.companyId).id;
    const otherCategory = seed.prepare("SELECT id FROM resource_category WHERE company_id = ? AND name = 'Other'").get(admin.companyId).id;
    jamieId = Number(seed.prepare(`
      INSERT INTO resource (company_id, category_id, name, normalized_name, email, linked_membership_id, status)
      VALUES (?, ?, 'Jamie Morgan', 'jamie morgan', 'jamie.resource@example.test', ?, 'active')
    `).run(admin.companyId, employeeCategory, employee.membershipId).lastInsertRowid);
    seed.prepare(`INSERT INTO resource (company_id, category_id, name, normalized_name, status) VALUES (?, ?, 'Laser Screed A', 'laser screed a', 'active')`).run(admin.companyId, equipmentCategory);
    permitId = Number(seed.prepare(`INSERT INTO resource (company_id, category_id, name, normalized_name, status, deactivated_at) VALUES (?, ?, 'Permit Coordinator', 'permit coordinator', 'inactive', CURRENT_TIMESTAMP)`).run(admin.companyId, otherCategory).lastInsertRowid);
    const otherCategoryId = seed.prepare("SELECT id FROM resource_category WHERE company_id = ? AND name = 'Employee'").get(otherAdmin.companyId).id;
    otherResourceId = Number(seed.prepare(`INSERT INTO resource (company_id, category_id, name, normalized_name, status) VALUES (?, ?, 'Other Crew', 'other crew', 'active')`).run(otherAdmin.companyId, otherCategoryId).lastInsertRowid);
    const projectId = Number(seed.prepare(`INSERT INTO project (company_id, project_type_id, name, start_date, created_by) VALUES (?, ?, 'Resource Schedule QA', '2026-09-19', ?)`).run(admin.companyId, admin.defaultProjectTypeId, admin.legacyUserId).lastInsertRowid);
    seededTaskId = Number(seed.prepare(`INSERT INTO task (project_id, name, start_date, duration) VALUES (?, 'Install acrylic surface', '2026-09-20', 3)`).run(projectId).lastInsertRowid);
    seed.prepare("INSERT INTO task_resource (task_id, resource_id) VALUES (?, ?)").run(seededTaskId, jamieId);
    seededEventId = Number(seed.prepare(`
      INSERT INTO event_series (company_id, project_id, title, timing_mode, start_date, end_date, time_zone, created_by_membership_id)
      VALUES (?, ?, 'Site inspection', 'all_day', '2026-09-21', '2026-09-22', 'America/New_York', ?)
    `).run(admin.companyId, projectId, admin.membershipId).lastInsertRowid);
    seed.prepare("INSERT INTO event_resource (series_id, resource_id) VALUES (?, ?)").run(seededEventId, jamieId);
  } finally { seed.close(); }

  appServer = spawn(process.execPath, ["scripts/start-production.mjs"], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "production", PORT: String(port), RAILWAY_VOLUME_MOUNT_PATH: dataDirectory }, stdio: ["ignore", "pipe", "pipe"] });
  appServer.stdout.on("data", chunk => { appOutput += chunk.toString(); });
  appServer.stderr.on("data", chunk => { appOutput += chunk.toString(); });
  const started = Date.now();
  while (true) { if (appServer.exitCode !== null) throw new Error(`Server exited.\n${appOutput}`); try { if ((await fetch(`${baseUrl}/login`)).status === 200) break; } catch {} if (Date.now() - started > 25_000) throw new Error(`Server timeout.\n${appOutput}`); await new Promise(resolve => setTimeout(resolve, 200)); }

  const adminLogin = await login(baseUrl, emails.admin, password);
  const employeeLogin = await login(baseUrl, emails.employee, password);
  const externalLogin = await login(baseUrl, emails.external, password);
  const otherLogin = await login(baseUrl, emails.otherAdmin, password);
  const adminHeaders = authenticatedHeaders(adminLogin, baseUrl);
  const otherHeaders = authenticatedHeaders(otherLogin, baseUrl);

  await check("Resource API rejects missing CSRF and custom Categories", async () => {
    const cookies = authCookies(adminLogin);
    const noCsrf = await fetch(`${baseUrl}/api/v1/resources`, { method: "POST", headers: { cookie: `dialoggg_session=${cookies.session}`, origin: baseUrl, "content-type": "application/json" }, body: JSON.stringify({ name: "No CSRF", category: "Employee" }) });
    assert.equal(noCsrf.status, 403);
    const custom = await fetch(`${baseUrl}/api/v1/resources`, { method: "POST", headers: { ...adminHeaders, "content-type": "application/json" }, body: JSON.stringify({ name: "Custom Category", category: "Custom" }) });
    assert.equal(custom.status, 400);
  });
  await check("Resource API isolates tenants and rejects External access", async () => {
    const crossTenant = await fetch(`${baseUrl}/api/v1/resources/${otherResourceId}`, { headers: adminHeaders });
    assert.equal(crossTenant.status, 404);
    const ownTenant = await fetch(`${baseUrl}/api/v1/resources/${otherResourceId}`, { headers: otherHeaders });
    assert.equal(ownTenant.status, 200);
    const external = await fetch(`${baseUrl}/api/v1/resources`, { headers: authenticatedHeaders(externalLogin, baseUrl) });
    assert.equal(external.status, 403);
  });
  await check("Resource assignment API persists Tasks and Events and rejects inactive additions", async () => {
    const assigned = await fetch(`${baseUrl}/api/v1/resources/${jamieId}/assignments`, { method: "PUT", headers: { ...adminHeaders, "content-type": "application/json" }, body: JSON.stringify({ taskIds: [seededTaskId], eventSeriesIds: [seededEventId] }) });
    assert.equal(assigned.status, 200, await assigned.text());
    const read = await fetch(`${baseUrl}/api/v1/resources/${jamieId}/assignments`, { headers: adminHeaders });
    assert.equal(read.status, 200);
    const payload = await read.json();
    assert.deepEqual(new Set(payload.data.assignments.map(item => item.kind)), new Set(["Task", "Event"]));
    const schedule = await fetch(`${baseUrl}/api/resources/schedule`, { headers: adminHeaders });
    assert.equal(schedule.status, 200);
    const schedulePayload = await schedule.json();
    assert.ok(schedulePayload.events.some(item => item.id === `t${seededTaskId}-r${jamieId}` && item.extendedProps.kind === "Task"));
    assert.ok(schedulePayload.events.some(item => item.id === `e${seededEventId}-r${jamieId}` && item.extendedProps.kind === "Event"));
    const inactive = await fetch(`${baseUrl}/api/v1/resources/${permitId}/assignments`, { method: "PUT", headers: { ...adminHeaders, "content-type": "application/json" }, body: JSON.stringify({ taskIds: [seededTaskId], eventSeriesIds: [] }) });
    assert.equal(inactive.status, 409);
  });

  browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await addAuth(adminContext, authCookies(adminLogin));
  const page = await adminContext.newPage();

  await check("Admin opens persisted Resources with all five fixed Categories", async () => {
    await page.goto(`${baseUrl}/resources`);
    assert.equal(await page.title(), "Resources | Dialoggg");
    await page.getByRole("heading", { name: "Resources", exact: true }).waitFor();
    const body = await page.locator("body").innerText();
    for (const item of ["Employee", "Subcontractor", "Supplier", "Equipment", "Other"]) assert.match(body, new RegExp(item));
    assert.match(body, /Changes are saved to this company and audited/);
    assert.match(body, /Jamie Morgan/);
  });
  await check("Resource filters have a recoverable no-results state", async () => {
    await page.getByLabel("Search Resources").fill("nothing here");
    await page.getByRole("heading", { name: "No matching Resources" }).waitFor();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.getByLabel("Filter Resources by Category").selectOption({ label: "Equipment" });
    assert.equal(await page.getByText("Laser Screed A", { exact: true }).isVisible(), true);
    await page.getByLabel("Filter Resources by Category").selectOption("all");
  });
  await check("Directory lifecycle changes persist after reload", async () => {
    await page.getByRole("button", { name: "Deactivate Jamie Morgan" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Deactivate Resource?" });
    assert.match(await dialog.innerText(), /linked User is not deactivated/);
    await dialog.getByRole("button", { name: "Deactivate Resource" }).click();
    await page.getByRole("button", { name: "Restore Jamie Morgan" }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: "Restore Jamie Morgan" }).waitFor();
    await page.getByRole("button", { name: "Restore Jamie Morgan" }).click();
    await page.getByRole("alertdialog", { name: "Restore Resource?" }).getByRole("button", { name: "Restore Resource" }).click();
    await page.getByRole("button", { name: "Deactivate Jamie Morgan" }).waitFor();
  });
  await check("Add Resource validates required fields", async () => {
    await page.goto(`${baseUrl}/resources/new`);
    await page.getByRole("button", { name: "Review Resource" }).click();
    await page.getByText("Enter the Resource Name.", { exact: true }).waitFor();
    await page.getByText("Choose one Resource Category.", { exact: true }).waitFor();
  });
  await check("Admin creates and reloads a Resource with a one-to-one User link", async () => {
    await page.locator("#resource-name").fill("Northline Crew");
    await page.locator("#resource-category").selectOption({ label: "Subcontractor" });
    await page.locator("#resource-email").fill("crew@northline.example.test");
    await page.locator("#resource-phone").fill("717-555-0199");
    await page.locator("#linked-user").selectOption(String(candidate.membershipId));
    await page.getByRole("button", { name: "Review Resource" }).click();
    const review = page.getByRole("dialog", { name: "Confirm Resource" });
    assert.match(await review.innerText(), /Northline Crew/);
    assert.match(await review.innerText(), /Priya Shah/);
    await review.getByRole("button", { name: "Create Resource" }).click();
    await page.getByRole("heading", { name: "Resource created" }).waitFor();
    await page.getByRole("link", { name: "View Resource" }).click();
    await page.getByRole("heading", { name: "Northline Crew" }).waitFor();
    await page.reload();
    assert.match(await page.locator("body").innerText(), /Priya Shah/);
  });
  await check("Resource edits persist and duplicate names fail closed", async () => {
    await page.getByRole("button", { name: "Edit Resource" }).click();
    await page.locator("#edit-resource-name").fill("Jamie Morgan");
    await page.getByRole("dialog", { name: "Edit Resource" }).getByRole("button", { name: "Save Resource" }).click();
    await page.getByText(/already exists/i).waitFor();
    await page.locator("#edit-resource-name").fill("Northline Field Crew");
    await page.getByRole("dialog", { name: "Edit Resource" }).getByRole("button", { name: "Save Resource" }).click();
    await page.getByRole("heading", { name: "Northline Field Crew" }).waitFor();
    await page.reload();
    await page.getByRole("heading", { name: "Northline Field Crew" }).waitFor();
  });
  await check("Task and Event assignments display with an explicit conflict acknowledgement", async () => {
    await page.goto(`${baseUrl}/resources/${jamieId}`);
    const body = await page.locator("body").innerText();
    assert.match(body, /Install acrylic surface/);
    assert.match(body, /Site inspection/);
    assert.match(body, /Schedule conflict/);
    await page.getByRole("button", { name: "Review conflict" }).first().click();
    const dialog = page.getByRole("alertdialog", { name: "Schedule conflict warning" });
    assert.match(await dialog.innerText(), /warns without silently changing either assignment/);
    await dialog.getByRole("button", { name: "Acknowledge warning" }).click();
    assert.match(await page.getByRole("status").innerText(), /No assignment changed/);
  });
  await check("Detail lifecycle preserves assignments and the linked User", async () => {
    await page.getByRole("button", { name: "Deactivate Resource" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Deactivate Resource?" });
    assert.match(await dialog.innerText(), /Historical assignments and names remain visible/);
    await dialog.getByRole("button", { name: "Deactivate Resource" }).click();
    await page.reload();
    assert.match(await page.locator("body").innerText(), /Install acrylic surface/);
    assert.match(await page.locator("body").innerText(), /Jamie Morgan/);
    const verify = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try {
      assert.equal(verify.prepare("SELECT status FROM resource WHERE id = ?").get(jamieId).status, "inactive");
      assert.equal(verify.prepare("SELECT status FROM company_membership WHERE id = ?").get(employee.membershipId).status, "active");
      assert.equal(verify.prepare("SELECT COUNT(*) AS count FROM task_resource WHERE resource_id = ?").get(jamieId).count, 1);
      assert.equal(verify.prepare("SELECT COUNT(*) AS count FROM event_resource WHERE resource_id = ?").get(jamieId).count, 1);
    } finally { verify.close(); }
  });
  await check("Employee is read-only and External access is restricted", async () => {
    const employeeContext = await browser.newContext();
    await addAuth(employeeContext, authCookies(employeeLogin));
    const employeePage = await employeeContext.newPage();
    await employeePage.goto(`${baseUrl}/resources`);
    await employeePage.getByText("Employee read-only", { exact: false }).waitFor();
    assert.equal(await employeePage.getByRole("link", { name: "+ Add Resource" }).count(), 0);
    await employeePage.goto(`${baseUrl}/resources/${jamieId}`);
    assert.equal(await employeePage.getByRole("button", { name: "Edit Resource" }).count(), 0);
    await employeePage.goto(`${baseUrl}/resources/new`);
    await employeePage.getByRole("heading", { name: "Resource management is restricted" }).waitFor();
    await employeeContext.close();
    const externalContext = await browser.newContext();
    await addAuth(externalContext, authCookies(externalLogin));
    const externalPage = await externalContext.newPage();
    await externalPage.goto(`${baseUrl}/resources`);
    await externalPage.getByRole("heading", { name: "Resources are restricted" }).waitFor();
    await externalContext.close();
  });
  await check("Mobile Resources view has no horizontal overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/resources`);
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.ok(dimensions.scrollWidth <= dimensions.width, JSON.stringify(dimensions));
  });
  await check("Signed-out Resource routes return to Login", async () => {
    const context = await browser.newContext();
    const anonymous = await context.newPage();
    for (const route of ["/resources", "/resources/new", `/resources/${jamieId}`]) { await anonymous.goto(`${baseUrl}${route}`); await anonymous.waitForURL("**/login"); }
    await context.close();
  });
  await adminContext.close();
} finally {
  if (browser) await browser.close();
  if (appServer && appServer.exitCode === null) { appServer.kill(); await new Promise(resolve => setTimeout(resolve, 500)); }
  await rm(dataDirectory, { recursive: true, force: true });
}

const passed = results.filter(item => item.status === "PASS").length;
const failed = results.length - passed;
process.stdout.write(`\nRESULT  ${passed} passed, ${failed} failed, ${results.length} total\n`);
if (failed) process.exitCode = 1;
