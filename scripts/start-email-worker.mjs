import { spawn } from "node:child_process";
import path from "node:path";

const DEFAULT_INTERVAL_MS = 60_000;
const MINIMUM_INTERVAL_MS = 15_000;
const MAXIMUM_INTERVAL_MS = 15 * 60_000;

export function emailWorkerIntervalMs(value) {
  if (value === undefined || value === null || String(value).trim() === "") return DEFAULT_INTERVAL_MS;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < MINIMUM_INTERVAL_MS || parsed > MAXIMUM_INTERVAL_MS) {
    throw new Error(`EMAIL_WORKER_INTERVAL_MS must be an integer between ${MINIMUM_INTERVAL_MS} and ${MAXIMUM_INTERVAL_MS}.`);
  }
  return parsed;
}

export function emailWorkerLaunch(workingDirectory) {
  const applicationRoot = path.resolve(workingDirectory);
  return {
    command: process.execPath,
    args: [
      path.join(applicationRoot, "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(applicationRoot, "src", "db", "process-email-outbox.ts"),
    ],
    options: { cwd: applicationRoot, env: process.env, stdio: "inherit" },
  };
}

function defaultSpawnWorker(workingDirectory, spawnFn = spawn) {
  const launch = emailWorkerLaunch(workingDirectory);
  return spawnFn(launch.command, launch.args, launch.options);
}

export function startEmailWorkerLoop(options = {}) {
  const environment = options.environment ?? process.env;
  const logger = options.logger ?? console;
  const schedule = options.setIntervalFn ?? setInterval;
  const cancel = options.clearIntervalFn ?? clearInterval;
  const applicationRoot = path.resolve(options.workingDirectory ?? process.cwd());
  const spawnFn = options.spawnFn ?? spawn;
  const spawnWorker = options.spawnWorker ?? (() => defaultSpawnWorker(applicationRoot, spawnFn));
  const enabled = String(environment.EMAIL_WORKER_ENABLED ?? "true").trim().toLowerCase() !== "false";

  if (!enabled) {
    logger.info("Email outbox worker disabled by EMAIL_WORKER_ENABLED=false.");
    return { enabled: false, intervalMs: null, runNow: () => false, stop: () => undefined };
  }

  const intervalMs = emailWorkerIntervalMs(environment.EMAIL_WORKER_INTERVAL_MS);
  let currentWorker = null;
  let stopped = false;

  function finish(child, code, signal) {
    if (currentWorker !== child) return;
    currentWorker = null;
    if (code !== 0) {
      logger.error(`Email outbox worker exited unsuccessfully (code=${code ?? "none"}, signal=${signal ?? "none"}).`);
    }
  }

  function runNow() {
    if (stopped || currentWorker) return false;
    try {
      const child = spawnWorker();
      currentWorker = child;
      child.once("error", () => finish(child, null, "spawn_error"));
      child.once("exit", (code, signal) => finish(child, code, signal));
      return true;
    } catch {
      logger.error("Email outbox worker could not be started.");
      return false;
    }
  }

  runNow();
  const timer = schedule(runNow, intervalMs);
  timer?.unref?.();
  logger.info(`Email outbox worker scheduled every ${intervalMs}ms.`);

  return {
    enabled: true,
    intervalMs,
    runNow,
    stop() {
      if (stopped) return;
      stopped = true;
      cancel(timer);
      if (currentWorker && !currentWorker.killed) currentWorker.kill("SIGTERM");
    },
  };
}
