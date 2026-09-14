import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  throw new Error("Standalone Next.js output is missing. Run `next build` first.");
}

function copyIntoStandalone(source, destination) {
  if (!existsSync(source)) return;
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true, force: true });
}

copyIntoStandalone(path.join(root, "public"), path.join(standalone, "public"));
copyIntoStandalone(
  path.join(root, ".next", "static"),
  path.join(standalone, ".next", "static"),
);

console.log("Prepared standalone public and static assets.");
