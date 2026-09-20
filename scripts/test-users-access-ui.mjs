import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { bootstrapAccount, login, prepareTestDatabase } from "./test-fixtures.mjs";

const results = [];
let appServer;
let appOutput = "";
let browser;

async function check(name, operation) {
  try { await operation(); results.push({ name, status: "PASS" }); process.stdout.write(`PASS  ${name}\n`); }
  catch (error) { const message = error instanceof Error ? error.message : String(error); results.push({ name, status: "FAIL", message }); process.stdout.write(`FAIL  ${name}\n      ${message}\n`); }
}

async function freePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const address = listener.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

async function loadPlaywright() {
  if (process.env.DIALOGGG_PLAYWRIGHT_PATH) return import(pathToFileURL(path.join(process.env.DIALOGGG_PLAYWRIGHT_PATH, "index.mjs")).href);
  return import("playwright").catch(() => { throw new Error("Playwright is unavailable. Set DIALOGGG_PLAYWRIGHT_PATH."); });
}

function cookiesFrom(response) {
  const combined = response.headers.get("set-cookie") || "";
  const session = combined.match(/dialoggg_session=([^;]+)/)?.[1];
  const csrf = combined.match(/dialoggg_csrf=([^;]+)/)?.[1];
  assert.ok(session && csrf, "login did not return both session and CSRF cookies");
  return { session, csrf };
}

