import Database from "better-sqlite3";
import { access, copyFile, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

const sourceArgument = process.argv.find(argument => argument !== "--confirm" && argument !== process.argv[0] && argument !== process.argv[1]);
if (!sourceArgument || !process.argv.includes("--confirm")) {
  throw new Error("Usage: npm run db:restore -- <backup.db> --confirm");
}

const sourcePath = path.resolve(sourceArgument);
const dataDirectory = path.resolve(
  process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(process.cwd(), "data"),
);
const targetPath = path.join(dataDirectory, "dialoggg.db");
if (sourcePath.toLowerCase() === targetPath.toLowerCase()) {
  throw new Error("The backup and live database paths must differ.");
}
await access(sourcePath).catch(() => {
  throw new Error(`Backup not found: ${sourcePath}`);
});

function verifyDatabase(databasePath) {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const result = database.pragma("integrity_check", { simple: true });
    if (result !== "ok") throw new Error(`Integrity check failed for ${databasePath}: ${result}`);
  } finally {
    database.close();
  }
}

verifyDatabase(sourcePath);
await mkdir(dataDirectory, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const temporaryPath = path.join(dataDirectory, `.dialoggg-restore-${timestamp}.db`);
const rollbackPath = path.join(dataDirectory, `dialoggg-pre-restore-${timestamp}.db`);
await copyFile(sourcePath, temporaryPath);
verifyDatabase(temporaryPath);

let existingDatabase = false;
try {
  await access(targetPath);
  existingDatabase = true;
} catch {}

if (existingDatabase) {
  const current = new Database(targetPath, { fileMustExist: true });
  try {
    current.pragma("wal_checkpoint(TRUNCATE)");
  } finally {
    current.close();
  }
  await rm(`${targetPath}-wal`, { force: true });
  await rm(`${targetPath}-shm`, { force: true });
  await rename(targetPath, rollbackPath);
}

try {
  await rename(temporaryPath, targetPath);
  verifyDatabase(targetPath);
} catch (error) {
  await rm(temporaryPath, { force: true });
  await rm(targetPath, { force: true });
  if (existingDatabase) await rename(rollbackPath, targetPath);
  throw error;
}

process.stdout.write(`Restore verified: ${targetPath}\n`);
if (existingDatabase) process.stdout.write(`Pre-restore copy retained: ${rollbackPath}\n`);
