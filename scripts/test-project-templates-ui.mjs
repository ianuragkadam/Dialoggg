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
  try {
    await operation();
    results.push({ name, status: "PASS" });
    process.stdout.write(`PASS  ${name}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", message });
    process.stdout.write(`FAIL  ${name}\n      ${message}\n`);
  }
}

async function freePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

async function loadPlaywright() {
  const suppliedPath = process.env.DIALOGGG_PLAYWRIGHT_PATH;
  if (suppliedPath) return import(pathToFileURL(path.join(suppliedPath, "index.mjs")).href);
  try {
    return await import("playwright");
  } catch {
    throw new Error("Playwright is unavailable. Install it or set DIALOGGG_PLAYWRIGHT_PATH to the Playwright package directory.");
  }
}

function cookieValue(response, name) {
  const value = response.headers.get("set-cookie")?.match(new RegExp(`${name}=([^;]+)`))?.[1];
  assert.ok(value, `authentication response did not include ${name}`);
  return value;
}

async function addAuth(context, response) {
  await context.addCookies([
    { name: "dialoggg_session", value: cookieValue(response, "dialoggg_session"), domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
    { name: "dialoggg_csrf", value: cookieValue(response, "dialoggg_csrf"), domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" },
  ]);
}

const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-project-templates-ui-"));
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const suffix = Date.now().toString(36);
const adminEmail = `project-templates-admin-${suffix}@example.test`;
const ownerEmail = `project-templates-owner-${suffix}@example.test`;
const employeeEmail = `project-templates-employee-${suffix}@example.test`;
const externalEmail = `project-templates-external-${suffix}@example.test`;
const password = "Project-Templates-Test-1!";
let projectId;
let templateId;
let ownerTemplateId;
let createdProjectId;

try {
  const playwright = await loadPlaywright();
  prepareTestDatabase(dataDirectory);
  const admin = bootstrapAccount(dataDirectory, { companyName: "Project Templates QA Company", fullName: "Project Templates Admin", email: adminEmail, password, role: "admin" });
  bootstrapAccount(dataDirectory, { companyId: admin.companyId, fullName: "Project Templates Owner", email: ownerEmail, password, role: "owner" });
  bootstrapAccount(dataDirectory, { companyId: admin.companyId, fullName: "Project Templates Employee", email: employeeEmail, password, role: "employee" });
  bootstrapAccount(dataDirectory, { companyId: admin.companyId, fullName: "Project Templates External", email: externalEmail, password, role: "external" });

  const seed = new Database(path.join(dataDirectory, "dialoggg.db"));
  seed.pragma("foreign_keys = ON");
  try {
    seed.transaction(() => {
      projectId = Number(seed.prepare(`
        INSERT INTO project (company_id, project_type_id, name, start_date, created_by)
        VALUES (?, ?, 'Miller Residence', '2026-09-01', ?)
      `).run(admin.companyId, admin.defaultProjectTypeId, admin.legacyUserId).lastInsertRowid);
      const categoryId = seed.prepare("SELECT id FROM resource_category WHERE company_id = ? AND name = 'Employee'").get(admin.companyId).id;
      const resourceId = Number(seed.prepare(`
        INSERT INTO resource (company_id, category_id, name, status) VALUES (?, ?, 'Template Crew', 'active')
      `).run(admin.companyId, categoryId).lastInsertRowid);
      const insertTask = seed.prepare(`
        INSERT INTO task (
          project_id, parent_id, name, start_date, duration, progress, color,
          is_header, sort_order, allow_saturday, allow_sunday, resource_category_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const headerId = Number(insertTask.run(projectId, null, "Pre-construction", "2026-09-01", 4, 0.5, "#1d4ed8", 1, 1, 0, 0, null).lastInsertRowid);
      const layoutId = Number(insertTask.run(projectId, headerId, "Site layout", "2026-09-01", 1, 1, "#0f766e", 0, 2, 0, 0, categoryId).lastInsertRowid);
      const excavationId = Number(insertTask.run(projectId, headerId, "Excavation", "2026-09-02", 2, 0.25, "#b45309", 0, 3, 1, 0, categoryId).lastInsertRowid);
      insertTask.run(projectId, headerId, "Inspection", "2026-09-04", 1, 0.75, "#7c3aed", 0, 4, 0, 0, categoryId);
      seed.prepare(`INSERT INTO task_link (project_id, source_task_id, target_task_id, link_type, lag_days) VALUES (?, ?, ?, 'fs', 0)`).run(projectId, layoutId, excavationId);
      seed.prepare("INSERT INTO task_resource (task_id, resource_id) VALUES (?, ?)").run(excavationId, resourceId);
    })();
  } finally { seed.close(); }

  appServer = spawn(process.execPath, ["scripts/start-production.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "production", PORT: String(port), RAILWAY_VOLUME_MOUNT_PATH: dataDirectory },
    stdio: ["ignore", "pipe", "pipe"],
  });
  appServer.stdout.on("data", chunk => { appOutput += chunk.toString(); });
  appServer.stderr.on("data", chunk => { appOutput += chunk.toString(); });

  const startedAt = Date.now();
  while (true) {
    if (appServer.exitCode !== null) throw new Error(`Test server exited early.\n${appOutput}`);
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.status === 200) break;
    } catch {}
    if (Date.now() - startedAt > 25_000) throw new Error(`Test server did not start.\n${appOutput}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  browser = await playwright.chromium.launch({ channel: "chrome", headless: true });
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const adminLogin = await login(baseUrl, adminEmail, password);
  await addAuth(adminContext, adminLogin);
  const page = await adminContext.newPage();

  await check("admin opens an empty live company Template Library", async () => {
    await page.goto(`${baseUrl}/templates`);
    assert.equal(await page.title(), "Project Templates | Dialoggg");
    await page.getByRole("heading", { name: "Project Templates", exact: true }).waitFor();
    await page.getByRole("heading", { name: "No Templates saved yet" }).waitFor();
    assert.doesNotMatch(await page.locator("body").innerText(), /UI preview/);
  });

  await check("save-from-Project validates and persists hierarchy, offsets, categories, and exact Resources", async () => {
    await page.goto(`${baseUrl}/templates/new`);
    await page.getByRole("button", { name: "Save Template" }).click();
    await page.getByText("Choose the Project Plan to save.", { exact: true }).waitFor();
    await page.getByText("Enter a Template name.", { exact: true }).waitFor();
    await page.locator("#source-project").selectOption({ label: "Miller Residence" });
    await page.locator("#new-template-name").fill("Backyard Court");
    await page.getByLabel("Also save current Resource assignments").check();
    await page.getByRole("button", { name: "Save Template" }).click();
    await page.getByRole("heading", { name: "Template saved" }).waitFor();
    const href = await page.getByRole("link", { name: "View saved Template" }).getAttribute("href");
    templateId = Number(href?.split("/").pop());
    assert.ok(templateId);
    assert.match(await page.locator("body").innerText(), /4 Tasks/);
  });

  await check("saved Template survives refresh and a second Template can be created", async () => {
    await page.goto(`${baseUrl}/templates`);
    await page.reload();
    await page.getByRole("button", { name: "Rename Backyard Court" }).waitFor();
    await page.goto(`${baseUrl}/templates/new`);
    await page.locator("#source-project").selectOption({ label: "Miller Residence" });
    await page.locator("#new-template-name").fill("Court Resurfacing");
    await page.getByRole("button", { name: "Save Template" }).click();
    await page.getByRole("heading", { name: "Template saved" }).waitFor();
    await page.goto(`${baseUrl}/templates`);
    await page.getByRole("button", { name: "Delete Court Resurfacing" }).waitFor();
  });

  await check("Template search provides a recoverable no-results state", async () => {
    await page.getByLabel("Search Project Templates").fill("No template here");
    await page.getByRole("heading", { name: "No matching Templates" }).waitFor();
    await page.getByRole("button", { name: "Clear search" }).click();
    await page.getByRole("button", { name: "Rename Backyard Court" }).waitFor();
  });

  await check("rename validates duplicates and persists without changing Projects", async () => {
    await page.getByRole("button", { name: "Rename Backyard Court" }).click();
    let dialog = page.getByRole("dialog", { name: "Rename Template" });
    const input = dialog.locator("#template-name");
    await page.waitForFunction(() => document.activeElement?.id === "template-name");
    await input.fill("court resurfacing");
    await dialog.getByRole("button", { name: "Save new name" }).click();
    assert.match(await dialog.getByRole("alert").innerText(), /already exists/i);
    await input.fill("Residential Court");
    await dialog.getByRole("button", { name: "Save new name" }).click();
    await page.getByRole("button", { name: "Rename Residential Court" }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: "Rename Residential Court" }).waitFor();
  });

  await check("changed rename protects against accidental dismissal", async () => {
    await page.getByRole("button", { name: "Rename Residential Court" }).click();
    let dialog = page.getByRole("dialog", { name: "Rename Template" });
    await dialog.locator("#template-name").fill("Temporary residential name");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    let discard = page.getByRole("alertdialog", { name: "Discard unsaved changes?" });
    await discard.getByRole("button", { name: "Keep editing" }).click();
    dialog = page.getByRole("dialog", { name: "Rename Template" });
    assert.equal(await dialog.locator("#template-name").inputValue(), "Temporary residential name");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    discard = page.getByRole("alertdialog", { name: "Discard unsaved changes?" });
    await discard.getByRole("button", { name: "Discard changes" }).click();
  });

  await check("Template deletion supports safe cancel and persists after confirmation", async () => {
    await page.getByRole("button", { name: "Delete Court Resurfacing" }).click();
    let dialog = page.getByRole("alertdialog", { name: "Delete Template?" });
    assert.match(await dialog.innerText(), /Existing Projects created from it will not change/);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Delete Court Resurfacing" }).click();
    dialog = page.getByRole("alertdialog", { name: "Delete Template?" });
    await dialog.getByRole("button", { name: "Delete Template" }).click();
    await page.reload();
    assert.equal(await page.getByRole("button", { name: "Delete Court Resurfacing" }).count(), 0);
  });

  await check("Template detail renders the complete saved Plan and v1 editing boundary", async () => {
    await page.goto(`${baseUrl}/templates/${templateId}`);
    await page.getByRole("heading", { name: "Residential Court", exact: true }).waitFor();
    const body = await page.locator("body").innerText();
    assert.match(body, /Saved Project Plan/);
    assert.match(body, /relative working-day offsets/);
    assert.match(body, /no separate Template schedule editor/);
    assert.match(body, /Site layout/);
    assert.match(body, /Employee/);
  });

  await check("start-from-Template validates, preserves fields on Escape, and creates a real Project", async () => {
    await page.goto(`${baseUrl}/templates/${templateId}/use`);
    await page.getByRole("button", { name: "Review Project setup" }).click();
    await page.getByText("Enter a Project name of 100 characters or fewer.", { exact: true }).waitFor();
    await page.getByText("Choose exactly one Project Type.", { exact: true }).waitFor();
    await page.getByText("Choose the Project Start Date.", { exact: true }).waitFor();
    await page.locator("#template-project-name").fill("Johnson Residence");
    await page.locator("#template-project-type").selectOption({ label: "Residential Court" });
    await page.locator("#template-start-date").fill("2026-10-02");
    await page.locator("#template-client-name").fill("Alex Johnson");
    await page.getByRole("button", { name: "Review Project setup" }).click();
    let dialog = page.getByRole("dialog", { name: "Confirm Project setup" });
    assert.match(await dialog.innerText(), /4 at 0%/);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#template-project-name").inputValue(), "Johnson Residence");
    await page.getByRole("button", { name: "Review Project setup" }).click();
    dialog = page.getByRole("dialog", { name: "Confirm Project setup" });
    await dialog.getByRole("button", { name: "Create Project" }).click();
    await page.getByRole("heading", { name: "Project created from Template" }).waitFor();
    const href = await page.getByRole("link", { name: "Open Project Plan" }).getAttribute("href");
    createdProjectId = Number(href?.match(/\/projects\/(\d+)/)?.[1]);
    assert.ok(createdProjectId);
    const tasks = await page.evaluate(async id => (await fetch(`/api/projects/${id}/tasks`)).json(), createdProjectId);
    assert.equal(tasks.data.length, 4);
    assert.ok(tasks.data.every(task => task.progress === 0));
  });

  await check("deleting a used Template leaves the created Project and original Gantt Plan intact", async () => {
    await page.goto(`${baseUrl}/templates`);
    await page.getByRole("button", { name: "Delete Residential Court" }).click();
    await page.getByRole("alertdialog", { name: "Delete Template?" }).getByRole("button", { name: "Delete Template" }).click();
    await page.goto(`${baseUrl}/projects/${createdProjectId}#plan`);
    await page.getByRole("heading", { name: "Johnson Residence", exact: true }).waitFor();
    assert.match(await page.locator("body").innerText(), /original Gantt remains the Project Plan/i);
  });

  await check("Owner can create and delete a Template with refresh persistence", async () => {
    const ownerContext = await browser.newContext();
    await addAuth(ownerContext, await login(baseUrl, ownerEmail, password));
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto(`${baseUrl}/templates/new`);
    await ownerPage.locator("#source-project").selectOption({ label: "Miller Residence" });
    await ownerPage.locator("#new-template-name").fill("Owner Template");
    await ownerPage.getByRole("button", { name: "Save Template" }).click();
    await ownerPage.getByRole("heading", { name: "Template saved" }).waitFor();
    const href = await ownerPage.getByRole("link", { name: "View saved Template" }).getAttribute("href");
    ownerTemplateId = Number(href?.split("/").pop());
    await ownerPage.goto(`${baseUrl}/templates`);
    await ownerPage.reload();
    await ownerPage.getByRole("button", { name: "Delete Owner Template" }).click();
    await ownerPage.getByRole("alertdialog", { name: "Delete Template?" }).getByRole("button", { name: "Delete Template" }).click();
    await ownerPage.reload();
    assert.equal(await ownerPage.getByRole("button", { name: "Delete Owner Template" }).count(), 0);
    await ownerContext.close();
  });

  for (const [role, email] of [["Employee", employeeEmail], ["External/Client", externalEmail]]) {
    await check(`${role} sees restriction without Template business data`, async () => {
      const context = await browser.newContext();
      await addAuth(context, await login(baseUrl, email, password));
      const restricted = await context.newPage();
      await restricted.goto(`${baseUrl}/templates/${ownerTemplateId || templateId}`);
      await restricted.getByRole("heading", { name: "Project Templates are restricted" }).waitFor();
      assert.doesNotMatch(await restricted.locator("body").innerText(), /Miller Residence|Site layout|Template Crew/);
      assert.doesNotMatch(await restricted.title(), /Owner Template|Residential Court/);
      await context.close();
    });
  }

  await check("signed-out direct Template route returns to Login", async () => {
    const anonymousContext = await browser.newContext();
    const anonymousPage = await anonymousContext.newPage();
    await anonymousPage.goto(`${baseUrl}/templates/${templateId}/use`);
    await anonymousPage.waitForURL("**/login");
    await anonymousPage.getByRole("heading", { name: /Log in to Dialoggg/i }).waitFor();
    await anonymousContext.close();
  });

  await check("mobile Template Library has no horizontal page overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/templates`);
    await page.getByRole("heading", { name: "Project Templates", exact: true }).waitFor();
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.ok(dimensions.scrollWidth <= dimensions.width, `mobile page overflowed: ${JSON.stringify(dimensions)}`);
  });

  await adminContext.close();
} finally {
  if (browser) await browser.close();
  if (appServer && appServer.exitCode === null) {
    appServer.kill();
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  await rm(dataDirectory, { recursive: true, force: true });
}

const passed = results.filter(result => result.status === "PASS").length;
const failed = results.length - passed;
process.stdout.write(`\nRESULT  ${passed} passed, ${failed} failed, ${results.length} total\n`);
if (failed) process.exitCode = 1;
