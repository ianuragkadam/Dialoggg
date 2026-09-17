import { openDatabase } from "./connection";
import { runMigrations } from "./migration-runner";

const database = openDatabase();
try {
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
