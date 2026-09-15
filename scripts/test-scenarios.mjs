import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const results = [];
let server;
let serverOutput = "";

function oneOf(actual, expected, message) {
  assert.ok(expected.includes(actual), `${message}: expected ${expected.join("/")}, received ${actual}`);
}

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

class Client {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = new Map();
  }

  async request(urlPath, options = {}) {
    const headers = new Headers(options.headers || {});
    if (this.cookies.size) {
      headers.set("Cookie", [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; "));
    }
    if (options.body !== undefined) headers.set("Content-Type", "application/json");

    const response = await fetch(`${this.baseUrl}${urlPath}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: options.redirect || "manual",
    });

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const pair = setCookie.split(";", 1)[0];
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }

    const text = await response.text();
    let data = text;
    if ((response.headers.get("content-type") || "").includes("application/json")) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    return { status: response.status, headers: response.headers, data, text };
  }
}

const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-scenarios-"));
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const initialFormToken = "scenario-initial-form-token-please-keep-private";
const initialReviewToken = "scenario-initial-review-token-please-keep-private";
const followUpFormToken = "scenario-follow-up-form-token-please-keep-private";
const followUpReviewToken = "scenario-follow-up-review-token-please-keep-private";

try {
  server = spawn(process.execPath, ["scripts/start-production.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      RAILWAY_VOLUME_MOUNT_PATH: dataDirectory,
      REQUIREMENTS_FORM_TOKEN: initialFormToken,
      REQUIREMENTS_REVIEW_TOKEN: initialReviewToken,
      FOLLOW_UP_REQUIREMENTS_FORM_TOKEN: followUpFormToken,
      FOLLOW_UP_REQUIREMENTS_REVIEW_TOKEN: followUpReviewToken,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", chunk => { serverOutput += chunk.toString(); });
  server.stderr.on("data", chunk => { serverOutput += chunk.toString(); });

  const startedAt = Date.now();
  while (true) {
    if (server.exitCode !== null) throw new Error(`Test server exited early.\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.status === 200) break;
    } catch {}
    if (Date.now() - startedAt > 20_000) throw new Error(`Test server did not start.\n${serverOutput}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const anonymous = new Client(baseUrl);
  const adminA = new Client(baseUrl);
  const adminB = new Client(baseUrl);
  const platform = new Client(baseUrl);
  const viewerA = new Client(baseUrl);
  const oldPasswordClient = new Client(baseUrl);

  const suffix = Date.now().toString(36);
  const adminAEmail = `admin-a-${suffix}@example.test`;
  const adminBEmail = `admin-b-${suffix}@example.test`;
  const platformEmail = `platform-${suffix}@example.test`;
  const viewerAEmail = `viewer-a-${suffix}@example.test`;
  const passwordA = "Scenario-A-Password-1!";
  const changedPasswordA = "Scenario-A-Password-2!";
  const passwordB = "Scenario-B-Password-1!";
  const platformPassword = "Scenario-Platform-Password-1!";
  const viewerPassword = "Scenario-Viewer-Password-1!";

  let companyAId;
  let companyBId;
  let adminAId;
  let adminBId;
  let platformUserId;
  let viewerAId;
  let projectAId;
  let projectBId;
  let resourceAId;
  let resourceBId;
  let categoryAId;
  let predecessorId;
  let successorId;
  let overlapId;

  await check("signed-out root redirects to login", async () => {
    const response = await anonymous.request("/");
    assert.equal(response.status, 307);
    assert.ok(response.headers.get("location")?.endsWith("/login"));
  });

  await check("login page is available", async () => {
    const response = await anonymous.request("/login");
    assert.equal(response.status, 200);
    assert.match(response.text, /log in/i);
    assert.doesNotMatch(response.text, /back to home/i);
  });

  await check("security headers are returned", async () => {
    const response = await anonymous.request("/login");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  });

  await check("initial and follow-up workshops use separate response sets", async () => {
    const [initial, followUp] = await Promise.all([
      anonymous.request(`/api/requirements/${initialFormToken}`),
      anonymous.request(`/api/requirements/${followUpFormToken}`),
    ]);
    assert.equal(initial.status, 200);
    assert.equal(followUp.status, 200);
    assert.equal(initial.data.progress.total, 55);
    assert.equal(followUp.data.progress.total, 19);
    assert.equal(initial.data.progress.answered, 0);
    assert.equal(followUp.data.progress.answered, 0);
    assert.equal(initial.data.state.form_key, "dialoggg-reboot-v1");
    assert.equal(followUp.data.state.form_key, "dialoggg-reboot-follow-up-v1");
  });

  await check("follow-up workshop page uses the detailed plain-language version", async () => {
    const response = await anonymous.request(`/requirements/${followUpFormToken}`);
    assert.equal(response.status, 200);
    assert.match(response.text, /Dialoggg Follow-up Workshop/);
    assert.match(response.text, /follow-up requirements workshop with simple examples/i);
    assert.match(response.text, /\\"kind\\":\\"follow_up\\"/);
  });

  await check("private workshop tokens reject unknown links", async () => {
    const [form, review] = await Promise.all([
      anonymous.request("/api/requirements/not-a-real-private-token"),
      anonymous.request("/api/requirements-review/not-a-real-private-token"),
    ]);
    assert.equal(form.status, 404);
    assert.equal(review.status, 404);
  });

  await check("follow-up answer and comment autosave without changing the original workshop", async () => {
    const saved = await anonymous.request(`/api/requirements/${followUpFormToken}`, {
      method: "PUT",
      body: {
        questionId: "fu05",
        answerId: "next_day",
        comment: "Thursday is easier for everyone to understand.",
      },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.snapshot.progress.answered, 1);
    assert.equal(saved.data.snapshot.progress.total, 19);

    const initial = await anonymous.request(`/api/requirements/${initialFormToken}`);
    assert.equal(initial.data.progress.answered, 0);
    assert.equal(initial.data.progress.total, 55);
  });

  await check("follow-up review reports progress and saved comments", async () => {
    const response = await anonymous.request(`/api/requirements-review/${followUpReviewToken}`);
    assert.equal(response.status, 200);
    assert.equal(response.data.progress.answered, 1);
    assert.equal(response.data.progress.total, 19);
    const saved = response.data.responses.find(item => item.question_id === "fu05");
    assert.equal(saved.answer_id, "next_day");
    assert.match(saved.comment, /Thursday/);
  });

  await check("follow-up Markdown export includes the question, example, answer, and comment", async () => {
    const response = await anonymous.request(`/api/requirements-review/${followUpReviewToken}?format=markdown`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/markdown/);
    assert.match(response.headers.get("content-disposition") || "", /dialoggg-follow-up-responses\.md/);
    assert.match(response.text, /When one Task must start after another Task finishes/);
    assert.match(response.text, /\*\*Example:\*\*/);
    assert.match(response.text, /Start on Thursday/);
    assert.match(response.text, /Thursday is easier/);
  });

  await check("editing a completed follow-up workshop automatically returns it to in progress", async () => {
    const completed = await anonymous.request(`/api/requirements/${followUpFormToken}`, {
      method: "PUT",
      body: { status: "completed" },
    });
    assert.equal(completed.status, 200);
    assert.equal(completed.data.state.status, "completed");

    const edited = await anonymous.request(`/api/requirements/${followUpFormToken}`, {
      method: "PUT",
      body: { questionId: "fu05", answerId: "same_day", comment: "Updated choice" },
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.snapshot.state.status, "in_progress");
  });

  await check("fresh databases exclude retired feature tables", async () => {
    const testDb = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try {
      const retired = ["announcement", "project_photo", "storage_folder", "storage_file", "discussion_thread", "discussion_comment"];
      const rows = testDb.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name IN (${retired.map(() => "?").join(",")})
      `).all(...retired);
      assert.deepEqual(rows, []);
    } finally {
      testDb.close();
    }
  });

  await check("signed-out protected page redirects to login", async () => {
    const response = await anonymous.request("/projects");
    assert.equal(response.status, 307);
    assert.ok(response.headers.get("location")?.endsWith("/login"));
  });

  await check("signed-out API request is rejected", async () => {
    const response = await anonymous.request("/api/me");
    assert.equal(response.status, 401);
  });

  await check("registration rejects missing fields", async () => {
    const response = await anonymous.request("/api/auth/register", { method: "POST", body: {} });
    assert.equal(response.status, 400);
  });

  await check("registration rejects a short password", async () => {
    const response = await anonymous.request("/api/auth/register", {
      method: "POST",
      body: { company_name: "Invalid Company", email: `short-${suffix}@example.test`, password: "123" },
    });
    assert.equal(response.status, 400);
  });

  await check("first company registration creates an admin session", async () => {
    const response = await adminA.request("/api/auth/register", {
      method: "POST",
      body: { company_name: "Scenario Company A", full_name: "Admin A", email: adminAEmail, password: passwordA },
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    companyAId = response.data.companyId;
    adminAId = response.data.userId;
    assert.ok(companyAId && adminAId);
  });

  await check("registered user is the company admin", async () => {
    const response = await adminA.request("/api/me");
    assert.equal(response.status, 200);
    assert.equal(response.data.user.id, adminAId);
    assert.equal(response.data.user.company_id, companyAId);
    assert.equal(response.data.user.user_type, "admin");
  });

  await check("duplicate email is rejected case-insensitively", async () => {
    const response = await anonymous.request("/api/auth/register", {
      method: "POST",
      body: { company_name: "Duplicate", email: adminAEmail.toUpperCase(), password: passwordA },
    });
    assert.equal(response.status, 409);
  });

  await check("invalid login is rejected", async () => {
    const response = await anonymous.request("/api/auth/login", {
      method: "POST",
      body: { email: adminAEmail, password: "wrong-password" },
    });
    assert.equal(response.status, 401);
  });

  await check("second company registration creates an isolated tenant", async () => {
    const response = await adminB.request("/api/auth/register", {
      method: "POST",
      body: { company_name: "Scenario Company B", full_name: "Admin B", email: adminBEmail, password: passwordB },
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    companyBId = response.data.companyId;
    adminBId = response.data.userId;
    assert.notEqual(companyAId, companyBId);
    assert.ok(adminBId);
  });

  await check("test Platform Administrator identity is distinct from company roles", async () => {
    const response = await platform.request("/api/auth/register", {
      method: "POST",
      body: { company_name: "Scenario Platform Bootstrap", full_name: "Platform Administrator", email: platformEmail, password: platformPassword },
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    platformUserId = response.data.userId;
    const testDb = new Database(path.join(dataDirectory, "dialoggg.db"));
    try {
      testDb.prepare("UPDATE user SET user_type = 'super_admin', company_id = NULL WHERE id = ?").run(platformUserId);
    } finally {
      testDb.close();
    }
    const me = await platform.request("/api/me");
    assert.equal(me.status, 200);
    assert.equal(me.data.user.user_type, "super_admin");
    assert.equal(me.data.user.company_id, null);
  });

  await check("Platform Administrator entry routes to Companies", async () => {
    const root = await platform.request("/");
    assert.equal(root.status, 307);
    assert.ok(root.headers.get("location")?.endsWith("/platform/companies"));
    const login = await platform.request("/login");
    assert.equal(login.status, 307);
    assert.ok(login.headers.get("location")?.endsWith("/platform/companies"));
  });

  await check("signed-out Company Administration routes redirect to Login", async () => {
    for (const route of ["/platform/companies", "/platform/companies/new", "/platform/companies/sport-court-east-pa"]) {
      const response = await anonymous.request(route);
      assert.equal(response.status, 307, route);
      assert.ok(response.headers.get("location")?.endsWith("/login"), route);
    }
  });

  await check("tenant Admin cannot access Platform Administration data", async () => {
    const response = await adminA.request("/platform/companies");
    assert.equal(response.status, 200);
    assert.match(response.text, /Platform Administration is restricted/);
    assert.doesNotMatch(response.text, /Sport Court of East PA|Northline Courts/);
  });

  await check("Platform Administrator opens all Company Administration routes", async () => {
    const expectations = [
      ["/platform/companies", /Platform companies/],
      ["/platform/companies/new", /Review company setup/],
      ["/platform/companies/sport-court-east-pa", /Tenant privacy boundary/],
    ];
    for (const [route, pattern] of expectations) {
      const response = await platform.request(route);
      assert.equal(response.status, 200, route);
      assert.match(response.text, pattern);
      assert.match(response.text, /UI preview/);
    }
  });

  await check("unknown company detail returns not found for Platform Administrator", async () => {
    const response = await platform.request("/platform/companies/not-a-company");
    assert.equal(response.status, 404);
  });

  await check("signed-out User management routes redirect to Login", async () => {
    for (const route of ["/users", "/users/new", "/users/jamie-morgan", "/users/jamie-morgan/projects"]) {
      const response = await anonymous.request(route);
      assert.equal(response.status, 307, route);
      assert.ok(response.headers.get("location")?.endsWith("/login"), route);
    }
  });

  await check("Admin opens every User management UI route", async () => {
    const expectations = [
      ["/users", /Company User directory/],
      ["/users/new", /Review invitation/],
      ["/users/jamie-morgan", /Company membership/],
      ["/users/jamie-morgan/projects", /Assignment impact/],
    ];
    for (const [route, pattern] of expectations) {
      const response = await adminA.request(route);
      assert.equal(response.status, 200, route);
      assert.match(response.text, pattern);
      assert.match(response.text, /UI preview/);
    }
  });

  await check("unknown User detail returns not found for Admin", async () => {
    const response = await adminA.request("/users/not-a-user");
    assert.equal(response.status, 404);
  });

  await check("signed-out Resource UI routes redirect to Login", async () => {
    for (const route of ["/resources", "/resources/new", "/resources/jamie-morgan"]) {
      const response = await anonymous.request(route);
      assert.equal(response.status, 307, route);
      assert.ok(response.headers.get("location")?.endsWith("/login"), route);
    }
  });

  await check("Admin opens every Resource UI route", async () => {
    for (const [route, pattern] of [["/resources", /Company Resource directory/], ["/resources/new", /Optional User link/], ["/resources/jamie-morgan", /Task and Event schedule/]]) {
      const response = await adminA.request(route);
      assert.equal(response.status, 200, route);
      assert.match(response.text, pattern);
      assert.match(response.text, /UI preview/);
    }
  });

  await check("unknown Resource detail returns not found for Admin", async () => {
    const response = await adminA.request("/resources/not-a-resource");
    assert.equal(response.status, 404);
  });

  await check("signed-in root redirects to projects", async () => {
    const response = await adminA.request("/");
    assert.equal(response.status, 307);
    assert.ok(response.headers.get("location")?.endsWith("/projects"));
  });

  await check("signed-in login page redirects to projects", async () => {
    const response = await adminA.request("/login");
    assert.equal(response.status, 307);
    assert.ok(response.headers.get("location")?.endsWith("/projects"));
  });

  await check("retired application routes are unavailable", async () => {
    const [discussion, storage] = await Promise.all([
      adminA.request("/discussion"),
      adminA.request("/storage"),
    ]);
    assert.equal(discussion.status, 404);
    assert.equal(storage.status, 404);
  });

  await check("signed-out Project Types route redirects to login", async () => {
    const response = await anonymous.request("/settings/project-types");
    assert.equal(response.status, 307);
    assert.ok(response.headers.get("location")?.endsWith("/login"));
  });

  await check("Settings route redirects admins to Project Types", async () => {
    const response = await adminA.request("/settings");
    assert.equal(response.status, 307);
    assert.ok(response.headers.get("location")?.endsWith("/settings/project-types"));
  });

  await check("admin can open the Project Types UI prototype", async () => {
    const response = await adminA.request("/settings/project-types");
    assert.equal(response.status, 200);
    assert.match(response.text, /Project Types/);
    assert.match(response.text, /Add Project Type/);
    assert.match(response.text, /Acrylic/);
    assert.match(response.text, /Hardwood/);
    assert.match(response.text, /Modular/);
    assert.match(response.text, /UI preview/);
  });

  await check("signed-out Project Templates routes redirect to login", async () => {
    for (const route of ["/templates", "/templates/new", "/templates/backyard-court", "/templates/backyard-court/use"]) {
      const response = await anonymous.request(route);
      assert.equal(response.status, 307, route);
      assert.ok(response.headers.get("location")?.endsWith("/login"), route);
    }
  });

  await check("admin can open every Project Templates UI route", async () => {
    const expectations = [
      ["/templates", /Template Library/],
      ["/templates/new", /Save Project as Template/],
      ["/templates/backyard-court", /Project Plan preview/],
      ["/templates/backyard-court/use", /Start Project from Template/],
    ];
    for (const [route, pattern] of expectations) {
      const response = await adminA.request(route);
      assert.equal(response.status, 200, route);
      assert.match(response.text, pattern);
      assert.match(response.text, /UI preview/);
    }
  });

  await check("unknown Project Template returns not found for an admin", async () => {
    const response = await adminA.request("/templates/not-a-template");
    assert.equal(response.status, 404);
  });

  await check("help content no longer advertises in-app storage", async () => {
    const response = await adminA.request("/help");
    assert.equal(response.status, 200);
    assert.doesNotMatch(response.text, /document storage|shared storage/i);
  });

  await check("project creation validates required fields", async () => {
    const response = await adminA.request("/api/projects", { method: "POST", body: { name: "Missing Date" } });
    assert.equal(response.status, 400);
  });

  await check("company A admin creates a project", async () => {
    const response = await adminA.request("/api/projects", {
      method: "POST",
      body: {
        name: "Scenario Project A",
        client_name: "Client A",
        client_email: "client-a@example.test",
        start_date: "2026-01-01",
        end_date: "2026-02-01",
        note: "Automated isolated scenario",
      },
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    projectAId = response.data.id;
    assert.ok(projectAId);
  });

  await check("company B admin creates its own project", async () => {
    const response = await adminB.request("/api/projects", {
      method: "POST",
      body: { name: "Scenario Project B", start_date: "2026-03-01" },
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    projectBId = response.data.id;
    assert.ok(projectBId);
  });

  await check("project lists are isolated by company", async () => {
    const [responseA, responseB] = await Promise.all([
      adminA.request("/api/projects"),
      adminB.request("/api/projects"),
    ]);
    assert.equal(responseA.status, 200);
    assert.equal(responseB.status, 200);
    assert.ok(responseA.data.projects.some(project => project.id === projectAId));
    assert.ok(!responseA.data.projects.some(project => project.id === projectBId));
    assert.ok(responseB.data.projects.some(project => project.id === projectBId));
    assert.ok(!responseB.data.projects.some(project => project.id === projectAId));
  });

  await check("direct cross-company project read is hidden", async () => {
    const response = await adminB.request(`/api/projects/${projectAId}`);
    assert.equal(response.status, 404);
  });

  await check("authenticated project page renders", async () => {
    const response = await adminA.request(`/projects/${projectAId}`);
    assert.equal(response.status, 200);
    assert.match(response.text, /Scenario Project A/);
    assert.match(response.text, /Project Calendar/);
    assert.match(response.text, /Project Resources/);
    assert.doesNotMatch(response.text, /gallery|common files|private files|announcement/i);
  });

  await check("admin creates a viewer", async () => {
    const response = await adminA.request("/api/users", {
      method: "POST",
      body: { email: viewerAEmail, full_name: "Viewer A", password: viewerPassword, role: "viewer" },
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    viewerAId = response.data.id;
    assert.ok(viewerAId);
  });

  await check("viewer can log in and read company projects", async () => {
    const login = await viewerA.request("/api/auth/login", {
      method: "POST",
      body: { email: viewerAEmail, password: viewerPassword },
    });
    assert.equal(login.status, 200);
    const projects = await viewerA.request("/api/projects");
    assert.equal(projects.status, 200);
    assert.ok(projects.data.projects.some(project => project.id === projectAId));
  });

  await check("Employee cannot view Project Type management data", async () => {
    const response = await viewerA.request("/settings/project-types");
    assert.equal(response.status, 200);
    assert.match(response.text, /Project Types are restricted/);
    assert.doesNotMatch(response.text, /Acrylic|Hardwood|Modular/);
  });

  await check("Employee cannot view Project Template management data", async () => {
    for (const route of ["/templates", "/templates/new", "/templates/backyard-court", "/templates/backyard-court/use"]) {
      const response = await viewerA.request(route);
      assert.equal(response.status, 200, route);
      assert.match(response.text, /Project Templates are restricted/);
      assert.doesNotMatch(response.text, /Miller Residence|Westfield Recreation Center|Hillside Tennis Club/);
    }
  });

  await check("Employee receives User management restriction without directory data", async () => {
    for (const route of ["/users", "/users/new", "/users/jamie-morgan", "/users/jamie-morgan/projects"]) {
      const response = await viewerA.request(route);
      assert.equal(response.status, 200, route);
      assert.match(response.text, /restricted/i, route);
      assert.doesNotMatch(response.text, /Scott Grote|Alex Rivera/, route);
    }
  });

  await check("Employee receives read-only Resources and cannot add one", async () => {
    for (const route of ["/resources", "/resources/jamie-morgan"]) {
      const response = await viewerA.request(route);
      assert.equal(response.status, 200, route);
      assert.match(response.text, /Employee read-only/);
      assert.doesNotMatch(response.text, /Edit Resource|Deactivate Resource|\+ Add Resource/);
    }
    const create = await viewerA.request("/resources/new");
    assert.equal(create.status, 200);
    assert.match(create.text, /Resource management is restricted/);
    assert.doesNotMatch(create.text, /Optional User link/);
  });

  await check("viewer cannot create projects", async () => {
    const response = await viewerA.request("/api/projects", {
      method: "POST",
      body: { name: "Forbidden Project", start_date: "2026-01-01" },
    });
    assert.equal(response.status, 403);
  });

  await check("viewer cannot list user administration data", async () => {
    const response = await viewerA.request("/api/users");
    assert.equal(response.status, 403);
  });

  await check("admin user list contains the viewer", async () => {
    const response = await adminA.request("/api/users");
    assert.equal(response.status, 200);
    assert.ok(response.data.users.some(user => user.id === viewerAId && user.user_type === "viewer"));
  });

  await check("signed-in Employee displays the approved role name", async () => {
    const response = await viewerA.request("/account");
    assert.equal(response.status, 200);
    assert.match(response.text, /Employee \(Internal\)/);
    assert.doesNotMatch(response.text, />\s*Viewer\s*</i);
  });

  await check("admin cannot remove their own admin access", async () => {
    const response = await adminA.request(`/api/users/${adminAId}`, {
      method: "PUT",
      body: { role: "viewer" },
    });
    assert.equal(response.status, 400);
  });

  await check("admin creates a categorized resource", async () => {
    const response = await adminA.request("/api/resources", {
      method: "POST",
      body: { name: "Scenario Electrician", category_name: "Scenario Trade", email: "trade-a@example.test" },
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    resourceAId = response.data.id;
    const list = await adminA.request("/api/resources");
    assert.equal(list.status, 200);
    const resource = list.data.resources.find(item => item.id === resourceAId);
    assert.equal(resource.category, "Scenario Trade");
    categoryAId = resource.category_id;
    assert.ok(categoryAId);
  });

  await check("company B creates its own resource", async () => {
    const response = await adminB.request("/api/resources", {
      method: "POST",
      body: { name: "Scenario Plumber", category_name: "Scenario Supplier" },
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    resourceBId = response.data.id;
    assert.ok(resourceBId);
  });

  await check("resource lists are isolated by company", async () => {
    const [responseA, responseB] = await Promise.all([
      adminA.request("/api/resources"),
      adminB.request("/api/resources"),
    ]);
    assert.ok(responseA.data.resources.some(resource => resource.id === resourceAId));
    assert.ok(!responseA.data.resources.some(resource => resource.id === resourceBId));
    assert.ok(responseB.data.resources.some(resource => resource.id === resourceBId));
    assert.ok(!responseB.data.resources.some(resource => resource.id === resourceAId));
  });

  await check("viewer cannot create resources", async () => {
    const response = await viewerA.request("/api/resources", {
      method: "POST",
      body: { name: "Forbidden Resource" },
    });
    assert.equal(response.status, 403);
  });

  await check("task creation rejects a missing start date", async () => {
    const response = await adminA.request(`/api/projects/${projectAId}/tasks`, {
      method: "POST",
      body: { text: "Invalid Task" },
    });
    assert.equal(response.status, 400);
  });

  await check("admin creates predecessor and successor tasks", async () => {
    const predecessor = await adminA.request(`/api/projects/${projectAId}/tasks`, {
      method: "POST",
      body: { text: "Foundation", start_date: "2026-01-01", duration: 2, progress: 0 },
    });
    const successor = await adminA.request(`/api/projects/${projectAId}/tasks`, {
      method: "POST",
      body: { text: "Framing", start_date: "2026-01-01", duration: 1, progress: 0 },
    });
    assert.equal(predecessor.status, 200, JSON.stringify(predecessor.data));
    assert.equal(successor.status, 200, JSON.stringify(successor.data));
    predecessorId = predecessor.data.id;
    successorId = successor.data.id;
  });

  await check("finish-to-start link cascades the successor date", async () => {
    const link = await adminA.request(`/api/projects/${projectAId}/links`, {
      method: "POST",
      body: { source: predecessorId, target: successorId, type: "0", lag: 0 },
    });
    assert.equal(link.status, 200, JSON.stringify(link.data));
    const tasks = await adminA.request(`/api/projects/${projectAId}/tasks`);
    const successor = tasks.data.data.find(task => task.id === successorId);
    assert.equal(successor.start_date, "2026-01-03");
  });

  await check("reverse dependency cycle is rejected", async () => {
    const response = await adminA.request(`/api/projects/${projectAId}/links`, {
      method: "POST",
      body: { source: successorId, target: predecessorId, type: "0", lag: 0 },
    });
    assert.equal(response.status, 400);
    assert.equal(response.data.error, "Cycle");
  });

  await check("updating a predecessor cascades its successor", async () => {
    const update = await adminA.request(`/api/projects/${projectAId}/tasks/${predecessorId}`, {
      method: "PUT",
      body: { start_date: "2026-01-05", duration: 2 },
    });
    assert.equal(update.status, 200);
    const tasks = await adminA.request(`/api/projects/${projectAId}/tasks`);
    const successor = tasks.data.data.find(task => task.id === successorId);
    assert.equal(successor.start_date, "2026-01-07");
  });

  await check("viewer cannot create tasks", async () => {
    const response = await viewerA.request(`/api/projects/${projectAId}/tasks`, {
      method: "POST",
      body: { text: "Forbidden Task", start_date: "2026-01-01", duration: 1 },
    });
    assert.equal(response.status, 403);
  });

  await check("company B cannot read company A task plan", async () => {
    const response = await adminB.request(`/api/projects/${projectAId}/tasks`);
    oneOf(response.status, [401, 404], "cross-company task plan");
  });

  await check("admin assigns a resource to a task", async () => {
    const update = await adminA.request(`/api/projects/${projectAId}/tasks/${successorId}/resources`, {
      method: "PUT",
      body: { resource_ids: [resourceAId] },
    });
    assert.equal(update.status, 200);
    const read = await adminA.request(`/api/projects/${projectAId}/tasks/${successorId}/resources`);
    assert.equal(read.status, 200);
    assert.deepEqual(read.data.resource_ids, [resourceAId]);
  });

  await check("resource schedule detects overlapping assignments", async () => {
    const task = await adminA.request(`/api/projects/${projectAId}/tasks`, {
      method: "POST",
      body: { text: "Overlapping Work", start_date: "2026-01-06", duration: 3 },
    });
    assert.equal(task.status, 200, JSON.stringify(task.data));
    overlapId = task.data.id;
    const assignment = await adminA.request(`/api/projects/${projectAId}/tasks/${overlapId}/resources`, {
      method: "PUT",
      body: { resource_ids: [resourceAId] },
    });
    assert.equal(assignment.status, 200);
    const schedule = await adminA.request("/api/resources/schedule");
    assert.equal(schedule.status, 200);
    const conflicted = schedule.data.events.filter(event => event.extendedProps.conflict);
    assert.equal(conflicted.length, 2);
  });

  await check("event creation rejects missing required fields", async () => {
    const response = await adminA.request(`/api/projects/${projectAId}/events`, {
      method: "POST",
      body: {},
    });
    assert.equal(response.status, 400);
  });

  await check("admin creates a project event", async () => {
    const response = await adminA.request(`/api/projects/${projectAId}/events`, {
      method: "POST",
      body: {
        title: "Scenario Site Visit",
        start_date: "2026-01-08",
        end_date: "2026-01-08",
        description: "Automated scenario event",
      },
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.ok(response.data.id);
  });

  await check("project and master calendars include tasks and events", async () => {
    const [projectCalendar, masterCalendar] = await Promise.all([
      adminA.request(`/api/projects/${projectAId}/events`),
      adminA.request("/api/calendar"),
    ]);
    assert.equal(projectCalendar.status, 200);
    assert.equal(masterCalendar.status, 200);
    assert.ok(projectCalendar.data.events.some(event => event.title === "Scenario Site Visit"));
    assert.ok(projectCalendar.data.events.some(event => event.title === "Foundation"));
    assert.ok(masterCalendar.data.events.some(event => event.title.includes("Scenario Site Visit")));
  });

  await check("company B master calendar excludes company A data", async () => {
    const response = await adminB.request("/api/calendar");
    assert.equal(response.status, 200);
    assert.ok(!response.data.events.some(event => event.title.includes("Scenario Project A")));
  });

  await check("company calendar feed is generated and publicly readable", async () => {
    const response = await adminA.request("/api/calendar/feed-url");
    assert.equal(response.status, 200);
    const feedPath = new URL(response.data.url).pathname;
    const feed = await anonymous.request(feedPath);
    assert.equal(feed.status, 200);
    assert.match(feed.headers.get("content-type") || "", /text\/calendar/);
    assert.match(feed.text, /Scenario Site Visit/);
  });

  await check("project calendar feed is generated and publicly readable", async () => {
    const response = await adminA.request(`/api/projects/${projectAId}/feed-url`);
    assert.equal(response.status, 200);
    const feed = await anonymous.request(new URL(response.data.url).pathname);
    assert.equal(feed.status, 200);
    assert.match(feed.text, /Foundation/);
    assert.match(feed.text, /Scenario Site Visit/);
  });

  await check("resource calendar feed contains assigned work", async () => {
    const response = await adminA.request(`/api/resources/${resourceAId}/feed-url`);
    assert.equal(response.status, 200);
    const feed = await anonymous.request(new URL(response.data.url).pathname);
    assert.equal(feed.status, 200);
    assert.match(feed.text, /Framing/);
    assert.match(feed.text, /Overlapping Work/);
  });

  await check("unlinked viewer cannot obtain another resource's feed URL", async () => {
    const response = await viewerA.request(`/api/resources/${resourceAId}/feed-url`);
    assert.equal(response.status, 403);
  });

  await check("wrong current password cannot change password", async () => {
    const response = await adminA.request("/api/account/password", {
      method: "POST",
      body: { current_password: "wrong-password", new_password: changedPasswordA },
    });
    assert.equal(response.status, 403);
  });

  await check("password change rejects a short new password", async () => {
    const response = await adminA.request("/api/account/password", {
      method: "POST",
      body: { current_password: passwordA, new_password: "short" },
    });
    assert.equal(response.status, 400);
  });

  await check("password change invalidates the old credential for future logins", async () => {
    const change = await adminA.request("/api/account/password", {
      method: "POST",
      body: { current_password: passwordA, new_password: changedPasswordA },
    });
    assert.equal(change.status, 200);
    const oldLogin = await oldPasswordClient.request("/api/auth/login", {
      method: "POST",
      body: { email: adminAEmail, password: passwordA },
    });
    assert.equal(oldLogin.status, 401);
  });

  await check("logout clears the session and the new password logs in", async () => {
    const logout = await adminA.request("/api/auth/logout", { method: "POST" });
    assert.equal(logout.status, 200);
    const signedOut = await adminA.request("/api/me");
    assert.equal(signedOut.status, 401);
    const login = await adminA.request("/api/auth/login", {
      method: "POST",
      body: { email: adminAEmail, password: changedPasswordA },
    });
    assert.equal(login.status, 200);
  });

  await check("cross-project task link creation is rejected", async () => {
    const response = await adminB.request(`/api/projects/${projectBId}/links`, {
      method: "POST",
      body: { source: predecessorId, target: successorId, type: "0", lag: 0 },
    });
    oneOf(response.status, [401, 403, 404], "cross-project task link");
  });

  await check("task assignment rejects another company's resource", async () => {
    const response = await adminA.request(`/api/projects/${projectAId}/tasks/${successorId}/resources`, {
      method: "PUT",
      body: { resource_ids: [resourceBId] },
    });
    oneOf(response.status, [400, 403, 404], "cross-company resource assignment");
  });

  await check("cross-company task update is rejected", async () => {
    const response = await adminB.request(`/api/projects/${projectBId}/tasks/${predecessorId}`, {
      method: "PUT",
      body: { text: "Cross-tenant overwrite attempt" },
    });
    oneOf(response.status, [401, 403, 404], "cross-company task update");
  });

  await check("cross-company task resource read is rejected", async () => {
    const response = await adminB.request(`/api/projects/${projectBId}/tasks/${successorId}/resources`);
    oneOf(response.status, [401, 403, 404], "cross-company task resources");
  });

  await check("cross-company task resource mutation is rejected", async () => {
    const response = await adminB.request(`/api/projects/${projectBId}/tasks/${successorId}/resources`, {
      method: "PUT",
      body: { resource_ids: [resourceBId] },
    });
    oneOf(response.status, [401, 403, 404], "cross-company task resource mutation");
  });

  await check("cross-company project resource schedule is rejected", async () => {
    const response = await adminB.request(`/api/projects/${projectAId}/resource-schedule`);
    oneOf(response.status, [401, 403, 404], "cross-company resource schedule");
  });

  await check("resource creation rejects another company's category", async () => {
    const response = await adminB.request("/api/resources", {
      method: "POST",
      body: { name: "Cross-tenant category attempt", category_id: categoryAId },
    });
    oneOf(response.status, [400, 403, 404], "cross-company category assignment");
  });

  await check("cross-company project update cannot alter data", async () => {
    await adminB.request(`/api/projects/${projectAId}`, {
      method: "PUT",
      body: { name: "Cross-tenant project overwrite", start_date: "2027-01-01" },
    });
    const response = await adminA.request(`/api/projects/${projectAId}`);
    assert.equal(response.status, 200);
    assert.equal(response.data.project.name, "Scenario Project A");
  });

  await check("admin can delete another company user and revoke their sessions", async () => {
    const response = await adminA.request(`/api/users/${viewerAId}`, { method: "DELETE" });
    assert.equal(response.status, 200);
    const revoked = await viewerA.request("/api/me");
    assert.equal(revoked.status, 401);
  });
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  await rm(dataDirectory, { recursive: true, force: true });
}

const passed = results.filter(result => result.status === "PASS").length;
const failed = results.length - passed;
process.stdout.write(`\nRESULT  ${passed} passed, ${failed} failed, ${results.length} total\n`);
if (failed) process.exitCode = 1;
