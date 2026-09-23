import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import path from "node:path";
import test from "node:test";
import { emailWorkerIntervalMs, emailWorkerLaunch, startEmailWorkerLoop } from "../scripts/start-email-worker.mjs";

function fakeChild() {
  const child = new EventEmitter();
  child.killed = false;
  child.kill = signal => {
    child.killed = true;
    child.signal = signal;
  };
  return child;
}

test("email worker interval is bounded", () => {
  assert.equal(emailWorkerIntervalMs(undefined), 60_000);
  assert.equal(emailWorkerIntervalMs("15000"), 15_000);
  assert.equal(emailWorkerIntervalMs("900000"), 900_000);
  assert.throws(() => emailWorkerIntervalMs("14999"), /EMAIL_WORKER_INTERVAL_MS/);
  assert.throws(() => emailWorkerIntervalMs("invalid"), /EMAIL_WORKER_INTERVAL_MS/);
});

test("email worker launch stays anchored to the application root", () => {
  const applicationRoot = path.resolve("C:/app-root");
  const launch = emailWorkerLaunch(applicationRoot);

  assert.equal(launch.options.cwd, applicationRoot);
  assert.equal(launch.args[0], path.join(applicationRoot, "node_modules", "tsx", "dist", "cli.mjs"));
  assert.equal(launch.args[1], path.join(applicationRoot, "src", "db", "process-email-outbox.ts"));
});

test("scheduled worker runs keep the original application root", () => {
  const applicationRoot = path.resolve("C:/app-root");
  const launches = [];
  let scheduled;
  const loop = startEmailWorkerLoop({
    environment: { EMAIL_WORKER_ENABLED: "true", EMAIL_WORKER_INTERVAL_MS: "15000" },
    workingDirectory: applicationRoot,
    spawnFn(command, args, options) {
      const child = fakeChild();
      launches.push({ command, args, options, child });
      return child;
    },
    setIntervalFn(callback) {
      scheduled = callback;
      return { unref() {} };
    },
    clearIntervalFn() {},
    logger: { info() {}, error() {} },
  });

  launches[0].child.emit("exit", 0, null);
  assert.equal(scheduled(), true);
  assert.equal(launches.length, 2);
  for (const launch of launches) {
    assert.equal(launch.options.cwd, applicationRoot);
    assert.equal(launch.args[0], path.join(applicationRoot, "node_modules", "tsx", "dist", "cli.mjs"));
    assert.equal(launch.args[1], path.join(applicationRoot, "src", "db", "process-email-outbox.ts"));
  }
  loop.stop();
});

test("email worker starts immediately and never overlaps", () => {
  const children = [];
  let scheduled;
  let cancelled = false;
  const messages = [];
  const loop = startEmailWorkerLoop({
    environment: { EMAIL_WORKER_ENABLED: "true", EMAIL_WORKER_INTERVAL_MS: "15000" },
    spawnWorker() {
      const child = fakeChild();
      children.push(child);
      return child;
    },
    setIntervalFn(callback) {
      scheduled = callback;
      return { unref() {} };
    },
    clearIntervalFn() { cancelled = true; },
    logger: { info: message => messages.push(message), error: message => messages.push(message) },
  });

  assert.equal(children.length, 1);
  assert.equal(loop.intervalMs, 15_000);
  assert.equal(scheduled(), false);
  assert.equal(children.length, 1);
  children[0].emit("exit", 0, null);
  assert.equal(scheduled(), true);
  assert.equal(children.length, 2);
  loop.stop();
  assert.equal(cancelled, true);
  assert.equal(children[1].killed, true);
  assert.equal(children[1].signal, "SIGTERM");
  assert.match(messages.join("\n"), /scheduled every 15000ms/);
});

test("email worker can be explicitly disabled", () => {
  let spawned = false;
  const loop = startEmailWorkerLoop({
    environment: { EMAIL_WORKER_ENABLED: "false" },
    spawnWorker() { spawned = true; return fakeChild(); },
    logger: { info() {}, error() {} },
  });
  assert.equal(loop.enabled, false);
  assert.equal(loop.runNow(), false);
  assert.equal(spawned, false);
});
