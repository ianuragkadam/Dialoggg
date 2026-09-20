import { spawnSync } from "node:child_process";
import path from "node:path";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

export function prepareTestDatabase(dataDirectory) {
  const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/db/migrate.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", RAILWAY_VOLUME_MOUNT_PATH: dataDirectory },
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`Test database migration failed.\n${result.stdout}\n${result.stderr}`);
}

export function bootstrapAccount(dataDirectory, {
  companyName,
  companyId: requestedCompanyId = null,
  fullName,
  email,
  password,
  role = "admin",
  platform = false,
}) {
  const database = new Database(path.join(dataDirectory, "dialoggg.db"));
  database.pragma("foreign_keys = ON");
  try {
    return database.transaction(() => {
      let companyId = requestedCompanyId;
      if (!platform && !companyId) {
        companyId = Number(database.prepare(
          "INSERT INTO company (name, time_zone, status) VALUES (?, 'America/New_York', 'active')",
        ).run(companyName).lastInsertRowid);
        const category = database.prepare("INSERT INTO resource_category (company_id, name) VALUES (?, ?)");
        for (const name of ["Employee", "Subcontractor", "Supplier", "Equipment", "Other"]) category.run(companyId, name);
        const projectType = database.prepare("INSERT INTO project_type (company_id, name, normalized_name) VALUES (?, ?, ?)");
        for (const name of ["Residential Court", "Commercial Court", "Court Resurfacing"]) {
          projectType.run(companyId, name, name.toLowerCase());
        }
      }
      const passwordHash = bcrypt.hashSync(password, 12);
      const legacyRole = platform ? "super_admin" : role === "employee" ? "internal" : role;
      const legacyUserId = Number(database.prepare(`
        INSERT INTO user (company_id, email, password_hash, full_name, user_type)
        VALUES (?, ?, ?, ?, ?)
      `).run(companyId, email, passwordHash, fullName, legacyRole).lastInsertRowid);
      const [firstName, ...lastName] = fullName.trim().split(/\s+/);
      const identityId = Number(database.prepare(`
        INSERT INTO identity (
          legacy_user_id, normalized_email, password_hash, first_name, last_name,
          status, is_platform_admin, email_verified_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP)
      `).run(legacyUserId, email.toLowerCase(), passwordHash, firstName, lastName.join(" "), platform ? 1 : 0).lastInsertRowid);
      let membershipId = null;
      if (companyId) {
        membershipId = Number(database.prepare(`
          INSERT INTO company_membership (identity_id, company_id, legacy_user_id, role, status, accepted_at)
          VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
        `).run(identityId, companyId, legacyUserId, role).lastInsertRowid);
      }
      const projectTypes = companyId
        ? database.prepare("SELECT id, name FROM project_type WHERE company_id = ? ORDER BY id").all(companyId)
        : [];
      return {
        companyId,
        legacyUserId,
        identityId,
        membershipId,
        projectTypes,
        defaultProjectTypeId: projectTypes[0]?.id ?? null,
      };
    })();
  } finally {
    database.close();
  }
}

export async function login(baseUrl, email, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`Fixture login failed (${response.status}): ${await response.text()}`);
  return response;
}

export function authenticatedHeaders(response, baseUrl) {
  const combined = response.headers.get("set-cookie") || "";
  const session = combined.match(/dialoggg_session=([^;]+)/)?.[1];
  const csrf = combined.match(/dialoggg_csrf=([^;]+)/)?.[1];
  if (!session || !csrf) throw new Error("Fixture login did not return both session and CSRF cookies.");
  return {
    cookie: `dialoggg_session=${session}; dialoggg_csrf=${csrf}`,
    origin: baseUrl,
    "x-csrf-token": csrf,
  };
}
