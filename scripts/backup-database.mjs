import Database from "better-sqlite3";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";

const dataDirectory = path.resolve(
  process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(process.cwd(), "data"),
);
const sourcePath = path.join(dataDirectory, "dialoggg.db");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const destinationPath = path.resolve(
  process.argv[2] || path.join(dataDirectory, "backups", `dialoggg-${timestamp}.db`),
);

await access(sourcePath).catch(() => {
  throw new Error(`Database not found: ${sourcePath}`);
});
if (sourcePath.toLowerCase() === destinationPath.toLowerCase()) {
  throw new Error("The backup destination must differ from the live database.");
}

await mkdir(path.dirname(destinationPath), { recursive: true });
const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
try {
  await source.backup(destinationPath);
} finally {
  source.close();
}

const backup = new Database(destinationPath, { readonly: true, fileMustExist: true });
try {
  const result = backup.pragma("integrity_check", { simple: true });
  if (result !== "ok") throw new Error(`Backup integrity check failed: ${result}`);
} finally {
  backup.close();
}

process.stdout.write(`Backup verified: ${destinationPath}\n`);
