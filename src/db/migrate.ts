import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { databasePath, openDatabase } from "./connection";
import { currentSchemaVersion, runMigrations } from "./migration-runner";
import { LATEST_SCHEMA_VERSION } from "./migrations";

async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function backupBeforeProductionMigration(database: Database.Database) {
  const currentVersion = currentSchemaVersion(database);
  const tableCount = database.prepare(`
    SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).get() as { count: number };
  if (process.env.NODE_ENV !== "production" || currentVersion >= LATEST_SCHEMA_VERSION || tableCount.count === 0 || !existsSync(databasePath)) {
    return;
  }
  const backupDirectory = path.join(path.dirname(databasePath), "backups");
  mkdirSync(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(backupDirectory, `pre-migration-v${currentVersion}-${timestamp}.db`);
  await database.backup(destination);
  const backup = new Database(destination, { readonly: true, fileMustExist: true });
  try {
    if (backup.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Pre-migration backup integrity check failed.");
    const foreignKeyViolations = backup.pragma("foreign_key_check") as unknown[];
    if (foreignKeyViolations.length) throw new Error("Pre-migration backup contains foreign-key violations.");
  } finally {
    backup.close();
  }
  process.stdout.write(`Pre-migration backup verified: ${destination}; sha256 ${await sha256File(destination)}\n`);
}

const database = openDatabase();
try {
  await backupBeforeProductionMigration(database);
  const result = runMigrations(database);
  for (const migration of result.applied) {
    process.stdout.write(
      `Applied migration ${migration.version} (${migration.name}) in ${migration.executionMs}ms; checksum ${migration.checksum.slice(0, 12)}\n`,
    );
  }
  process.stdout.write(`Database schema is current at version ${result.currentVersion}.\n`);
} finally {
  database.close();
}
