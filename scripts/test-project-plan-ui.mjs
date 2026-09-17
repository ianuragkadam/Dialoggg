import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { authenticatedHeaders, bootstrapAccount, login, prepareTestDatabase } from "./test-fixtures.mjs";

const results = []; let appServer; let appOutput = ""; let browser;
async function check(name, operation) { try { await operation(); results.push({ name, status: "PASS" }); process.stdout.write(`PASS  ${name}\n`); } catch (error) { const message = error instanceof Error ? error.message : String(error); results.push({ name, status: "FAIL", message }); process.stdout.write(`FAIL  ${name}\n      ${message}\n`); } }
async function freePort() { const listener = createServer(); await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); }); const address = listener.address(); const port = typeof address === "object" && address ? address.port : 0; await new Promise(resolve => listener.close(resolve)); return port; }
async function loadPlaywright() { const supplied = process.env.DIALOGGG_PLAYWRIGHT_PATH; if (supplied) return import(pathToFileURL(path.join(supplied, "index.mjs")).href); try { return await import("playwright"); } catch { throw new Error("Playwright unavailable; set DIALOGGG_PLAYWRIGHT_PATH."); } }
function sessionCookie(response) { const value = response.headers.get("set-cookie")?.match(/dialoggg_session=([^;]+)/)?.[1]; assert.ok(value); return value; }
async function addSession(context, value) { await context.addCookies([{ name: "dialoggg_session", value, domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]); }
async function json(url, options = {}) { const response = await fetch(url, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } }); return { response, data: await response.json() }; }

