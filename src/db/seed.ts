import db from "./index";
import bcrypt from "bcryptjs";
import { SEED_TABLES_FOR_WIPE } from "./schema";

if (!process.argv.includes("--confirm-reset")) {
  throw new Error("Seed resets all application data. Re-run with --confirm-reset and explicit DIALOGGG_SEED_* values.");
}
if (process.env.NODE_ENV === "production") {
  throw new Error("The reset seed is disabled in production.");
}

const companyName = process.env.DIALOGGG_SEED_COMPANY?.trim();
const adminName = process.env.DIALOGGG_SEED_ADMIN_NAME?.trim();
const adminEmail = process.env.DIALOGGG_SEED_ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.DIALOGGG_SEED_ADMIN_PASSWORD;
if (!companyName || !adminName || !adminEmail || !adminPassword || adminPassword.length < 12) {
  throw new Error("Set DIALOGGG_SEED_COMPANY, DIALOGGG_SEED_ADMIN_NAME, DIALOGGG_SEED_ADMIN_EMAIL, and a 12+ character DIALOGGG_SEED_ADMIN_PASSWORD.");
}

console.log("Resetting local data and creating the requested seed administrator…");

const wipe = db.transaction(() => {
  for (const t of SEED_TABLES_FOR_WIPE) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
});
wipe();

// One explicitly named company and Admin; no shared or default credentials.
const companyRes = db.prepare(
  "INSERT INTO company (name, tagline) VALUES (?, ?)",
).run(companyName, "");
const companyId = companyRes.lastInsertRowid as number;

const pw = bcrypt.hashSync(adminPassword, 10);
db.prepare(
  "INSERT INTO user (company_id, email, password_hash, full_name, user_type) VALUES (?, ?, ?, ?, ?)",
).run(companyId, adminEmail, pw, adminName, "admin");

console.log("");
console.log("✓ Empty app ready. No projects, no tasks, no resources yet.");
console.log(`Admin email: ${adminEmail}`);
console.log("The password was read from the environment and is not printed.");
