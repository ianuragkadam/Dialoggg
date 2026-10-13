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
function csrfCookie(response) { const value = response.headers.get("set-cookie")?.match(/dialoggg_csrf=([^;]+)/)?.[1]; assert.ok(value); return value; }
async function addSession(context, value, csrf) { await context.addCookies([{ name: "dialoggg_session", value, domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }, { name: "dialoggg_csrf", value: csrf, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]); }
async function json(url, options = {}) { const response = await fetch(url, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } }); return { response, data: await response.json() }; }

const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-project-plan-ui-"));
const port = await freePort(); const baseUrl = `http://127.0.0.1:${port}`; const suffix = Date.now().toString(36); const password = "Project-Plan-UI-Test-1!"; const adminEmail = `plan-admin-${suffix}@example.test`; const employeeEmail = `plan-employee-${suffix}@example.test`;
try {
  const playwright = await loadPlaywright();
  prepareTestDatabase(dataDirectory); const admin = bootstrapAccount(dataDirectory, { companyName: "Project Plan QA", fullName: "Plan Admin", email: adminEmail, password, role: "admin" }); bootstrapAccount(dataDirectory, { companyId: admin.companyId, fullName: "Plan Employee", email: employeeEmail, password, role: "employee" });
  const serverArgs = process.env.DIALOGGG_TEST_SERVER_MODE === "next-start"
    ? ["node_modules/next/dist/bin/next", "start", "-p", String(port)] : ["scripts/start-production.mjs"];
  appServer = spawn(process.execPath, serverArgs, { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "production", PORT: String(port), RAILWAY_VOLUME_MOUNT_PATH: dataDirectory, APP_BASE_URL: baseUrl }, stdio: ["ignore", "pipe", "pipe"] });
  appServer.stdout.on("data", chunk => { appOutput += chunk.toString(); }); appServer.stderr.on("data", chunk => { appOutput += chunk.toString(); });
  const started = Date.now(); while (true) { if (appServer.exitCode !== null) throw new Error(`Server exited.\n${appOutput}`); try { if ((await fetch(`${baseUrl}/login`)).status === 200) break; } catch {} if (Date.now() - started > 25_000) throw new Error(`Server timeout.\n${appOutput}`); await new Promise(resolve => setTimeout(resolve, 200)); }

  const registration = await login(baseUrl, adminEmail, password);
  const adminCookie = sessionCookie(registration); const adminCsrf = csrfCookie(registration); const auth = authenticatedHeaders(registration, baseUrl);
  const projectResult = await json(`${baseUrl}/api/projects`, { method: "POST", headers: auth, body: JSON.stringify({ name: "Reading Residence Court", project_type_id: admin.defaultProjectTypeId, client_name: "Morgan Family", client_email: "client@example.test", address: "1499 Reading Road", city: "Mohnton", state: "PA", zip: "19540", phone: "7175550100", start_date: "2026-09-15" }) });
  assert.equal(projectResult.response.status, 200); const projectId = projectResult.data.id;
  const resourceResult = await json(`${baseUrl}/api/resources`, { method: "POST", headers: auth, body: JSON.stringify({ name: "QA Crew", category_name: "Employee", email: "crew@example.test", phone: "7175550101" }) });
  assert.equal(resourceResult.response.status, 200, JSON.stringify(resourceResult.data));
  let planVersion = (await json(`${baseUrl}/api/projects/${projectId}/tasks`, { headers: auth })).data.planVersion;
  const initialTaskIds = [];
  for (const task of [{ text: "Concrete base", start_date: "2026-09-16", duration: 2 }, { text: "Court surfacing", start_date: "2026-09-18", duration: 3 }]) {
    const taskResult = await json(`${baseUrl}/api/projects/${projectId}/tasks`, { method: "POST", headers: auth, body: JSON.stringify({ ...task, planVersion, resourceIds: [resourceResult.data.id] }) }); assert.equal(taskResult.response.status, 201, JSON.stringify(taskResult.data)); planVersion = taskResult.data.planVersion; initialTaskIds.push(taskResult.data.id);
  }
  const initialLink = await json(`${baseUrl}/api/projects/${projectId}/links`, { method: "POST", headers: auth, body: JSON.stringify({ source: initialTaskIds[0], target: initialTaskIds[1], type: "0", lag: 0, planVersion }) }); assert.equal(initialLink.response.status, 201, JSON.stringify(initialLink.data));
  const employeeLogin = await login(baseUrl, employeeEmail, password); const employeeCookie = sessionCookie(employeeLogin); const employeeCsrf = csrfCookie(employeeLogin);

  browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); await addSession(adminContext, adminCookie, adminCsrf); const page = await adminContext.newPage();

  await check("root hierarchy panel shows live saved tasks and launches their Gantt editor", async () => {
    await page.goto(`${baseUrl}/projects/${projectId}#plan`);
    const panel = page.getByTestId("live-root-task-panel");
    await panel.getByText("Project hierarchy · live data").waitFor();
    await panel.getByText("Reading Residence Court", { exact: true }).waitFor();
    await panel.getByText("Concrete base", { exact: true }).waitFor();
    await panel.getByText("Court surfacing", { exact: true }).waitFor();
    await panel.getByText("FS +0 · Concrete base", { exact: true }).waitFor();
    await panel.getByRole("button", { name: "Root task rules" }).click();
    const rootRules = page.getByRole("dialog", { name: "Project root task rules" });
    assert.match(await rootRules.innerText(), /groups the 2 direct child tasks/i);
    await rootRules.getByRole("button", { name: "Close", exact: true }).click();
    await panel.getByRole("button", { name: "Edit in Gantt" }).first().click();
    await page.getByRole("dialog", { name: "Edit Task" }).getByLabel("Task Name").waitFor();
    await page.getByRole("dialog", { name: "Edit Task" }).getByRole("button", { name: "Cancel" }).click();
  });

  await check("original Gantt persists a complete working-day Task and reloads it", async () => {
    const gantt = page.getByTestId("persistent-gantt");
    await gantt.getByRole("button", { name: "+ Add Task" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Task" });
    await dialog.getByLabel("Task Name").fill("Persistent QA Task");
    await dialog.getByLabel("Start Date").fill("2026-09-18");
    await dialog.getByLabel("Duration (days)").fill("2");
    await dialog.getByLabel("Task Progress", { exact: true }).fill("40");
    assert.equal(await dialog.getByLabel("Start Date").inputValue(), "2026-09-18");
    assert.equal(await dialog.getByLabel("Duration (days)").inputValue(), "2");
    await dialog.getByLabel("Allow work on Saturday").check();
    await dialog.getByLabel("Resource Category").selectOption({ label: "Employee" });
    await dialog.getByRole("button", { name: "Save" }).click();
    await page.getByRole("status").filter({ hasText: "Persistent QA Task was saved" }).waitFor();
    await page.reload();
    await page.getByTestId("persistent-gantt").getByText("Persistent QA Task", { exact: true }).first().waitFor();
    const taskRow = page.getByTestId("persistent-gantt").locator(".gantt_row").filter({ hasText: "Persistent QA Task" });
    assert.match((await taskRow.innerText()).replace(/\s+/g, " "), /Persistent QA Task.*40/);
    assert.equal(await gantt.locator('.gantt_grid_head_cell').filter({ hasText: 'Resources' }).count(), 1);
    assert.equal(await gantt.locator('.gantt_grid_head_cell').filter({ hasText: 'Done' }).count(), 1);
    assert.equal(await gantt.locator('.gantt_container').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
    await gantt.locator('.gantt_row').filter({ hasText: 'Concrete base' }).getByText('QA Crew').waitFor();
    await gantt.screenshot({ path: path.join(process.cwd(), 'artifacts', 'gantt-reference-restyle.png') });
    const persisted = await json(`${baseUrl}/api/projects/${projectId}/tasks`, { headers: auth });
    const task = persisted.data.data.find(item => item.text === "Persistent QA Task");
    assert.ok(task);
    assert.equal(task.start_date, "2026-09-18");
    assert.equal(task.end_date, "2026-09-19");
    assert.equal(task.allow_saturday, true);
    assert.equal(task.progress, 0.4);
    assert.equal(task.color, '#3B417D');
    assert.equal(persisted.data.data.filter(item => item.is_root).length, 1);
  });

  await check("changing a Task duration preserves its assigned Resource", async () => {
    const gantt = page.getByTestId("persistent-gantt");
    const panel = page.getByTestId("live-root-task-panel");
    await page.evaluate(() => {
      const chart = window.gantt;
      const originalShowDate = chart.showDate;
      window.__ganttShowDateCalls = [];
      chart.showDate = function (date) {
        window.__ganttShowDateCalls.push(chart.date.date_to_str("%Y-%m-%d")(date));
        return originalShowDate.call(chart, date);
      };
    });
    await panel.getByRole("button", { name: "Edit in Gantt" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Edit Task" });
    assert.equal(await dialog.getByLabel("Task Name").inputValue(), "Concrete base");
    assert.equal(await dialog.getByLabel("QA Crew").isChecked(), true);
    await dialog.getByLabel("Start Date").fill("2027-08-12");
    await dialog.getByLabel("Duration (days)").fill("3");
    await dialog.getByRole("button", { name: "Save" }).click();
    await page.getByRole("status").filter({ hasText: "Concrete base was saved" }).waitFor();
    assert.equal(await page.evaluate(() => window.__ganttShowDateCalls.at(-1)), "2027-08-12");
    const taskRow = gantt.locator(".gantt_row").filter({ hasText: "Concrete base" });
    await taskRow.getByText("QA Crew", { exact: true }).waitFor();
    const assignments = await json(`${baseUrl}/api/projects/${projectId}/tasks/${initialTaskIds[0]}/resources`, { headers: auth });
    assert.equal(assignments.response.status, 200);
    assert.deepEqual(assignments.data.resource_ids, [resourceResult.data.id]);

    const currentPlan = await json(`${baseUrl}/api/projects/${projectId}/tasks`, { headers: auth });
    const task = currentPlan.data.data.find(item => item.id === initialTaskIds[0]);
    const partialUpdate = await json(`${baseUrl}/api/projects/${projectId}/tasks/${initialTaskIds[0]}`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({ planVersion: currentPlan.data.planVersion, version: task.version, duration: 2 }),
    });
    assert.equal(partialUpdate.response.status, 200, JSON.stringify(partialUpdate.data));
    const afterPartialUpdate = await json(`${baseUrl}/api/projects/${projectId}/tasks/${initialTaskIds[0]}/resources`, { headers: auth });
    assert.deepEqual(afterPartialUpdate.data.resource_ids, [resourceResult.data.id]);
    await page.reload();
    await page.getByTestId("persistent-gantt").getByText("Concrete base", { exact: true }).first().waitFor();
  });

  await check("live task panel refreshes after a Gantt edit", async () => {
    const panel = page.getByTestId("live-root-task-panel");
    await panel.getByTestId(/^live-plan-task-/).first().waitFor();
    await page.getByTestId("persistent-gantt").getByRole("button", { name: "+ Add Task" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Task" });
    await dialog.getByLabel("Task Name").fill("Live panel QA task");
    await dialog.getByLabel("Start Date").fill("2026-09-22");
    await dialog.getByLabel("Duration (days)").fill("1");
    await dialog.getByRole("button", { name: "Save" }).click();
    await panel.getByText("Live panel QA task", { exact: true }).waitFor();
    await panel.getByText(/4 saved tasks/).waitFor();
  });

  await check("Project Plan guide opens and closes with its arrow toggle", async () => {
    const guide = page.getByRole("button", { name: "Project Plan / Gantt Chart Guide" });
    assert.equal(await guide.getAttribute("aria-expanded"), "false");
    await guide.click();
    assert.equal(await guide.getAttribute("aria-expanded"), "true");
    await page.getByText("Header and Project dates:").waitFor();
    await guide.click();
    assert.equal(await guide.getAttribute("aria-expanded"), "false");
  });

  await check("Employee gets read-only controls while original Project Plan remains visible", async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await addSession(context, employeeCookie, employeeCsrf); const employee = await context.newPage(); await employee.goto(`${baseUrl}/projects/${projectId}#plan`); await employee.getByTestId("live-root-task-panel").getByText("Concrete base", { exact: true }).waitFor(); assert.equal(await employee.getByTestId("live-root-task-panel").getByRole("button", { name: "Edit in Gantt" }).count(), 0); assert.equal(await employee.getByTestId("persistent-gantt").getByRole("button", { name: "+ Add Task" }).count(), 0); await context.close();
  });

  await check("Phone Project Plan avoids page-level horizontal overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${baseUrl}/projects/${projectId}#plan`); await page.getByTestId("live-root-task-panel").waitFor(); const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })); assert.ok(dimensions.scrollWidth <= dimensions.width, JSON.stringify(dimensions));
  });

  await check("Signed-out Project Plan returns to Login", async () => {
    const context = await browser.newContext(); const anonymous = await context.newPage(); await anonymous.goto(`${baseUrl}/projects/${projectId}`); assert.equal(new URL(anonymous.url()).pathname, "/login"); await context.close();
  });
  await adminContext.close();
} finally {
  if (browser) await browser.close(); if (appServer && appServer.exitCode === null) { appServer.kill(); await new Promise(resolve => setTimeout(resolve, 500)); } await rm(dataDirectory, { recursive: true, force: true });
}
const passed = results.filter(item => item.status === "PASS").length; const failed = results.length - passed; process.stdout.write(`\nRESULT  ${passed} passed, ${failed} failed, ${results.length} total\n`); if (failed) process.exitCode = 1;
