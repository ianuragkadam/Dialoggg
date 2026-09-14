import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { TABLES } from "./schema";

// Railway exposes the attached volume path at runtime. Locally, keep using ./data.
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "dialoggg.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

for (const sql of TABLES) {
  db.prepare(sql).run();
}

// --- lightweight migrations: add columns to existing tables if missing ---
function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some(c => c.name === column)) {
    try {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${ddl}`).run();
    } catch (error) {
      // Next.js builds pages in parallel. Another worker may finish this
      // migration after the check above but before this ALTER executes.
      const refreshed = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (refreshed.some(c => c.name === column)) return;
      throw error;
    }
  }
}

ensureColumn("company", "ical_token", "ical_token TEXT");
ensureColumn("project", "ical_token", "ical_token TEXT");
ensureColumn("resource", "ical_token", "ical_token TEXT");

export default db;
