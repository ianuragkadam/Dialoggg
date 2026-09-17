import db from "./index";
import bcrypt from "bcryptjs";

if (!process.argv.includes("--confirm-reset")) {
  throw new Error("Seed resets all application data. Re-run with --confirm-reset and explicit DIALOGGG_SEED_* values.");
}
if (process.env.NODE_ENV === "production") {
  throw new Error("The reset seed is disabled in production.");
}

const companyName = process.env.DIALOGGG_SEED_COMPANY?.trim();
const ownerName = process.env.DIALOGGG_SEED_OWNER_NAME?.trim();
const ownerEmail = process.env.DIALOGGG_SEED_OWNER_EMAIL?.trim().toLowerCase();
const ownerPassword = process.env.DIALOGGG_SEED_OWNER_PASSWORD;
if (!companyName || !ownerName || !ownerEmail || !ownerPassword || ownerPassword.length < 12) {
  throw new Error("Set DIALOGGG_SEED_COMPANY, DIALOGGG_SEED_OWNER_NAME, DIALOGGG_SEED_OWNER_EMAIL, and a 12+ character DIALOGGG_SEED_OWNER_PASSWORD.");
}

console.log("Resetting local data and creating the requested seed Owner…");

const wipeTables = [
  "google_item_mapping", "google_connection", "project_folder_mapping", "microsoft_connection",
  "event_exception", "event_resource", "event_series", "template_dependency", "template_task", "project_template",
  "task_resource", "task_link", "task", "event", "project_membership", "project_user", "project", "project_type",
  "resource", "resource_category", "outbox_job", "audit_event", "invitation_token", "password_reset_token",
  "auth_session", "auth_rate_limit", "company_membership", "identity", "session", "user",
  "requirements_response", "requirements_form_state", "company",
];

const wipe = db.transaction(() => {
  for (const t of wipeTables) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
});
wipe();

// One explicitly named company and Owner; no shared or default credentials.
db.transaction(() => {
  const companyRes = db.prepare(
    "INSERT INTO company (name, tagline) VALUES (?, ?)",
  ).run(companyName, "");
  const companyId = Number(companyRes.lastInsertRowid);
  const pw = bcrypt.hashSync(ownerPassword, 12);
  const legacy = db.prepare(
    "INSERT INTO user (company_id, email, password_hash, full_name, user_type) VALUES (?, ?, ?, ?, 'owner')",
  ).run(companyId, ownerEmail, pw, ownerName);
  const [firstName, ...lastName] = ownerName.split(/\s+/);
  const identity = db.prepare(`
    INSERT INTO identity (legacy_user_id, normalized_email, password_hash, first_name, last_name, status, email_verified_at)
    VALUES (?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
  `).run(Number(legacy.lastInsertRowid), ownerEmail, pw, firstName, lastName.join(" "));
  db.prepare(`
    INSERT INTO company_membership (identity_id, company_id, legacy_user_id, role, status, accepted_at)
    VALUES (?, ?, ?, 'owner', 'active', CURRENT_TIMESTAMP)
  `).run(Number(identity.lastInsertRowid), companyId, Number(legacy.lastInsertRowid));
  const category = db.prepare("INSERT INTO resource_category (company_id, name) VALUES (?, ?)");
  for (const name of ["Employee", "Subcontractor", "Supplier", "Equipment", "Other"]) category.run(companyId, name);
})();

console.log("");
console.log("✓ Empty app ready. No projects, no tasks, no resources yet.");
console.log("Owner identity created from the supplied environment values.");
console.log("The password was read from the environment and is not printed.");