const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-project-plan-ui-"));
const port = await freePort(); const baseUrl = `http://127.0.0.1:${port}`; const suffix = Date.now().toString(36); const password = "Project-Plan-UI-Test-1!"; const adminEmail = `plan-admin-${suffix}@example.test`; const employeeEmail = `plan-employee-${suffix}@example.test`;
try {
  const playwright = await loadPlaywright();
  prepareTestDatabase(dataDirectory); const admin = bootstrapAccount(dataDirectory, { companyName: "Project Plan QA", fullName: "Plan Admin", email: adminEmail, password, role: "admin" }); bootstrapAccount(dataDirectory, { companyId: admin.companyId, fullName: "Plan Employee", email: employeeEmail, password, role: "employee" });
  appServer = spawn(process.execPath, ["scripts/start-production.mjs"], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "production", PORT: String(port), RAILWAY_VOLUME_MOUNT_PATH: dataDirectory }, stdio: ["ignore", "pipe", "pipe"] });
  appServer.stdout.on("data", chunk => { appOutput += chunk.toString(); }); appServer.stderr.on("data", chunk => { appOutput += chunk.toString(); });
  const started = Date.now(); while (true) { if (appServer.exitCode !== null) throw new Error(`Server exited.\n${appOutput}`); try { if ((await fetch(`${baseUrl}/login`)).status === 200) break; } catch {} if (Date.now() - started > 25_000) throw new Error(`Server timeout.\n${appOutput}`); await new Promise(resolve => setTimeout(resolve, 200)); }

  const registration = await login(baseUrl, adminEmail, password);
  const adminCookie = sessionCookie(registration); const auth = authenticatedHeaders(registration, baseUrl);
  const projectResult = await json(`${baseUrl}/api/projects`, { method: "POST", headers: auth, body: JSON.stringify({ name: "Reading Residence Court", start_date: "2026-09-15" }) });
  assert.equal(projectResult.response.status, 200); const projectId = projectResult.data.id;
  for (const task of [{ text: "Concrete base", start_date: "2026-09-16", duration: 2 }, { text: "Court surfacing", start_date: "2026-09-18", duration: 3 }]) {
    const taskResult = await json(`${baseUrl}/api/projects/${projectId}/tasks`, { method: "POST", headers: auth, body: JSON.stringify(task) }); assert.equal(taskResult.response.status, 200);
  }
  const employeeLogin = await login(baseUrl, employeeEmail, password); const employeeCookie = sessionCookie(employeeLogin);

  browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); await addSession(adminContext, adminCookie); const page = await adminContext.newPage();

  await check("Project Plan keeps original Gantt below the workflow review", async () => {
    await page.goto(`${baseUrl}/projects/${projectId}#plan`); await page.getByRole("heading", { name: "Project Plan controls" }).waitFor();
    assert.equal(await page.getByText("Original Gantt retained", { exact: true }).isVisible(), true);
    assert.equal(await page.getByRole("heading", { name: "Original Project Plan / Gantt" }).isVisible(), true);
    await page.getByText("Concrete base", { exact: true }).last().waitFor();
  });

  await check("Leaf Task editor exposes every approved scheduling field", async () => {
    await page.locator('[data-original-gantt-boundary="preserved"]').getByRole("button", { name: "+ Add Task" }).click(); const dialog = page.getByRole("dialog", { name: "Add Task" });
    for (const label of ["Task Name", "Parent Header", "Time Period", "Link to predecessor", "Start Date", "Duration (working days)", "Allow work on Saturday", "Allow work on Sunday", "Resource Category", "Task Progress"]) assert.equal(await dialog.getByLabel(label, { exact: false }).count() > 0, true, label);
    assert.equal(await dialog.getByText("Crew Alpha", { exact: true }).isVisible(), true);
  });

  await check("Task editor validates name and positive integer Duration", async () => {
    const dialog = page.getByRole("dialog", { name: "Add Task" }); await dialog.locator("#task-name").fill(""); await dialog.locator("#task-duration").fill("0"); await dialog.getByRole("button", { name: "Review schedule" }).click();
    await dialog.getByText("Enter the Task Name.", { exact: true }).waitFor(); await dialog.getByText("Duration must be a whole number of at least 1 working day.", { exact: true }).waitFor();
  });

  await check("Time Period preview uses inclusive working days and independent weekends", async () => {
    const dialog = page.getByRole("dialog", { name: "Add Task" }); await dialog.locator("#task-name").fill("QA surfacing"); await dialog.locator("#task-start-date").fill("2026-09-18"); await dialog.locator("#task-duration").fill("2");
    assert.match(await dialog.innerText(), /Sep 21, 2026/); await dialog.getByLabel("Allow work on Saturday").check(); assert.match(await dialog.innerText(), /Sep 19, 2026/);
    await dialog.getByRole("button", { name: "Review schedule" }).click(); const review = page.getByRole("dialog", { name: "Review Task schedule" }); const text = await review.innerText(); assert.match(text, /Saturday allowed; Sunday excluded/); assert.match(text, /Excluded weekend days do not consume Duration/); await review.getByRole("button", { name: "Back to edit" }).click();
  });

  await check("Linked Task accepts multiple typed predecessors and latest constraint rule", async () => {
    const dialog = page.getByRole("dialog", { name: "Add Task" }); await dialog.getByLabel("Link to predecessor").check(); await dialog.getByRole("button", { name: "+ Add predecessor" }).click();
    assert.equal(await dialog.getByLabel(/Predecessor \d Task/).count(), 2); await dialog.getByRole("button", { name: "Review schedule" }).click(); const review = page.getByRole("dialog", { name: "Review Task schedule" }); assert.match(await review.innerText(), /Linked · 2 predecessors/); assert.match(await review.innerText(), /latest valid result wins/); await review.getByRole("button", { name: "Back to edit" }).click();
  });

  await check("Negative dependency lag is rejected without closing the editor", async () => {
    const dialog = page.getByRole("dialog", { name: "Add Task" }); await dialog.getByLabel("Predecessor 1 lag").fill("-1"); await dialog.getByRole("button", { name: "Review schedule" }).click(); await dialog.getByText("Every dependency lag must be zero or a positive whole number.", { exact: true }).waitFor();
    await dialog.getByLabel("Close Add Task").click();
  });

  await check("Header editor derives dates and progress and omits leaf-only controls", async () => {
    await page.getByRole("button", { name: "Review Header editor" }).click(); const dialog = page.getByRole("dialog", { name: "Review Header Task" }); assert.match(await dialog.innerText(), /Header values are derived/); assert.match(await dialog.innerText(), /weighted by descendant leaf Task duration/); assert.equal(await dialog.getByLabel("Resource Category").count(), 0); assert.equal(await dialog.getByLabel("Link to predecessor").count(), 0); await dialog.getByLabel("Close Review Header Task").click();
  });

  await check("Root, Header deletion, and leaf deletion safeguards are explicit", async () => {
    await page.getByRole("button", { name: "Review root rules" }).click(); let dialog = page.getByRole("alertdialog", { name: "Root Header Task is protected" }); assert.match(await dialog.innerText(), /cannot be deleted, converted to a leaf Task, or moved/); await dialog.getByRole("button", { name: "Understood" }).click();
    await page.getByRole("button", { name: "Header deletion block" }).click(); dialog = page.getByRole("alertdialog", { name: "Header Task cannot be deleted" }); assert.match(await dialog.innerText(), /will not cascade-delete child Tasks/); await dialog.getByRole("button", { name: "Return to Project Plan" }).click();
    await page.getByRole("button", { name: "Leaf deletion confirmation" }).click(); dialog = page.getByRole("alertdialog", { name: "Delete Task?" }); const text = await dialog.innerText(); assert.match(text, /incoming and outgoing dependency links/); assert.match(text, /No unrelated link will be removed/); await dialog.getByRole("button", { name: "Cancel" }).click();
  });

  await check("Dependency dialog explains identical creation paths and atomic rejection", async () => {
    await page.getByRole("button", { name: "Create dependency" }).click(); const dialog = page.getByRole("dialog", { name: "Create dependency" }); const text = await dialog.innerText(); for (const expected of ["Finish-to-Start", "Start-to-Start", "Finish-to-Finish", "Start-to-Finish", "self-links", "another Project", "dependency cycles", "negative lag", "Header Tasks"]) assert.match(text, new RegExp(expected)); await dialog.getByRole("button", { name: "Review dependency" }).click(); await page.getByRole("status").filter({ hasText: "No link or schedule was changed" }).waitFor();
  });

  await check("Scheduling guide documents core calculation examples", async () => {
    await page.getByRole("button", { name: "Scheduling guide" }).click(); const dialog = page.getByRole("dialog", { name: "Scheduling guide" }); const text = await dialog.innerText(); for (const expected of ["Inclusive working-day Duration", "Finish-to-Start +0", "Four dependency types", "Multiple predecessors", "Bidirectional cascade", "Header and root roll-up"]) assert.match(text, new RegExp(expected.replace("+", "\\+"))); await dialog.getByRole("button", { name: "Close guide" }).click();
  });

  await check("Employee gets read-only controls while original Project Plan remains visible", async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await addSession(context, employeeCookie); const employee = await context.newPage(); await employee.goto(`${baseUrl}/projects/${projectId}#plan`); await employee.getByText("Read-only Project Plan", { exact: true }).waitFor(); assert.equal(await employee.locator('[data-original-gantt-boundary="preserved"]').getByRole("button", { name: "+ Add Task" }).count(), 0); await employee.getByText("Concrete base", { exact: true }).last().waitFor(); await context.close();
  });

  await check("Phone Project Plan avoids page-level horizontal overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${baseUrl}/projects/${projectId}#plan`); await page.getByRole("heading", { name: "Project Plan controls" }).waitFor(); const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })); assert.ok(dimensions.scrollWidth <= dimensions.width, JSON.stringify(dimensions));
  });

  await check("Signed-out Project Plan returns to Login", async () => {
    const context = await browser.newContext(); const anonymous = await context.newPage(); await anonymous.goto(`${baseUrl}/projects/${projectId}`); assert.equal(new URL(anonymous.url()).pathname, "/login"); await context.close();
  });
  await adminContext.close();
} finally {
  if (browser) await browser.close(); if (appServer && appServer.exitCode === null) { appServer.kill(); await new Promise(resolve => setTimeout(resolve, 500)); } await rm(dataDirectory, { recursive: true, force: true });
}
const passed = results.filter(item => item.status === "PASS").length; const failed = results.length - passed; process.stdout.write(`\nRESULT  ${passed} passed, ${failed} failed, ${results.length} total\n`); if (failed) process.exitCode = 1;
