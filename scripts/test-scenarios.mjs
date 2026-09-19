import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDecipheriv } from "node:crypto";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

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
    if ((options.method || "GET") !== "GET") {
      headers.set("Origin", this.baseUrl);
      const csrf = this.cookies.get("dialoggg_csrf");
      if (csrf) headers.set("X-CSRF-Token", csrf);
    }

    const response = await fetch(`${this.baseUrl}${urlPath}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: options.redirect || "manual",
    });

    const combinedSetCookie = response.headers.get("set-cookie");
    const rawSetCookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : combinedSetCookie
        ? [combinedSetCookie]
        : [];
    const setCookies = rawSetCookies.flatMap(value => value.split(/,(?=\s*[^;,=\s]+=)/));
    for (const setCookie of setCookies) {
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
    return { status: response.status, headers: response.headers, data, text, setCookies };
  }
}

function readEmailOutbox(dataDirectory, key, kind, recipient) {
  const database = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
  try {
    const rows = database.prepare(`
      SELECT id, payload_json FROM outbox_job WHERE kind = ? ORDER BY id DESC
    `).all(kind);
    for (const row of rows) {
      const envelope = JSON.parse(row.payload_json);
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
      const message = JSON.parse(Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final(),
      ]).toString("utf8"));
      if (message.to === recipient) return { ...row, message };
    }
    return null;
  } finally {
    database.close();
  }
}

function fragmentToken(actionUrl) {
  return new URLSearchParams(new URL(actionUrl).hash.slice(1)).get("token");
}

function bootstrapAccount(dataDirectory, { companyName, companyId: existingCompanyId = null, fullName, email, password, role = "admin", platform = false }) {
  const database = new Database(path.join(dataDirectory, "dialoggg.db"));
  database.pragma("foreign_keys = ON");
  try {
    return database.transaction(() => {
      let companyId = existingCompanyId;
      if (!platform) {
        if (!companyId) {
          const company = database.prepare(
            "INSERT INTO company (name, time_zone, status) VALUES (?, 'America/New_York', 'active')",
          ).run(companyName);
          companyId = Number(company.lastInsertRowid);
        }
      }
      const passwordHash = bcrypt.hashSync(password, 12);
      const legacy = database.prepare(`
        INSERT INTO user (company_id, email, password_hash, full_name, user_type)
        VALUES (?, ?, ?, ?, ?)
      `).run(companyId, email, passwordHash, fullName, platform ? "super_admin" : role);
      const legacyUserId = Number(legacy.lastInsertRowid);
      const [firstName, ...rest] = fullName.split(" ");
      const identity = database.prepare(`
        INSERT INTO identity (
          legacy_user_id, normalized_email, password_hash, first_name, last_name,
          status, is_platform_admin, email_verified_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP)
      `).run(legacyUserId, email.toLowerCase(), passwordHash, firstName, rest.join(" "), platform ? 1 : 0);
      const identityId = Number(identity.lastInsertRowid);
      let membershipId = null;
      if (companyId) {
        const membership = database.prepare(`
          INSERT INTO company_membership (
            identity_id, company_id, legacy_user_id, role, status, accepted_at
          ) VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
        `).run(identityId, companyId, legacyUserId, role);
        membershipId = Number(membership.lastInsertRowid);
        for (const category of ["Employee", "Subcontractor", "Supplier", "Equipment", "Other"]) {
          database.prepare("INSERT OR IGNORE INTO resource_category (company_id, name) VALUES (?, ?)").run(companyId, category);
        }
        for (const projectType of ["Residential Court", "Commercial Court", "Court Resurfacing"]) {
          database.prepare("INSERT OR IGNORE INTO project_type (company_id, name, normalized_name) VALUES (?, ?, ?)")
            .run(companyId, projectType, projectType.toLowerCase());
        }
      }
      const projectTypes = companyId
        ? database.prepare("SELECT id, name FROM project_type WHERE company_id = ? ORDER BY id").all(companyId)
        : [];
      return { companyId, legacyUserId, identityId, membershipId, projectTypes, defaultProjectTypeId: projectTypes[0]?.id ?? null };
    })();
  } finally {
    database.close();
  }
}

const dataDirectory = await mkdtemp(path.join(tmpdir(), "dialoggg-scenarios-"));
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const testEncryptionKey = Buffer.alloc(32, 7);
const initialFormToken = "scenario-initial-form-token-please-keep-private";
const initialReviewToken = "scenario-initial-review-token-please-keep-private";
const followUpFormToken = "scenario-follow-up-form-token-please-keep-private";
const followUpReviewToken = "scenario-follow-up-review-token-please-keep-private";

try {
  const migration = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/db/migrate.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      RAILWAY_VOLUME_MOUNT_PATH: dataDirectory,
    },
    encoding: "utf8",
  });
  if (migration.status !== 0) {
    throw new Error(`Test database migration failed.\n${migration.stdout}\n${migration.stderr}`);
  }

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
      APP_BASE_URL: baseUrl,
      APP_ENCRYPTION_KEY: testEncryptionKey.toString("base64"),
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
  const ownerA = new Client(baseUrl);
  const platform = new Client(baseUrl);
  const viewerA = new Client(baseUrl);
  const oldPasswordClient = new Client(baseUrl);
  const invitedClient = new Client(baseUrl);
  const provisionedOwner = new Client(baseUrl);

  const suffix = Date.now().toString(36);
  const adminAEmail = `admin-a-${suffix}@example.test`;
  const adminBEmail = `admin-b-${suffix}@example.test`;
  const ownerAEmail = `owner-a-${suffix}@example.test`;
  const platformEmail = `platform-${suffix}@example.test`;
  const viewerAEmail = `viewer-a-${suffix}@example.test`;
  const passwordA = "Scenario-A-Password-1!";
  const changedPasswordA = "Scenario-A-Password-2!";
  const passwordB = "Scenario-B-Password-1!";
  const ownerPassword = "Scenario-Owner-Password-1!";
  const platformPassword = "Scenario-Platform-Password-1!";
  const viewerPassword = "Scenario-Viewer-Password-1!";

  let companyAId;
  let companyBId;
  let adminAId;
  let adminAIdentityId;
  let adminAMembershipId;
  let adminBId;
  let adminBMembershipId;
  let ownerAMembershipId;
  let platformUserId;
  let viewerAId;
  let viewerAMembershipId;
  let projectAId;
  let projectBId;
  let lifecycleProjectId;
  let projectTypeAId;
  let projectTypeASecondaryId;
  let projectTypeBId;
  let managedProjectTypeAId;
  let projectTemplateAId;
  let instantiatedProjectId;
  let resourceAId;
  let resourceBId;
  let templateResourceId;
  let categoryAId;
  let predecessorId;
  let successorId;
  let predecessorVersion;
  let successorVersion;
  let dependencyId;
  let planVersion;
  let projectBPlanVersion;
  let overlapId;
  let provisionedCompanyId;
  let provisionedOwnerMembershipId;
  let provisionedProjectId;

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

  await check("readiness healthcheck verifies the current schema and database", async () => {
    const response = await fetch(`${baseUrl}/api/health/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ready" });
  });

  await check("security headers are returned", async () => {
    const response = await anonymous.request("/login");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
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

  await check("public registration API is disabled", async () => {
    const response = await anonymous.request("/api/auth/register", { method: "POST", body: {} });
    assert.equal(response.status, 404);
  });

  await check("public registration page is absent", async () => {
    const response = await anonymous.request("/register");
    assert.equal(response.status, 404);
  });

  await check("pre-provisioned company Admin can create a session", async () => {
    const created = bootstrapAccount(dataDirectory, {
      companyName: "Scenario Company A",
      fullName: "Admin A",
      email: adminAEmail,
      password: passwordA,
      role: "admin",
    });
    companyAId = created.companyId;
    adminAId = created.legacyUserId;
    adminAIdentityId = created.identityId;
    adminAMembershipId = created.membershipId;
    projectTypeAId = created.defaultProjectTypeId;
    projectTypeASecondaryId = created.projectTypes[1].id;
    const response = await adminA.request("/api/auth/login", {
      method: "POST",
      body: { email: adminAEmail, password: passwordA },
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.ok(adminA.cookies.has("dialoggg_csrf"), `cookies: ${[...adminA.cookies.keys()].join(",")}`);
    const sessionCookie = response.setCookies.find(value => value.startsWith("dialoggg_session="));
    assert.match(sessionCookie || "", /HttpOnly/i);
    assert.match(sessionCookie || "", /Secure/i);
    assert.match(sessionCookie || "", /SameSite=Lax/i);
    assert.ok(companyAId && adminAId);
  });

  await check("authenticated user is the company Admin", async () => {
    const response = await adminA.request("/api/me");
    assert.equal(response.status, 200);
    assert.equal(response.data.user.id, adminAId);
    assert.equal(response.data.user.company_id, companyAId);
    assert.equal(response.data.user.user_type, "admin");
  });

  await check("company Owner can create a separate authorized session", async () => {
    const created = bootstrapAccount(dataDirectory, { companyId: companyAId, fullName: "Owner A", email: ownerAEmail, password: ownerPassword, role: "owner" });
    ownerAMembershipId = created.membershipId;
    const response = await ownerA.request("/api/auth/login", { method: "POST", body: { email: ownerAEmail, password: ownerPassword } });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.ok(ownerAMembershipId);
  });

  await check("global identity email is unique case-insensitively", async () => {
    const testDb = new Database(path.join(dataDirectory, "dialoggg.db"));
    try {
      assert.throws(() => testDb.prepare(`
        INSERT INTO identity (normalized_email, password_hash, first_name, last_name)
        VALUES (?, 'hash', 'Duplicate', '')
      `).run(adminAEmail.toUpperCase()), /UNIQUE/i);
    } finally {
      testDb.close();
    }
  });

  await check("invalid login is rejected", async () => {
    const response = await anonymous.request("/api/auth/login", {
      method: "POST",
      body: { email: adminAEmail, password: "wrong-password" },
    });
    assert.equal(response.status, 401);
  });

  await check("second pre-provisioned company creates an isolated tenant", async () => {
    const created = bootstrapAccount(dataDirectory, {
      companyName: "Scenario Company B",
      fullName: "Admin B",
      email: adminBEmail,
      password: passwordB,
      role: "admin",
    });
    companyBId = created.companyId;
    adminBId = created.legacyUserId;
    adminBMembershipId = created.membershipId;
    projectTypeBId = created.defaultProjectTypeId;
    const response = await adminB.request("/api/auth/login", {
      method: "POST",
      body: { email: adminBEmail, password: passwordB },
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.notEqual(companyAId, companyBId);
    assert.ok(adminBId);
  });

  const invitedEmail = `invited-${suffix}@example.test`;
  const invitedPassword = "Invited-Password-1!";
  const invitedNewPassword = "Invited-Password-2!";
  let invitedMembershipId;
  let invitedResourceId;
  let invitationToken;

  await check("Admin cannot provision another User password", async () => {
    const response = await adminA.request("/api/users", {
      method: "POST",
      body: { firstName: "Unsafe", lastName: "Provisioning", email: `unsafe-${suffix}@example.test`, role: "employee", password: "Unsafe-Password-1!" },
    });
    assert.equal(response.status, 400);
  });

  await check("Admin invitation creates pending membership, linked Resource, and encrypted 72-hour email", async () => {
    const response = await adminA.request("/api/v1/memberships", {
      method: "POST",
      body: { firstName: "Invited", lastName: "Employee", email: invitedEmail, role: "employee", addAsResource: true },
    });
    assert.equal(response.status, 201, JSON.stringify(response.data));
    invitedMembershipId = response.data.id;
    const emailJob = readEmailOutbox(dataDirectory, testEncryptionKey, "invitation_email", invitedEmail);
    assert.ok(emailJob);
    invitationToken = fragmentToken(emailJob.message.variables.actionUrl);
    assert.ok(invitationToken?.length >= 32);
    assert.equal(emailJob.payload_json.includes(invitedEmail), false);
    assert.equal(emailJob.payload_json.includes(invitationToken), false);
    const database = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try {
      const membership = database.prepare("SELECT status FROM company_membership WHERE id = ?").get(invitedMembershipId);
      const invitation = database.prepare("SELECT token_hash, expires_at FROM invitation_token WHERE membership_id = ? AND revoked_at IS NULL").get(invitedMembershipId);
      assert.equal(membership.status, "pending");
      assert.notEqual(invitation.token_hash, invitationToken);
      const hours = (Date.parse(invitation.expires_at) - Date.now()) / 3_600_000;
      assert.ok(hours > 71.9 && hours <= 72.1, `invite lifetime ${hours}`);
      const linkedResource = database.prepare("SELECT id FROM resource WHERE linked_membership_id = ?").get(invitedMembershipId);
      assert.ok(linkedResource?.id);
      invitedResourceId = linkedResource.id;
    } finally { database.close(); }
  });

  await check("single-use invitation activates the intended membership and creates a session", async () => {
    const accepted = await invitedClient.request("/api/v1/invitations/accept", {
      method: "POST",
      body: { token: invitationToken, password: invitedPassword },
    });
    assert.equal(accepted.status, 201, JSON.stringify(accepted.data));
    assert.equal(accepted.data.data.context.membershipId, invitedMembershipId);
    const me = await invitedClient.request("/api/v1/me");
    assert.equal(me.status, 200);
    assert.equal(me.data.data.activeContext.role, "employee");
    const replay = await anonymous.request("/api/v1/invitations/accept", {
      method: "POST",
      body: { token: invitationToken, password: invitedPassword },
    });
    assert.equal(replay.status, 400);
  });

  await check("an existing global identity accepts a second-company membership without duplicate credentials", async () => {
    const created = await adminB.request("/api/v1/memberships", {
      method: "POST",
      body: { firstName: "Invited", lastName: "Employee", email: invitedEmail, role: "employee" },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const emailJob = readEmailOutbox(dataDirectory, testEncryptionKey, "invitation_email", invitedEmail);
    const token = fragmentToken(emailJob.message.variables.actionUrl);
    const secondCompanyClient = new Client(baseUrl);
    const wrongCredential = await secondCompanyClient.request("/api/v1/invitations/accept", { method: "POST", body: { token, password: "Incorrect-Password-1!" } });
    assert.equal(wrongCredential.status, 400);
    const accepted = await secondCompanyClient.request("/api/v1/invitations/accept", { method: "POST", body: { token, password: invitedPassword } });
    assert.equal(accepted.status, 201, JSON.stringify(accepted.data));
    assert.equal(accepted.data.data.context.companyId, companyBId);
    const me = await secondCompanyClient.request("/api/v1/me");
    assert.equal(me.data.data.contexts.length, 2);
    const database = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try {
      assert.equal(database.prepare("SELECT COUNT(*) AS count FROM identity WHERE normalized_email = ?").get(invitedEmail).count, 1);
    } finally { database.close(); }
  });

  await check("forgot-password responses are generic and queue an encrypted one-hour reset", async () => {
    const existing = await anonymous.request("/api/v1/auth/forgot-password", { method: "POST", body: { email: invitedEmail } });
    const missing = await anonymous.request("/api/v1/auth/forgot-password", { method: "POST", body: { email: `missing-reset-${suffix}@example.test` } });
    assert.equal(existing.status, 200);
    assert.equal(missing.status, 200);
    assert.equal(existing.data.data.message, missing.data.data.message);
    const emailJob = readEmailOutbox(dataDirectory, testEncryptionKey, "password_reset_email", invitedEmail);
    assert.ok(emailJob);
    const token = fragmentToken(emailJob.message.variables.actionUrl);
    assert.ok(token?.length >= 32);
    assert.equal(emailJob.payload_json.includes(invitedEmail), false);
    assert.equal(emailJob.payload_json.includes(token), false);
    const database = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try {
      const reset = database.prepare("SELECT expires_at FROM password_reset_token ORDER BY id DESC LIMIT 1").get();
      const hours = (Date.parse(reset.expires_at) - Date.now()) / 3_600_000;
      assert.ok(hours > 0.9 && hours <= 1.1, `reset lifetime ${hours}`);
    } finally { database.close(); }
  });

  await check("password reset is single-use, revokes sessions, and changes the credential", async () => {
    const emailJob = readEmailOutbox(dataDirectory, testEncryptionKey, "password_reset_email", invitedEmail);
    const resetToken = fragmentToken(emailJob.message.variables.actionUrl);
    const reset = await anonymous.request("/api/v1/auth/reset-password", { method: "POST", body: { token: resetToken, password: invitedNewPassword } });
    assert.equal(reset.status, 200, JSON.stringify(reset.data));
    assert.equal((await invitedClient.request("/api/v1/me")).status, 401);
    const replay = await anonymous.request("/api/v1/auth/reset-password", { method: "POST", body: { token: resetToken, password: invitedNewPassword } });
    assert.equal(replay.status, 400);
    const login = await invitedClient.request("/api/auth/login", { method: "POST", body: { email: invitedEmail, password: invitedNewPassword } });
    assert.equal(login.status, 200);
  });

  await check("expired password-reset tokens cannot change credentials", async () => {
    const requested = await anonymous.request("/api/v1/auth/forgot-password", { method: "POST", body: { email: invitedEmail } });
    assert.equal(requested.status, 200);
    const emailJob = readEmailOutbox(dataDirectory, testEncryptionKey, "password_reset_email", invitedEmail);
    const token = fragmentToken(emailJob.message.variables.actionUrl);
    const database = new Database(path.join(dataDirectory, "dialoggg.db"));
    try { database.prepare("UPDATE password_reset_token SET expires_at = datetime('now', '-1 minute') WHERE id = (SELECT id FROM password_reset_token ORDER BY id DESC LIMIT 1)").run(); }
    finally { database.close(); }
    const response = await anonymous.request("/api/v1/auth/reset-password", { method: "POST", body: { token, password: "Should-Not-Apply-1!" } });
    assert.equal(response.status, 400);
    const login = await new Client(baseUrl).request("/api/auth/login", { method: "POST", body: { email: invitedEmail, password: invitedNewPassword } });
    assert.equal(login.status, 200);
  });

  await check("expired invitations fail without activating membership", async () => {
    const email = `expired-invite-${suffix}@example.test`;
    const created = await adminA.request("/api/v1/memberships", { method: "POST", body: { firstName: "Expired", lastName: "Invite", email, role: "employee" } });
    assert.equal(created.status, 201);
    const emailJob = readEmailOutbox(dataDirectory, testEncryptionKey, "invitation_email", email);
    const token = fragmentToken(emailJob.message.variables.actionUrl);
    const database = new Database(path.join(dataDirectory, "dialoggg.db"));
    try { database.prepare("UPDATE invitation_token SET expires_at = datetime('now', '-1 minute') WHERE membership_id = ?").run(created.data.id); }
    finally { database.close(); }
    const accepted = await anonymous.request("/api/v1/invitations/accept", { method: "POST", body: { token, password: "Expired-Password-1!" } });
    assert.equal(accepted.status, 400);
  });

  await check("reissuing an invitation invalidates the prior bearer", async () => {
    const email = `reissued-invite-${suffix}@example.test`;
    const created = await adminA.request("/api/v1/memberships", { method: "POST", body: { firstName: "Reissued", lastName: "Invite", email, role: "employee" } });
    assert.equal(created.status, 201);
    const firstJob = readEmailOutbox(dataDirectory, testEncryptionKey, "invitation_email", email);
    const oldToken = fragmentToken(firstJob.message.variables.actionUrl);
    const resent = await adminA.request(`/api/v1/memberships/${created.data.id}/invitations`, { method: "POST", body: {} });
    assert.equal(resent.status, 200);
    const secondJob = readEmailOutbox(dataDirectory, testEncryptionKey, "invitation_email", email);
    const newToken = fragmentToken(secondJob.message.variables.actionUrl);
    assert.notEqual(newToken, oldToken);
    assert.equal((await anonymous.request("/api/v1/invitations/accept", { method: "POST", body: { token: oldToken, password: "Reissued-Password-1!" } })).status, 400);
    const reissuedClient = new Client(baseUrl);
    assert.equal((await reissuedClient.request("/api/v1/invitations/accept", { method: "POST", body: { token: newToken, password: "Reissued-Password-1!" } })).status, 201);
  });

  await check("one identity exposes only its authorized company contexts", async () => {
    const database = new Database(path.join(dataDirectory, "dialoggg.db"));
    try {
      database.prepare(`
        INSERT INTO company_membership (identity_id, company_id, role, status, accepted_at)
        VALUES (?, ?, 'external', 'active', CURRENT_TIMESTAMP)
      `).run(adminAIdentityId, companyBId);
    } finally {
      database.close();
    }
    const response = await adminA.request("/api/v1/me");
    assert.equal(response.status, 200, JSON.stringify(response.data));
    const contexts = response.data.data.contexts;
    assert.equal(contexts.length, 2);
    assert.ok(contexts.some(context => context.companyId === companyAId && context.role === "admin"));
    assert.ok(contexts.some(context => context.companyId === companyBId && context.role === "external"));
  });

  let adminACompanyBMembershipId;
  await check("company context switching rotates the session and effective Role", async () => {
    const before = await adminA.request("/api/v1/me");
    adminACompanyBMembershipId = before.data.data.contexts.find(context => context.companyId === companyBId).membershipId;
    const switched = await adminA.request("/api/v1/me/active-company", {
      method: "PUT",
      body: { type: "company", membershipId: adminACompanyBMembershipId },
    });
    assert.equal(switched.status, 200, JSON.stringify(switched.data));
    const after = await adminA.request("/api/v1/me");
    assert.equal(after.data.data.activeContext.companyId, companyBId);
    assert.equal(after.data.data.activeContext.role, "external");

    const switchedBack = await adminA.request("/api/v1/me/active-company", {
      method: "PUT",
      body: { type: "company", membershipId: adminAMembershipId },
    });
    assert.equal(switchedBack.status, 200, JSON.stringify(switchedBack.data));
  });

  await check("forged company context and missing CSRF are rejected", async () => {
    const forged = await adminA.request("/api/v1/me/active-company", {
      method: "PUT",
      body: { type: "company", membershipId: adminBMembershipId },
    });
    assert.equal(forged.status, 404);

    const session = adminA.cookies.get("dialoggg_session");
    const unprotected = await fetch(`${baseUrl}/api/v1/me/active-company`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        cookie: `dialoggg_session=${session}`,
        origin: baseUrl,
      },
      body: JSON.stringify({ type: "company", membershipId: adminACompanyBMembershipId }),
    });
    assert.equal(unprotected.status, 403);
  });

  await check("login failures remain generic and rate limited", async () => {
    const attacker = new Client(baseUrl);
    const unknownEmail = `unknown-${suffix}@example.test`;
    const wrongKnown = await attacker.request("/api/auth/login", {
      method: "POST",
      body: { email: adminAEmail, password: "wrong-password-again" },
    });
    const unknown = await attacker.request("/api/auth/login", {
      method: "POST",
      body: { email: unknownEmail, password: "wrong-password" },
    });
    assert.equal(wrongKnown.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrongKnown.data.error, unknown.data.error);
    for (let attempt = 0; attempt < 4; attempt++) {
      await attacker.request("/api/auth/login", {
        method: "POST",
        body: { email: unknownEmail, password: "wrong-password" },
      });
    }
    const limited = await attacker.request("/api/auth/login", {
      method: "POST",
      body: { email: unknownEmail, password: "wrong-password" },
    });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
  });

  await check("test Platform Administrator identity is distinct from company roles", async () => {
    const created = bootstrapAccount(dataDirectory, {
      fullName: "Platform Administrator",
      email: platformEmail,
      password: platformPassword,
      platform: true,
    });
    platformUserId = created.legacyUserId;
    const response = await platform.request("/api/auth/login", {
      method: "POST",
      body: { email: platformEmail, password: platformPassword },
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    const me = await platform.request("/api/me");
    assert.equal(me.status, 200);
    assert.equal(me.data.user.user_type, "super_admin");
    assert.equal(me.data.user.company_id, null);
  });

  await check("tenant Admin cannot call Platform Company Administration APIs", async () => {
    const response = await adminA.request("/api/v1/platform/companies");
    assert.equal(response.status, 403);
    const create = await adminA.request("/api/v1/platform/companies", {
      method: "POST",
      body: { name: "Forbidden Company", timeZone: "America/New_York", ownerFirstName: "No", ownerLastName: "Access", ownerEmail: `forbidden-${suffix}@example.test` },
    });
    assert.equal(create.status, 403);
  });

  await check("company provisioning rejects an invalid IANA time zone", async () => {
    const response = await platform.request("/api/v1/platform/companies", {
      method: "POST",
      body: { name: "Invalid Zone Company", timeZone: "Mars/Olympus", ownerFirstName: "Invalid", ownerLastName: "Zone", ownerEmail: `invalid-zone-${suffix}@example.test` },
    });
    assert.equal(response.status, 400);
    assert.equal(response.data.error.code, "VALIDATION_FAILED");
    assert.ok(response.data.error.fields.timeZone);
  });

  const provisionedOwnerEmail = `first-owner-${suffix}@example.test`;
  const provisionedOwnerPassword = "First-Owner-Password-1!";
  await check("Platform Administrator creates a company, fixed categories, and encrypted first-Owner invitation", async () => {
    const response = await platform.request("/api/v1/platform/companies", {
      method: "POST",
      body: {
        name: "Provisioned Scenario Company",
        timeZone: "America/Chicago",
        ownerFirstName: "First",
        ownerLastName: "Owner",
        ownerEmail: provisionedOwnerEmail,
      },
    });
    assert.equal(response.status, 201, JSON.stringify(response.data));
    provisionedCompanyId = response.data.data.company.id;
    provisionedOwnerMembershipId = response.data.data.firstOwnerMembershipId;
    assert.equal(response.data.data.company.ownerStatus, "pending");
    const emailJob = readEmailOutbox(dataDirectory, testEncryptionKey, "invitation_email", provisionedOwnerEmail);
    assert.ok(emailJob);
    assert.equal(emailJob.payload_json.includes(provisionedOwnerEmail), false);
    const database = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try {
      assert.equal(database.prepare("SELECT COUNT(*) AS count FROM resource_category WHERE company_id = ?").get(provisionedCompanyId).count, 5);
      assert.deepEqual(database.prepare("SELECT role, status FROM company_membership WHERE id = ?").get(provisionedOwnerMembershipId), { role: "owner", status: "pending" });
    } finally { database.close(); }
  });

  await check("case-insensitive duplicate Company Name is rejected", async () => {
    const response = await platform.request("/api/v1/platform/companies", {
      method: "POST",
      body: {
        name: "  provisioned scenario company  ",
        timeZone: "America/Chicago",
        ownerFirstName: "Duplicate",
        ownerLastName: "Owner",
        ownerEmail: `duplicate-owner-${suffix}@example.test`,
      },
    });
    assert.equal(response.status, 409);
    assert.equal(response.data.error.code, "COMPANY_NAME_EXISTS");
  });

  await check("first Owner accepts the 72-hour invitation and enters the new company", async () => {
    const emailJob = readEmailOutbox(dataDirectory, testEncryptionKey, "invitation_email", provisionedOwnerEmail);
    const token = fragmentToken(emailJob.message.variables.actionUrl);
    const accepted = await provisionedOwner.request("/api/v1/invitations/accept", {
      method: "POST",
      body: { token, password: provisionedOwnerPassword },
    });
    assert.equal(accepted.status, 201, JSON.stringify(accepted.data));
    const me = await provisionedOwner.request("/api/v1/me");
    assert.equal(me.status, 200);
    assert.equal(me.data.data.activeContext.companyId, provisionedCompanyId);
    assert.equal(me.data.data.activeContext.role, "owner");
  });

  await check("suspension revokes company sessions, pauses Google, and preserves business and Microsoft records", async () => {
    const database = new Database(path.join(dataDirectory, "dialoggg.db"));
    try {
      const identity = database.prepare("SELECT identity_id FROM company_membership WHERE id = ?").get(provisionedOwnerMembershipId);
      const legacy = database.prepare("SELECT legacy_user_id FROM company_membership WHERE id = ?").get(provisionedOwnerMembershipId);
      const preservationTypeId = Number(database.prepare(`
        INSERT INTO project_type (company_id, name, normalized_name) VALUES (?, 'Preservation', 'preservation')
      `).run(provisionedCompanyId).lastInsertRowid);
      provisionedProjectId = Number(database.prepare(`
        INSERT INTO project (company_id, project_type_id, name, start_date, created_by) VALUES (?, ?, 'Private Preservation Project', '2026-09-17', ?)
      `).run(provisionedCompanyId, preservationTypeId, legacy.legacy_user_id).lastInsertRowid);
      database.prepare(`
        INSERT INTO google_connection (identity_id, token_ciphertext, token_key_version, state)
        VALUES (?, 'encrypted-google-token', 1, 'healthy')
      `).run(identity.identity_id);
      database.prepare(`
        INSERT INTO microsoft_connection (
          company_id, tenant_id_ciphertext, drive_id_ciphertext, root_item_id_ciphertext,
          token_ciphertext, token_key_version, service_type, state
        ) VALUES (?, 'tenant', 'drive', 'root', 'token', 1, 'sharepoint', 'healthy')
      `).run(provisionedCompanyId);
      database.prepare(`
        INSERT INTO project_folder_mapping (project_id, kind, drive_id_ciphertext, item_id_ciphertext, display_name)
        VALUES (?, 'common', 'drive', 'item', 'Private Preservation Folder')
      `).run(provisionedProjectId);
    } finally { database.close(); }

    const response = await platform.request(`/api/v1/platform/companies/${provisionedCompanyId}/suspend`, { method: "POST", body: {} });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.data.status, "suspended");
    assert.ok(response.data.data.revokedSessions >= 1);
    assert.equal((await provisionedOwner.request("/api/v1/me")).status, 401);

    const detail = await platform.request(`/api/v1/platform/companies/${provisionedCompanyId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.data.company.googleStatus, "Paused");
    assert.equal(JSON.stringify(detail.data).includes("Private Preservation Project"), false);
    const verify = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try {
      assert.equal(verify.prepare("SELECT status FROM company WHERE id = ?").get(provisionedCompanyId).status, "suspended");
      assert.equal(verify.prepare("SELECT state FROM company_google_sync_state WHERE company_id = ?").get(provisionedCompanyId).state, "paused");
      assert.equal(verify.prepare("SELECT COUNT(*) AS count FROM project WHERE id = ?").get(provisionedProjectId).count, 1);
      assert.equal(verify.prepare("SELECT COUNT(*) AS count FROM project_folder_mapping WHERE project_id = ?").get(provisionedProjectId).count, 1);
      assert.equal(verify.prepare("SELECT COUNT(*) AS count FROM microsoft_connection WHERE company_id = ?").get(provisionedCompanyId).count, 1);
    } finally { verify.close(); }
  });

  await check("restoration re-enables login while Google remains paused for review", async () => {
    const response = await platform.request(`/api/v1/platform/companies/${provisionedCompanyId}/restore`, { method: "POST", body: {} });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.data.status, "active");
    assert.equal(response.data.data.googleSync, "paused");
    const login = await provisionedOwner.request("/api/auth/login", {
      method: "POST",
      body: { email: provisionedOwnerEmail, password: provisionedOwnerPassword },
    });
    assert.equal(login.status, 200);
    const verify = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try {
      assert.deepEqual(verify.prepare("SELECT state, pause_reason FROM company_google_sync_state WHERE company_id = ?").get(provisionedCompanyId), { state: "paused", pause_reason: "restored_review_required" });
      assert.equal(verify.prepare("SELECT COUNT(*) AS count FROM audit_event WHERE company_id = ? AND action IN ('company.create','company.suspend','company.restore')").get(provisionedCompanyId).count, 3);
    } finally { verify.close(); }
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
    for (const route of ["/platform/companies", "/platform/companies/new", `/platform/companies/${companyAId}`]) {
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
      [`/platform/companies/${companyAId}`, /Tenant privacy boundary/],
    ];
    for (const [route, pattern] of expectations) {
      const response = await platform.request(route);
      assert.equal(response.status, 200, route);
      assert.match(response.text, pattern);
      assert.doesNotMatch(response.text, /UI preview/);
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
      ["/users", /Manage the company directory/],
      ["/users/new", /Review invitation/],
      [`/users/${invitedMembershipId}`, /Company membership/],
      [`/users/${invitedMembershipId}/projects`, /Employee assignment semantics/],
    ];
    for (const [route, pattern] of expectations) {
      const response = await adminA.request(route);
      assert.equal(response.status, 200, route);
      assert.match(response.text, pattern);
      assert.doesNotMatch(response.text, /UI preview/);
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
    for (const [route, pattern] of [["/resources", /Company Resource directory/], ["/resources/new", /Optional User link/], [`/resources/${invitedResourceId}`, /Task and Event schedule/]]) {
      const response = await adminA.request(route);
      assert.equal(response.status, 200, route);
      assert.match(response.text, pattern);
      assert.doesNotMatch(response.text, /UI preview/);
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

  await check("admin opens live company Project Types", async () => {
    const response = await adminA.request("/settings/project-types");
    assert.equal(response.status, 200);
    assert.match(response.text, /Project Types/);
    assert.match(response.text, /Add Project Type/);
    assert.match(response.text, /Residential Court/);
    assert.match(response.text, /Commercial Court/);
    assert.match(response.text, /Court Resurfacing/);
    assert.match(response.text, /Live company setting/);
    assert.doesNotMatch(response.text, /UI preview/);
  });

  await check("Project Type lists are tenant-isolated", async () => {
    const [responseA, responseB] = await Promise.all([
      adminA.request("/api/v1/project-types"),
      adminB.request("/api/v1/project-types"),
    ]);
    assert.equal(responseA.status, 200);
    assert.equal(responseB.status, 200);
    assert.ok(responseA.data.data.projectTypes.every(projectType => projectType.id !== projectTypeBId));
    assert.ok(responseB.data.data.projectTypes.every(projectType => projectType.id !== projectTypeAId));
  });

  await check("admin creates a validated Project Type and duplicate names are rejected", async () => {
    const created = await adminA.request("/api/v1/project-types", { method: "POST", body: { name: "  Post-Tension   Concrete  " } });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.data.projectType.name, "Post-Tension Concrete");
    managedProjectTypeAId = created.data.data.projectType.id;
    const duplicate = await adminA.request("/api/v1/project-types", { method: "POST", body: { name: "post-tension concrete" } });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.data.error.code, "PROJECT_TYPE_NAME_EXISTS");
  });

  await check("another company cannot read or rename a Project Type", async () => {
    const read = await adminB.request(`/api/v1/project-types/${managedProjectTypeAId}`);
    assert.equal(read.status, 404);
    const rename = await adminB.request(`/api/v1/project-types/${managedProjectTypeAId}`, { method: "PUT", body: { name: "Tenant Escape" } });
    assert.equal(rename.status, 404);
  });

  await check("signed-out Project Templates routes redirect to login", async () => {
    for (const route of ["/templates", "/templates/new", "/templates/999999", "/templates/999999/use"]) {
      const response = await anonymous.request(route);
      assert.equal(response.status, 307, route);
      assert.ok(response.headers.get("location")?.endsWith("/login"), route);
    }
  });

  await check("admin opens the live Template Library and save route", async () => {
    const expectations = [
      ["/templates", /Template Library/],
      ["/templates/new", /Save Project as Template/],
    ];
    for (const [route, pattern] of expectations) {
      const response = await adminA.request(route);
      assert.equal(response.status, 200, route);
      assert.match(response.text, pattern);
      assert.doesNotMatch(response.text, /UI preview/);
    }
  });

  await check("unknown Project Template returns not found for an admin", async () => {
    const response = await adminA.request("/templates/999999");
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

  await check("project creation rejects another company's Project Type", async () => {
    const response = await adminA.request("/api/projects", { method: "POST", body: { name: "Cross-type Project", start_date: "2026-01-01", project_type_id: projectTypeBId } });
    assert.equal(response.status, 400);
  });

  await check("company A admin creates a project", async () => {
    const response = await adminA.request("/api/projects", {
      method: "POST",
      body: {
        name: "Scenario Project A",
        project_type_id: managedProjectTypeAId,
        client_name: "Client A",
        client_email: "client-a@example.test",
        address: "100 Scenario Way",
        city: "Reading",
        state: "PA",
        zip: "19601",
        phone: "717-555-0100",
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
      body: { name: "Scenario Project B", project_type_id: projectTypeBId, client_name: "Client B", client_email: "client-b@example.test", address: "200 Scenario Way", city: "Lancaster", state: "PA", zip: "17601", phone: "717-555-0200", start_date: "2026-03-01" },
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    projectBId = response.data.id;
    assert.ok(projectBId);
  });

  await check("Project v1 create enforces CSRF and every required field", async () => {
    const cookie = [...adminA.cookies].map(([key, value]) => `${key}=${value}`).join("; ");
    const missingCsrf = await fetch(`${baseUrl}/api/v1/projects`, { method: "POST", headers: { "content-type": "application/json", cookie, origin: baseUrl }, body: "{}" });
    assert.equal(missingCsrf.status, 403);
    const incomplete = await adminA.request("/api/v1/projects", { method: "POST", body: { name: "Incomplete" } });
    assert.equal(incomplete.status, 400);
    assert.equal(incomplete.data.error.code, "VALIDATION_FAILED");
    assert.ok(incomplete.data.error.fields.clientName);
    assert.ok(incomplete.data.error.fields.startDate);
  });

  await check("Project v1 create persists tenant-safe assignments", async () => {
    const crossTenant = await adminA.request("/api/v1/projects", { method: "POST", body: { name: "Cross Assignment", projectTypeId: projectTypeAId, clientName: "Cross", clientEmail: "cross@example.test", address: "1 Cross Way", city: "Reading", state: "PA", zip: "19601", phone: "717-555-0300", startDate: "2026-04-01", assignmentIds: [adminBMembershipId] } });
    assert.equal(crossTenant.status, 400);
    assert.ok(crossTenant.data.error.fields.assignments);
    const created = await adminA.request("/api/v1/projects", { method: "POST", body: { name: "Lifecycle Project", projectTypeId: projectTypeAId, clientName: "Lifecycle Client", clientEmail: "lifecycle@example.test", address: "300 Lifecycle Lane", city: "Reading", state: "PA", zip: "19601", phone: "717-555-0301", startDate: "2026-04-06", note: "Lifecycle evidence", assignmentIds: [adminAMembershipId, ownerAMembershipId] } });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    lifecycleProjectId = created.data.data.project.id;
    assert.equal(created.data.data.project.status, "active");
    const database = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try { assert.equal(database.prepare("SELECT COUNT(1) count FROM project_membership WHERE project_id = ?").get(lifecycleProjectId).count, 2); } finally { database.close(); }
  });

  await check("Project v1 update uses optimistic versions and persists fields", async () => {
    const current = await adminA.request(`/api/projects/${lifecycleProjectId}`);
    const body = { name: "Lifecycle Project Updated", projectTypeId: projectTypeAId, clientName: "Lifecycle Client", clientEmail: "lifecycle@example.test", address: "301 Lifecycle Lane", city: "Reading", state: "PA", zip: "19601", phone: "717-555-0301", startDate: "2026-04-06", note: "Updated lifecycle evidence", assignmentIds: [adminAMembershipId, ownerAMembershipId], version: current.data.project.version, rebaseMode: "date-only" };
    const updated = await adminA.request(`/api/v1/projects/${lifecycleProjectId}`, { method: "PUT", body });
    assert.equal(updated.status, 200, JSON.stringify(updated.data));
    assert.equal(updated.data.data.project.address, "301 Lifecycle Lane");
    const stale = await adminA.request(`/api/v1/projects/${lifecycleProjectId}`, { method: "PUT", body });
    assert.equal(stale.status, 409);
    assert.equal(stale.data.error.code, "PROJECT_VERSION_CONFLICT");
  });

  await check("Project lifecycle transitions persist and reject stale or cross-tenant changes", async () => {
    let current = (await adminA.request(`/api/projects/${lifecycleProjectId}`)).data.project;
    const crossTenant = await adminB.request(`/api/v1/projects/${lifecycleProjectId}/lifecycle`, { method: "PATCH", body: { action: "archive", version: current.version } });
    assert.equal(crossTenant.status, 404);
    for (const [action, expected] of [["complete", "completed"], ["reopen", "active"], ["archive", "archived"], ["restore", "active"], ["archive", "archived"]]) {
      const changed = await adminA.request(`/api/v1/projects/${lifecycleProjectId}/lifecycle`, { method: "PATCH", body: { action, version: current.version } });
      assert.equal(changed.status, 200, `${action}: ${JSON.stringify(changed.data)}`);
      current = changed.data.data.project;
      assert.equal(current.status, expected);
      if (action === "complete") {
        const stale = await adminA.request(`/api/v1/projects/${lifecycleProjectId}/lifecycle`, { method: "PATCH", body: { action: "complete", version: current.version } });
        assert.equal(stale.status, 409);
      }
    }
  });

  await check("only Owner can permanently delete the exact named archived Project", async () => {
    const adminDelete = await adminA.request(`/api/v1/projects/${lifecycleProjectId}`, { method: "DELETE", body: { name: "Lifecycle Project Updated", acknowledged: true } });
    assert.equal(adminDelete.status, 403);
    const wrongName = await ownerA.request(`/api/v1/projects/${lifecycleProjectId}`, { method: "DELETE", body: { name: "Wrong name", acknowledged: true } });
    assert.equal(wrongName.status, 409);
    const deleted = await ownerA.request(`/api/v1/projects/${lifecycleProjectId}`, { method: "DELETE", body: { name: "Lifecycle Project Updated", acknowledged: true } });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
    const database = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try {
      assert.equal(database.prepare("SELECT COUNT(1) count FROM project WHERE id = ?").get(lifecycleProjectId).count, 0);
      assert.ok(database.prepare("SELECT COUNT(1) count FROM audit_event WHERE target_id = ? AND action = 'project.delete'").get(String(lifecycleProjectId)).count >= 1);
    } finally { database.close(); }
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

  await check("Project Type rename propagates to assigned Project reads and filters", async () => {
    const renamed = await adminA.request(`/api/v1/project-types/${managedProjectTypeAId}`, { method: "PUT", body: { name: "Post-Tension Systems" } });
    assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
    const projects = await adminA.request("/api/projects");
    const project = projects.data.projects.find(item => item.id === projectAId);
    assert.equal(project.project_type, "Post-Tension Systems");
    const page = await adminA.request("/projects");
    assert.match(page.text, /Post-Tension Systems/);
  });

  await check("deleting an in-use Project Type is blocked with affected Projects", async () => {
    const response = await adminA.request(`/api/v1/project-types/${managedProjectTypeAId}`, { method: "DELETE" });
    assert.equal(response.status, 409);
    assert.equal(response.data.error.code, "PROJECT_TYPE_IN_USE");
    assert.deepEqual(response.data.error.details.affectedProjects, [{ id: projectAId, name: "Scenario Project A" }]);
  });

  await check("Owner or Admin can reassign a Project and then delete the old Project Type", async () => {
    const current = await adminA.request(`/api/projects/${projectAId}`);
    const updated = await adminA.request(`/api/v1/projects/${projectAId}`, {
      method: "PUT",
      body: { name: "Scenario Project A", projectTypeId: projectTypeAId, clientName: "Client A", clientEmail: "client-a@example.test", address: "100 Scenario Way", city: "Reading", state: "PA", zip: "19601", phone: "717-555-0100", startDate: "2026-01-01", note: "Automated isolated scenario", assignmentIds: [adminAMembershipId], version: current.data.project.version, rebaseMode: "date-only" },
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.data));
    const project = await adminA.request(`/api/projects/${projectAId}`);
    assert.equal(project.data.project.project_type_id, projectTypeAId);
    assert.equal(project.data.project.project_type, "Residential Court");
    const deleted = await adminA.request(`/api/v1/project-types/${managedProjectTypeAId}`, { method: "DELETE" });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
  });

  await check("an unused Project Type can be deleted without affecting Projects", async () => {
    const created = await adminA.request("/api/v1/project-types", { method: "POST", body: { name: "Temporary Unused Type" } });
    const projectTypeId = created.data.data.projectType.id;
    const deleted = await adminA.request(`/api/v1/project-types/${projectTypeId}`, { method: "DELETE" });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.data.data.deletedProjectTypeId, projectTypeId);
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

  await check("Admin opens every Project UI route", async () => {
    for (const [route, pattern] of [["/projects", /Project directory/], ["/projects/new", /Project Plan starting point/], [`/projects/${projectAId}`, /Owner\/Admin Project management/], [`/projects/${projectAId}/edit`, /How should the schedule respond|Edit Scenario Project A/]]) {
      const response = await adminA.request(route);
      assert.equal(response.status, 200, route);
      assert.match(response.text, pattern, route);
    }
  });

  await check("signed-out Project edit route redirects to Login", async () => {
    const response = await anonymous.request(`/projects/${projectAId}/edit`);
    assert.equal(response.status, 307);
    assert.ok(response.headers.get("location")?.endsWith("/login"));
  });

  await check("Employee identity is provisioned without public registration", async () => {
    const created = bootstrapAccount(dataDirectory, {
      companyId: companyAId,
      fullName: "Viewer A",
      email: viewerAEmail,
      password: viewerPassword,
      role: "employee",
    });
    viewerAId = created.legacyUserId;
    viewerAMembershipId = created.membershipId;
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
    assert.doesNotMatch(response.text, /Residential Court|Commercial Court|Court Resurfacing|Post-Tension Systems/);
    const api = await viewerA.request("/api/v1/project-types");
    assert.equal(api.status, 403);
  });

  await check("Employee cannot view Project Template management data", async () => {
    for (const route of ["/templates", "/templates/new", "/templates/999999", "/templates/999999/use"]) {
      const response = await viewerA.request(route);
      assert.equal(response.status, 200, route);
      assert.match(response.text, /Project Templates are restricted/);
      assert.doesNotMatch(response.text, /Scenario Project A|Scenario Template/);
    }
    const api = await viewerA.request("/api/v1/project-templates");
    assert.equal(api.status, 403);
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
    for (const route of ["/resources", `/resources/${invitedResourceId}`]) {
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

  await check("Employee sees all company Projects but cannot manage them", async () => {
    const list = await viewerA.request("/projects");
    assert.equal(list.status, 200);
    assert.match(list.text, /Employee \(Internal\) company visibility/);
    assert.match(list.text, /Scenario Project A/);
    assert.doesNotMatch(list.text, /\+ Add Project|Edit Project/);
    const edit = await viewerA.request(`/projects/${projectAId}/edit`);
    assert.equal(edit.status, 200);
    assert.match(edit.text, /Project management is restricted/);
  });

  await check("viewer cannot create projects", async () => {
    const response = await viewerA.request("/api/v1/projects", {
      method: "POST",
      body: { name: "Forbidden Project", projectTypeId: projectTypeAId, clientName: "Forbidden", clientEmail: "forbidden@example.test", address: "1 Denied Way", city: "Reading", state: "PA", zip: "19601", phone: "717-555-0999", startDate: "2026-01-01" },
    });
    assert.equal(response.status, 403);
    const lifecycle = await viewerA.request(`/api/v1/projects/${projectAId}/lifecycle`, { method: "PATCH", body: { action: "archive", version: 1 } });
    assert.equal(lifecycle.status, 403);
  });

  await check("viewer cannot list user administration data", async () => {
    const response = await viewerA.request("/api/users");
    assert.equal(response.status, 403);
  });

  await check("Admin user list contains the Employee", async () => {
    const response = await adminA.request("/api/users");
    assert.equal(response.status, 200);
    assert.ok(response.data.users.some(user => user.id === viewerAMembershipId && user.role === "employee"));
  });

  await check("company Admin cannot replace a global login email", async () => {
    const response = await adminA.request(`/api/v1/memberships/${viewerAMembershipId}`, {
      method: "PUT",
      body: { firstName: "Viewer", lastName: "A", email: `changed-${viewerAEmail}`, role: "employee" },
    });
    assert.equal(response.status, 409);
    assert.equal(response.data.error.code, "VERIFIED_EMAIL_CHANGE_REQUIRED");
  });

  await check("Project assignment changes are persistent and revoke stale User sessions", async () => {
    const response = await adminA.request(`/api/v1/memberships/${viewerAMembershipId}/projects`, {
      method: "PUT",
      body: { projectIds: [projectAId] },
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.ok(response.data.data.projects.some(project => project.id === projectAId && project.assigned));
    assert.equal((await viewerA.request("/api/me")).status, 401);
    const relogin = await viewerA.request("/api/auth/login", { method: "POST", body: { email: viewerAEmail, password: viewerPassword } });
    assert.equal(relogin.status, 200);
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
    assert.equal(response.status, 403);
  });

  await check("admin creates a categorized resource", async () => {
    const response = await adminA.request("/api/resources", {
      method: "POST",
      body: { name: "Scenario Electrician", category_name: "Employee", email: "trade-a@example.test" },
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    resourceAId = response.data.id;
    const list = await adminA.request("/api/resources");
    assert.equal(list.status, 200);
    const resource = list.data.resources.find(item => item.id === resourceAId);
    assert.equal(resource.category, "Employee");
    categoryAId = resource.category_id;
    assert.ok(categoryAId);
  });

  await check("company B creates its own resource", async () => {
    const response = await adminB.request("/api/resources", {
      method: "POST",
      body: { name: "Scenario Plumber", category_name: "Supplier" },
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
    const plan = await adminA.request(`/api/projects/${projectAId}/tasks`);
    planVersion = plan.data.planVersion;
    const response = await adminA.request(`/api/projects/${projectAId}/tasks`, {
      method: "POST",
      body: { text: "Invalid Task", planVersion },
    });
    assert.equal(response.status, 400);
  });

  await check("admin creates predecessor and successor tasks", async () => {
    const predecessor = await adminA.request(`/api/projects/${projectAId}/tasks`, {
      method: "POST",
      body: { text: "Foundation", start_date: "2026-01-01", duration: 2, progress: 0, planVersion, resourceIds: [] },
    });
    planVersion = predecessor.data.planVersion;
    const successor = await adminA.request(`/api/projects/${projectAId}/tasks`, {
      method: "POST",
      body: { text: "Framing", start_date: "2026-01-01", duration: 1, progress: 0, planVersion, resourceIds: [] },
    });
    assert.equal(predecessor.status, 201, JSON.stringify(predecessor.data));
    assert.equal(successor.status, 201, JSON.stringify(successor.data));
    planVersion = successor.data.planVersion;
    predecessorId = predecessor.data.id;
    successorId = successor.data.id;
  });

  await check("finish-to-start link cascades the successor date", async () => {
    const link = await adminA.request(`/api/projects/${projectAId}/links`, {
      method: "POST",
      body: { source: predecessorId, target: successorId, type: "0", lag: 0, planVersion },
    });
    assert.equal(link.status, 201, JSON.stringify(link.data));
    planVersion = link.data.planVersion;
    dependencyId = link.data.id;
    const tasks = await adminA.request(`/api/projects/${projectAId}/tasks`);
    const successor = tasks.data.data.find(task => task.id === successorId);
    predecessorVersion = tasks.data.data.find(task => task.id === predecessorId).version;
    successorVersion = successor.version;
    assert.equal(successor.start_date, "2026-01-05");
  });

  await check("reverse dependency cycle is rejected", async () => {
    const response = await adminA.request(`/api/projects/${projectAId}/links`, {
      method: "POST",
      body: { source: successorId, target: predecessorId, type: "0", lag: 0, planVersion },
    });
    assert.equal(response.status, 409);
    assert.equal(response.data.error.code, "DEPENDENCY_CYCLE");
  });

  await check("updating a predecessor cascades its successor", async () => {
    const update = await adminA.request(`/api/projects/${projectAId}/tasks/${predecessorId}`, {
      method: "PUT",
      body: { start_date: "2026-01-05", duration: 2, version: predecessorVersion, planVersion, resourceIds: [] },
    });
    assert.equal(update.status, 200);
    planVersion = update.data.planVersion;
    const tasks = await adminA.request(`/api/projects/${projectAId}/tasks`);
    const successor = tasks.data.data.find(task => task.id === successorId);
    predecessorVersion = tasks.data.data.find(task => task.id === predecessorId).version;
    successorVersion = successor.version;
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
      body: { text: "Overlapping Work", start_date: "2026-01-06", duration: 3, planVersion, resourceIds: [resourceAId] },
    });
    assert.equal(task.status, 201, JSON.stringify(task.data));
    planVersion = task.data.planVersion;
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

  await check("Template save rejects a source Task placed on its excluded weekend without partial rows", async () => {
    const database = new Database(path.join(dataDirectory, "dialoggg.db"));
    let invalidProjectId;
    try {
      database.transaction(() => {
        invalidProjectId = Number(database.prepare(`
          INSERT INTO project (company_id, project_type_id, name, start_date, created_by)
          VALUES (?, ?, 'Invalid Weekend Source', '2026-01-01', ?)
        `).run(companyAId, projectTypeAId, adminAId).lastInsertRowid);
        database.prepare(`
          INSERT INTO task (project_id, name, start_date, duration, allow_saturday, allow_sunday)
          VALUES (?, 'Excluded Saturday Task', '2026-01-03', 1, 0, 0)
        `).run(invalidProjectId);
      })();
    } finally { database.close(); }
    const response = await adminA.request("/api/v1/project-templates", {
      method: "POST",
      body: { sourceProjectId: invalidProjectId, name: "Invalid Weekend Template", includeResourceAssignments: false, idempotencyKey: `invalid-weekend-${suffix}` },
    });
    assert.equal(response.status, 409, JSON.stringify(response.data));
    assert.equal(response.data.error.code, "TEMPLATE_SOURCE_PLAN_INVALID");
    const verify = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try {
      assert.equal(verify.prepare("SELECT COUNT(*) count FROM project_template WHERE normalized_name = 'invalid weekend template'").get().count, 0);
    } finally { verify.close(); }
  });

  await check("source Project Plan is prepared with hierarchy, all dependency types, weekends, categories, and an exact Resource", async () => {
    const database = new Database(path.join(dataDirectory, "dialoggg.db"));
    database.pragma("foreign_keys = ON");
    try {
      database.transaction(() => {
        database.prepare("UPDATE task SET resource_category_id = ? WHERE id IN (?, ?)").run(categoryAId, predecessorId, successorId);
        templateResourceId = Number(database.prepare(`
          INSERT INTO resource (company_id, category_id, name, normalized_name, status)
          VALUES (?, ?, 'Template-only Crew', 'template-only crew', 'active')
        `).run(companyAId, categoryAId).lastInsertRowid);
        const insertTask = database.prepare(`
          INSERT INTO task (
            project_id, parent_id, name, start_date, duration, progress, color,
            is_header, sort_order, allow_saturday, allow_sunday, resource_category_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const headerId = Number(insertTask.run(projectAId, null, "Template Test Header", "2026-01-01", 10, 0.8, "#334155", 1, 100, 0, 0, null).lastInsertRowid);
        const task = (name, start, duration, order, saturday = 0) => Number(insertTask.run(projectAId, headerId, name, start, duration, 0.75, "#0f766e", 0, order, saturday, 0, categoryAId).lastInsertRowid);
        const fsSource = task("FS Source", "2026-01-01", 1, 101);
        const fsTarget = task("FS Target", "2026-01-01", 1, 102);
        const ssSource = task("SS Source", "2026-01-01", 1, 103);
        const ssTarget = task("SS Target", "2026-01-01", 1, 104);
        const ffSource = task("FF Source", "2026-01-01", 3, 105);
        const ffTarget = task("FF Target", "2026-01-01", 2, 106);
        const sfSource = task("SF Source", "2026-01-06", 1, 107);
        const sfTarget = task("SF Target", "2026-01-01", 2, 108);
        const branchTarget = task("Branch Target", "2026-01-01", 1, 109);
        const weekendTask = task("Saturday Offset Task", "2026-01-03", 2, 110, 1);
        insertTask.run(projectAId, headerId, "No Category Task", "2026-01-08", 1, 0.5, "#7c3aed", 0, 111, 0, 0, null);
        const insertLink = database.prepare(`
          INSERT INTO task_link (project_id, source_task_id, target_task_id, link_type, lag_days)
          VALUES (?, ?, ?, ?, ?)
        `);
        insertLink.run(projectAId, fsSource, fsTarget, "fs", 0);
        insertLink.run(projectAId, ssSource, ssTarget, "ss", 1);
        insertLink.run(projectAId, ffSource, ffTarget, "ff", 0);
        insertLink.run(projectAId, sfSource, sfTarget, "sf", 0);
        insertLink.run(projectAId, ffSource, branchTarget, "fs", 0);
        insertLink.run(projectAId, sfSource, branchTarget, "ss", 0);
        database.prepare("INSERT INTO task_resource (task_id, resource_id) VALUES (?, ?)").run(weekendTask, templateResourceId);
      })();
    } finally { database.close(); }
    assert.ok(templateResourceId);
  });

  await check("admin saves a tenant-scoped Template atomically and retries idempotently", async () => {
    const key = `template-create-${suffix}`;
    const created = await adminA.request("/api/v1/project-templates", {
      method: "POST",
      body: { sourceProjectId: projectAId, name: "  Scenario   Template  ", includeResourceAssignments: true, idempotencyKey: key },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    projectTemplateAId = created.data.data.template.id;
    assert.equal(created.data.data.template.name, "Scenario Template");
    assert.equal(created.data.data.template.includeResourceAssignments, true);
    assert.ok(created.data.data.template.tasks.some(task => task.name === "Template Test Header" && task.kind === "Header"));
    assert.ok(created.data.data.template.dependencies.some(link => link.linkType === "sf"));

    const replay = await adminA.request("/api/v1/project-templates", {
      method: "POST",
      body: { sourceProjectId: projectAId, name: "Scenario Template", includeResourceAssignments: true, idempotencyKey: key },
    });
    assert.equal(replay.status, 200, JSON.stringify(replay.data));
    assert.equal(replay.data.data.replayed, true);
    assert.equal(replay.data.data.template.id, projectTemplateAId);

    const duplicate = await adminA.request("/api/v1/project-templates", {
      method: "POST",
      body: { sourceProjectId: projectAId, name: "scenario template", includeResourceAssignments: false, idempotencyKey: `${key}-duplicate` },
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.data.error.code, "PROJECT_TEMPLATE_NAME_EXISTS");
  });

  await check("Template list, detail, rename, and UI routes are tenant-isolated and persistent", async () => {
    const [listA, listB] = await Promise.all([
      adminA.request("/api/v1/project-templates"),
      adminB.request("/api/v1/project-templates"),
    ]);
    assert.equal(listA.status, 200);
    assert.equal(listB.status, 200);
    assert.ok(listA.data.data.projectTemplates.some(template => template.id === projectTemplateAId));
    assert.ok(!listB.data.data.projectTemplates.some(template => template.id === projectTemplateAId));
    assert.equal((await adminB.request(`/api/v1/project-templates/${projectTemplateAId}`)).status, 404);
    assert.equal((await adminB.request(`/api/v1/project-templates/${projectTemplateAId}`, { method: "PUT", body: { name: "Tenant Escape" } })).status, 404);

    const renamed = await adminA.request(`/api/v1/project-templates/${projectTemplateAId}`, { method: "PUT", body: { name: "Scenario Template Renamed" } });
    assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
    assert.equal(renamed.data.data.projectTemplate.name, "Scenario Template Renamed");
    for (const [route, pattern] of [
      ["/templates", /Scenario Template Renamed/],
      [`/templates/${projectTemplateAId}`, /Saved Project Plan/],
      [`/templates/${projectTemplateAId}/use`, /Start Project from Template/],
    ]) {
      const response = await adminA.request(route);
      assert.equal(response.status, 200, route);
      assert.match(response.text, pattern, route);
      assert.doesNotMatch(response.text, /UI preview/, route);
    }
  });

  await check("Template instantiation rejects cross-tenant and invalid Project Type requests", async () => {
    const crossTenant = await adminB.request(`/api/v1/project-templates/${projectTemplateAId}/instantiate`, {
      method: "POST",
      body: { name: "Cross Tenant Project", projectTypeId: projectTypeBId, startDate: "2026-10-02", idempotencyKey: `cross-${suffix}` },
    });
    assert.equal(crossTenant.status, 404);
    const invalidType = await adminA.request(`/api/v1/project-templates/${projectTemplateAId}/instantiate`, {
      method: "POST",
      body: { name: "Invalid Type Project", projectTypeId: projectTypeBId, startDate: "2026-10-02", idempotencyKey: `invalid-type-${suffix}` },
    });
    assert.equal(invalidType.status, 400);
    assert.equal(invalidType.data.error.code, "PROJECT_TYPE_INVALID");
  });

  await check("Template instantiation calculates working-day schedules, resets progress, and omits inactive exact Resources", async () => {
    const database = new Database(path.join(dataDirectory, "dialoggg.db"));
    database.prepare("UPDATE resource SET status = 'inactive', deactivated_at = CURRENT_TIMESTAMP WHERE id = ?").run(templateResourceId);
    database.close();
    const key = `template-use-${suffix}`;
    const created = await adminA.request(`/api/v1/project-templates/${projectTemplateAId}/instantiate`, {
      method: "POST",
      body: { name: "Instantiated Scenario Project", projectTypeId: projectTypeAId, startDate: "2026-10-02", clientName: "Template Client", idempotencyKey: key },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    instantiatedProjectId = created.data.data.projectId;
    assert.ok(created.data.data.warnings.some(message => /inactive or missing saved Resource/.test(message)));
    const replay = await adminA.request(`/api/v1/project-templates/${projectTemplateAId}/instantiate`, {
      method: "POST",
      body: { name: "Instantiated Scenario Project", projectTypeId: projectTypeAId, startDate: "2026-10-02", clientName: "Template Client", idempotencyKey: key },
    });
    assert.equal(replay.status, 200, JSON.stringify(replay.data));
    assert.equal(replay.data.data.replayed, true);
    assert.equal(replay.data.data.projectId, instantiatedProjectId);

    const tasks = await adminA.request(`/api/projects/${instantiatedProjectId}/tasks`);
    assert.equal(tasks.status, 200);
    const byName = new Map(tasks.data.data.map(task => [task.text, task]));
    assert.equal(byName.get("FS Target").start_date, "2026-10-05");
    assert.equal(byName.get("SS Target").start_date, "2026-10-05");
    assert.equal(byName.get("FF Target").start_date, "2026-10-05");
    assert.equal(byName.get("SF Target").start_date, "2026-10-06");
    assert.equal(byName.get("Branch Target").start_date, "2026-10-07");
    assert.equal(byName.get("Saturday Offset Task").start_date, "2026-10-05");
    assert.ok(tasks.data.data.every(task => task.progress === 0));
    assert.ok(tasks.data.links.some(link => link.type === "3"));

    const verify = new Database(path.join(dataDirectory, "dialoggg.db"), { readonly: true });
    try {
      const header = verify.prepare("SELECT id FROM task WHERE project_id = ? AND name = 'Template Test Header'").get(instantiatedProjectId);
      assert.ok(header?.id);
      assert.ok(verify.prepare("SELECT COUNT(*) count FROM task WHERE project_id = ? AND parent_id = ?").get(instantiatedProjectId, header.id).count >= 10);
      assert.equal(verify.prepare("SELECT COUNT(*) count FROM task WHERE project_id = ? AND resource_category_id IS NULL AND is_header = 0").get(instantiatedProjectId).count, 1);
      assert.equal(verify.prepare("SELECT COUNT(*) count FROM task_resource tr JOIN task t ON t.id = tr.task_id WHERE t.project_id = ? AND tr.resource_id = ?").get(instantiatedProjectId, templateResourceId).count, 0);
    } finally { verify.close(); }
  });

  await check("Template deletion never changes an instantiated Project", async () => {
    const deleted = await adminA.request(`/api/v1/project-templates/${projectTemplateAId}`, { method: "DELETE" });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
    assert.equal((await adminA.request(`/api/v1/project-templates/${projectTemplateAId}`)).status, 404);
    const project = await adminA.request(`/api/projects/${instantiatedProjectId}`);
    assert.equal(project.status, 200);
    assert.equal(project.data.project.name, "Instantiated Scenario Project");
    const tasks = await adminA.request(`/api/projects/${instantiatedProjectId}/tasks`);
    assert.ok(tasks.data.data.some(task => task.text === "Saturday Offset Task"));
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

  await check("downstream calendars use the shared weekend-aware Task result", async () => {
    const task = await adminA.request(`/api/projects/${projectAId}/tasks`, {
      method: "POST",
      body: { text: "Weekend-spanning schedule", start_date: "2026-01-09", duration: 2, planVersion, resourceIds: [] },
    });
    assert.equal(task.status, 201, JSON.stringify(task.data));
    planVersion = task.data.planVersion;
    const [projectCalendar, masterCalendar] = await Promise.all([
      adminA.request(`/api/projects/${projectAId}/events`),
      adminA.request("/api/calendar"),
    ]);
    const projectTask = projectCalendar.data.events.find(event => event.title === "Weekend-spanning schedule");
    const masterTask = masterCalendar.data.events.find(event => event.title.includes("Weekend-spanning schedule"));
    assert.deepEqual({ start: projectTask?.start, end: projectTask?.end }, { start: "2026-01-09", end: "2026-01-13" });
    assert.deepEqual({ start: masterTask?.start, end: masterTask?.end }, { start: "2026-01-09", end: "2026-01-13" });
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

  await check("Master Calendar supports one-or-more tenant-scoped Project Type filters", async () => {
    const matching = await adminA.request(`/api/calendar?project_type_id=${projectTypeAId}`);
    assert.equal(matching.status, 200);
    assert.ok(matching.data.events.some(event => event.title.includes("Scenario Project A")));
    const nonMatching = await adminA.request(`/api/calendar?project_type_id=${projectTypeASecondaryId}`);
    assert.equal(nonMatching.status, 200);
    assert.equal(nonMatching.data.events.length, 0);
    const combined = await adminA.request(`/api/calendar?project_type_id=${projectTypeAId}&project_type_id=${projectTypeASecondaryId}`);
    assert.equal(combined.status, 200);
    assert.ok(combined.data.events.some(event => event.title.includes("Scenario Project A")));
    const crossTenant = await adminA.request(`/api/calendar?project_type_id=${projectTypeBId}`);
    assert.equal(crossTenant.status, 400);
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
    const plan = await adminB.request(`/api/projects/${projectBId}/tasks`);
    projectBPlanVersion = plan.data.planVersion;
    const response = await adminB.request(`/api/projects/${projectBId}/links`, {
      method: "POST",
      body: { source: predecessorId, target: successorId, type: "0", lag: 0, planVersion: projectBPlanVersion },
    });
    assert.equal(response.status, 400);
    assert.equal(response.data.error.code, "DEPENDENCY_INVALID");
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
      body: { text: "Cross-tenant overwrite attempt", planVersion: projectBPlanVersion, version: 1 },
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
    const attempt = await adminB.request(`/api/v1/projects/${projectAId}`, {
      method: "PUT",
      body: { name: "Cross-tenant project overwrite", projectTypeId: projectTypeBId, clientName: "Cross Tenant", clientEmail: "cross@example.test", address: "1 Escape Lane", city: "Nowhere", state: "PA", zip: "00000", phone: "000-000-0000", startDate: "2027-01-01", assignmentIds: [adminBMembershipId], version: 1, rebaseMode: "date-only" },
    });
    assert.equal(attempt.status, 404);
    const response = await adminA.request(`/api/projects/${projectAId}`);
    assert.equal(response.status, 200);
    assert.equal(response.data.project.name, "Scenario Project A");
  });

  await check("admin can delete another company user and revoke their sessions", async () => {
    const response = await adminA.request(`/api/users/${viewerAMembershipId}`, { method: "DELETE" });
    assert.equal(response.status, 200);
    const revoked = await viewerA.request("/api/me");
    assert.equal(revoked.status, 401);
  });

  await check("deactivated memberships cannot be silently reinvited or newly assigned", async () => {
    const reinvite = await adminA.request("/api/v1/memberships", {
      method: "POST",
      body: { firstName: "Viewer", lastName: "A", email: viewerAEmail, role: "employee", projectIds: [] },
    });
    assert.equal(reinvite.status, 409);
    const assign = await adminA.request(`/api/v1/memberships/${viewerAMembershipId}/projects`, {
      method: "PUT",
      body: { projectIds: [projectAId] },
    });
    assert.equal(assign.status, 403);
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
