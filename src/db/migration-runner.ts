import type Database from "better-sqlite3";
import { performance } from "node:perf_hooks";
import { LATEST_SCHEMA_VERSION, MIGRATIONS, migrationChecksum } from "./migrations";

type MigrationDatabase = Database.Database;

export type MigrationResult = {
  applied: Array<{ version: number; name: string; checksum: string; executionMs: number }>;
  currentVersion: number;
};

function ensureMigrationTable(database: MigrationDatabase) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      execution_ms INTEGER NOT NULL
    )
  `);
}

export function currentSchemaVersion(database: MigrationDatabase) {
  const exists = database.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migration'
  `).get();
  if (!exists) return 0;
  const row = database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migration").get() as { version: number };
  return Number(row.version);
}

export function assertSchemaCompatible(database: MigrationDatabase) {
  const currentVersion = currentSchemaVersion(database);
  if (currentVersion !== LATEST_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${currentVersion} is incompatible with application version ${LATEST_SCHEMA_VERSION}. Run the explicit migration command before startup.`,
    );
  }

  const applied = database.prepare("SELECT version, name, checksum FROM schema_migration ORDER BY version").all() as Array<{
    version: number;
    name: string;
    checksum: string;
  }>;
  for (const row of applied) {
    const migration = MIGRATIONS.find(item => item.version === row.version);
    if (!migration || migration.name !== row.name || migrationChecksum(migration) !== row.checksum) {
      throw new Error(`Migration ${row.version} checksum/name mismatch; refusing unsafe startup.`);
    }
  }
}

export function runMigrations(database: MigrationDatabase): MigrationResult {
  ensureMigrationTable(database);
  const applied: MigrationResult["applied"] = [];

  database.exec("BEGIN IMMEDIATE");
  try {
    const existing = database.prepare("SELECT version, name, checksum FROM schema_migration ORDER BY version").all() as Array<{
      version: number;
      name: string;
      checksum: string;
    }>;
    const byVersion = new Map(existing.map(row => [row.version, row]));

    for (const migration of MIGRATIONS) {
      const checksum = migrationChecksum(migration);
      const prior = byVersion.get(migration.version);
      if (prior) {
        if (prior.name !== migration.name || prior.checksum !== checksum) {
          throw new Error(`Migration ${migration.version} was modified after application.`);
        }
        continue;
      }

      const started = performance.now();
      migration.up(database);
      const executionMs = Math.max(0, Math.round(performance.now() - started));
      database.prepare(`
        INSERT INTO schema_migration (version, name, checksum, execution_ms)
        VALUES (?, ?, ?, ?)
      `).run(migration.version, migration.name, checksum, executionMs);
      applied.push({ version: migration.version, name: migration.name, checksum, executionMs });
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  assertSchemaCompatible(database);
  return { applied, currentVersion: currentSchemaVersion(database) };
}
