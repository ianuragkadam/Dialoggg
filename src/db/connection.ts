import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

export const dataDirectory = path.resolve(
  process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(process.cwd(), "data"),
);

export const databasePath = path.join(dataDirectory, "dialoggg.db");

export function openDatabase(options: { readonly?: boolean; fileMustExist?: boolean } = {}) {
  if (!options.readonly && !existsSync(dataDirectory)) {
    mkdirSync(dataDirectory, { recursive: true });
  }

  const database = new Database(databasePath, options);
  database.pragma("busy_timeout = 30000");
  database.pragma("foreign_keys = ON");
  if (!options.readonly) database.pragma("journal_mode = WAL");
  return database;
}
