import type Database from "better-sqlite3";
import { openDatabase } from "./connection";
import { assertSchemaCompatible } from "./migration-runner";

// Schema changes are deliberately excluded from module initialization. The
// deploy/test workflow must run the versioned migration command once first.
// Opening the runtime database is also deferred until an application request
// actually uses it. Next.js imports route modules while building, before a
// Railway volume is mounted, so eager initialization would incorrectly turn a
// healthy production database into a build-time dependency.
let runtimeDatabase: Database.Database | null = null;

export function getDatabase() {
  if (!runtimeDatabase) {
    runtimeDatabase = openDatabase();
    assertSchemaCompatible(runtimeDatabase);
  }
  return runtimeDatabase;
}

const db = new Proxy({} as Database.Database, {
  get(_target, property) {
    const database = getDatabase();
    const value = Reflect.get(database, property, database);
    return typeof value === "function" ? value.bind(database) : value;
  },
});

export default db;