async function addCookies(context, values) {
  await context.addCookies([
    { name: "dialoggg_session", value: values.session, domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
    { name: "dialoggg_csrf", value: values.csrf, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Strict" },
  ]);
}

const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-users-access-ui-"));
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const suffix = Date.now().toString(36);
const password = "Users-Access-UI-Test-1!";
const encryptionKey = Buffer.alloc(32, 9).toString("base64");

try {
  const playwright = await loadPlaywright();
  prepareTestDatabase(dataDirectory);
  const owner = bootstrapAccount(dataDirectory, { companyName: "Users Access QA", fullName: "Olivia Owner", email: `owner-${suffix}@example.test`, password, role: "owner" });
  const admin = bootstrapAccount(dataDirectory, { companyId: owner.companyId, fullName: "Avery Admin", email: `admin-${suffix}@example.test`, password, role: "admin" });
  const employee = bootstrapAccount(dataDirectory, { companyId: owner.companyId, fullName: "Jamie Employee", email: `employee-${suffix}@example.test`, password, role: "employee" });
  const external = bootstrapAccount(dataDirectory, { companyId: owner.companyId, fullName: "Alex Client", email: `external-${suffix}@example.test`, password, role: "external" });
  const database = new Database(path.join(dataDirectory, "dialoggg.db"));
  let assignedProjectId;
  let hiddenProjectId;
  try {
    const typeId = owner.defaultProjectTypeId;
    assignedProjectId = Number(database.prepare(`INSERT INTO project (company_id, project_type_id, name, client_email, start_date, note) VALUES (?, ?, 'Assigned Court', 'private-client@example.test', '2026-09-17', 'Internal pricing note')`).run(owner.companyId, typeId).lastInsertRowid);
    hiddenProjectId = Number(database.prepare(`INSERT INTO project (company_id, project_type_id, name, start_date, note) VALUES (?, ?, 'Hidden Court', '2026-09-18', 'Never reveal')`).run(owner.companyId, typeId).lastInsertRowid);
    database.prepare("INSERT INTO project_membership (project_id, company_membership_id) VALUES (?, ?)").run(assignedProjectId, external.membershipId);
    database.prepare("INSERT INTO project_membership (project_id, company_membership_id) VALUES (?, ?)").run(assignedProjectId, employee.membershipId);
    database.prepare("INSERT INTO project_user (project_id, user_id) VALUES (?, ?)").run(assignedProjectId, external.legacyUserId);
    database.prepare("INSERT INTO project_user (project_id, user_id) VALUES (?, ?)").run(assignedProjectId, employee.legacyUserId);
    database.prepare(`INSERT INTO task (project_id, name, start_date, duration, external_visible) VALUES (?, 'Visible milestone', '2026-09-17', 1, 1)`).run(assignedProjectId);
    database.prepare(`INSERT INTO task (project_id, name, start_date, duration, external_visible) VALUES (?, 'Internal task', '2026-09-18', 1, 0)`).run(assignedProjectId);
    database.prepare(`INSERT INTO event_series (company_id,project_id,title,description,timing_mode,start_date,end_date,time_zone,push_to_project,external_visible,created_by_membership_id,updated_by_membership_id) VALUES (?,?,'Visible visit','private description','all_day','2026-09-17','2026-09-17','America/New_York',1,1,?,?)`).run(owner.companyId,assignedProjectId,owner.membershipId,owner.membershipId);
    database.prepare(`INSERT INTO event_series (company_id,project_id,title,timing_mode,start_date,end_date,time_zone,push_to_project,external_visible,created_by_membership_id,updated_by_membership_id) VALUES (?,?,'Internal meeting','all_day','2026-09-18','2026-09-18','America/New_York',1,0,?,?)`).run(owner.companyId,assignedProjectId,owner.membershipId,owner.membershipId);
  } finally { database.close(); }

  appServer = spawn(process.execPath, ["scripts/start-production.mjs"], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "production", PORT: String(port), RAILWAY_VOLUME_MOUNT_PATH: dataDirectory, APP_ENCRYPTION_KEY: encryptionKey }, stdio: ["ignore", "pipe", "pipe"] });
  appServer.stdout.on("data", chunk => { appOutput += chunk.toString(); });
  appServer.stderr.on("data", chunk => { appOutput += chunk.toString(); });
  const startedAt = Date.now();
  while (true) {
    if (appServer.exitCode !== null) throw new Error(`Server exited early.\n${appOutput}`);
    try { if ((await fetch(`${baseUrl}/login`)).status === 200) break; } catch {}
    if (Date.now() - startedAt > 25_000) throw new Error(`Server did not start.\n${appOutput}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const ownerCookies = cookiesFrom(await login(baseUrl, `owner-${suffix}@example.test`, password));
  const adminCookies = cookiesFrom(await login(baseUrl, `admin-${suffix}@example.test`, password));
  const employeeCookies = cookiesFrom(await login(baseUrl, `employee-${suffix}@example.test`, password));
  const externalCookies = cookiesFrom(await login(baseUrl, `external-${suffix}@example.test`, password));
  browser = await playwright.chromium.launch({ channel: "chrome", headless: true });

  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await addCookies(adminContext, adminCookies);
  const page = await adminContext.newPage();
  page.on("pageerror", error => { process.stdout.write(`PAGEERROR  ${error.message}\n`); });
  page.on("console", message => { if (message.type() === "error") process.stdout.write(`CONSOLE  ${message.text()}\n`); });

  await check("Admin sees the persistent company directory and approved Role names", async () => {
    await page.goto(`${baseUrl}/users`);
    await page.getByRole("heading", { name: "Users", exact: true }).waitFor();
    const body = await page.locator("body").innerText();
    for (const value of ["Olivia Owner", "Avery Admin", "Jamie Employee", "Alex Client", "Employee (Internal)", "External/Client"]) assert.match(body, new RegExp(value.replace(/[()]/g, "\\$&")));
    assert.doesNotMatch(body, /UI preview/);
  });

  await check("Admin cannot manage Owner or Admin memberships", async () => {
    const ownerCard = page.locator("article").filter({ hasText: "Olivia Owner" });
    const adminCard = page.locator("article").filter({ hasText: "Avery Admin" });
    assert.equal(await ownerCard.getByRole("button", { name: /Deactivate|Restore/ }).count(), 0);
    assert.equal(await adminCard.getByRole("button", { name: /Deactivate|Restore/ }).count(), 0);
  });

  await check("Admin deactivates and restores an Employee with confirmation", async () => {
    await page.getByRole("button", { name: "Deactivate Jamie Employee" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Deactivate User?" });
    assert.match(await dialog.innerText(), /sessions are revoked/i);
    await dialog.getByRole("button", { name: "Deactivate User" }).click();
    await page.getByRole("button", { name: "Restore Jamie Employee" }).waitFor();
    await page.getByRole("button", { name: "Restore Jamie Employee" }).click();
    await page.getByRole("alertdialog", { name: "Restore User?" }).getByRole("button", { name: "Restore User" }).click();
    await page.getByRole("button", { name: "Deactivate Jamie Employee" }).waitFor();
  });

  await check("Invitation validates identity fields and External minimum assignment", async () => {
    await page.goto(`${baseUrl}/users/new`);
    await page.getByRole("button", { name: "Review invitation" }).click();
    await page.getByText("Enter the User's first name.").waitFor();
    await page.locator("#invite-first-name").fill("New");
    await page.locator("#invite-last-name").fill("Client");
    await page.locator("#invite-email").fill(`new-client-${suffix}@example.test`);
    await page.locator("#invite-role").selectOption("external");
    await page.getByRole("button", { name: "Review invitation" }).click();
    await page.getByText("Assign an External/Client to at least one Project.").waitFor();
  });

  await check("Invitation creates a pending External membership and linked Resource", async () => {
    await page.getByLabel(/Assigned Court/).check();
    await page.getByText("Also add as a Resource").click();
    await page.getByRole("button", { name: "Review invitation" }).click();
    const dialog = page.getByRole("dialog", { name: "Confirm User invitation" });
    assert.match(await dialog.innerText(), /72-hour single-use invitation/i);
    await dialog.getByRole("button", { name: "Create and send invitation" }).click();
    await page.getByRole("heading", { name: "Invitation created" }).waitFor();
  });

  await check("Employee detail saves profile and Project assignments persist", async () => {
    await page.goto(`${baseUrl}/users/${employee.membershipId}`);
    await page.getByRole("button", { name: "Edit details" }).click();
    await page.locator("#edit-first-name").fill("Jamie Updated");
    assert.equal(await page.locator("#edit-email").isDisabled(), true);
    await page.getByRole("dialog", { name: "Edit User details" }).getByRole("button", { name: "Save details" }).click();
    await page.getByRole("heading", { name: "Jamie Updated Employee" }).waitFor();
    await page.getByRole("link", { name: "Edit assignments" }).click();
    await page.getByLabel(/Hidden Court/).check();
    await page.getByRole("button", { name: "Review access changes" }).click();
    await page.getByRole("dialog", { name: "Confirm Project access changes" }).getByRole("button", { name: "Save Project access" }).click();
    await page.getByRole("heading", { name: "Project access saved" }).waitFor();
  });

  await check("Owner can select every fixed Role while Admin cannot", async () => {
    const ownerContext = await browser.newContext(); await addCookies(ownerContext, ownerCookies); const ownerPage = await ownerContext.newPage();
    await ownerPage.goto(`${baseUrl}/users/new`);
    assert.equal(await ownerPage.locator("#invite-role option").count(), 4);
    await ownerContext.close();
    await page.goto(`${baseUrl}/users/new`);
    assert.equal(await page.locator("#invite-role option").count(), 2);
  });

  await check("External sees only assigned Projects and sanitized DTOs", async () => {
    const context = await browser.newContext(); await addCookies(context, externalCookies); const externalPage = await context.newPage();
    await externalPage.goto(`${baseUrl}/projects`);
    const body = await externalPage.locator("body").innerText();
    assert.match(body, /Assigned Court/); assert.doesNotMatch(body, /Hidden Court|Internal pricing note|private-client/);
    const projectJson = await externalPage.evaluate(async () => (await fetch("/api/projects")).json());
    assert.equal(projectJson.projects.length, 1);
    assert.equal(Object.hasOwn(projectJson.projects[0], "note"), false);
    assert.equal(Object.hasOwn(projectJson.projects[0], "client_email"), false);
    const tasks = await externalPage.evaluate(async id => (await fetch(`/api/projects/${id}/tasks`)).json(), assignedProjectId);
    assert.deepEqual(tasks.data.map(item => item.text), ["Assigned Court", "Visible milestone"]);
    assert.equal(tasks.data.filter(item => item.is_root).length, 1);
    assert.equal(Object.hasOwn(tasks, "planVersion"), false);
    assert.equal(tasks.data.some(item => Object.hasOwn(item, "version") || Object.hasOwn(item, "resource_category_id") || Object.hasOwn(item, "start_by_mode")), false);
    assert.deepEqual(tasks.links, []);
    const events = await externalPage.evaluate(async id => (await fetch(`/api/projects/${id}/events`)).json(), assignedProjectId);
    assert.match(JSON.stringify(events), /Visible visit/); assert.doesNotMatch(JSON.stringify(events), /Internal meeting|private description/);
    assert.equal((await externalPage.goto(`${baseUrl}/projects/${hiddenProjectId}`))?.status(), 404);
    const denials = await externalPage.evaluate(async () => ({ calendar: (await fetch("/api/calendar")).status, resources: (await fetch("/api/resources")).status, feed: (await fetch("/api/calendar/feed-url")).status }));
    assert.deepEqual(denials, { calendar: 403, resources: 403, feed: 403 });
    await context.close();
  });

  await check("Employee management routes expose no directory data", async () => {
    const context = await browser.newContext();
    const refreshedEmployeeCookies = cookiesFrom(await login(baseUrl, `employee-${suffix}@example.test`, password));
    await addCookies(context, refreshedEmployeeCookies); const employeePage = await context.newPage();
    await employeePage.goto(`${baseUrl}/users`);
    await employeePage.getByRole("heading", { name: /restricted/i }).waitFor();
    assert.doesNotMatch(await employeePage.locator("body").innerText(), /Olivia Owner|Alex Client/);
    await context.close();
  });

  await check("Users directory remains usable at mobile width", async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${baseUrl}/users`); await page.getByRole("heading", { name: "Users", exact: true }).waitFor();
    const size = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(size.scroll <= size.client, JSON.stringify(size));
  });

  await adminContext.close();
} finally {
  if (browser) await browser.close();
  if (appServer && appServer.exitCode === null) { appServer.kill(); await new Promise(resolve => setTimeout(resolve, 500)); }
  await rm(dataDirectory, { recursive: true, force: true });
}

const passed = results.filter(result => result.status === "PASS").length;
const failed = results.length - passed;
process.stdout.write(`\nRESULT  ${passed} passed, ${failed} failed, ${results.length} total\n`);
if (failed) process.exitCode = 1;
