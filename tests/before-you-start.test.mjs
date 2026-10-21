import assert from "node:assert/strict";
import test from "node:test";
import { PRIMER_IDEAS, PRIMER_SUBJECT, primerPlainText } from "../src/lib/before-you-start.ts";

test("Owner primer has five shared ideas and links to the Help checklist", () => {
  assert.equal(PRIMER_IDEAS.length, 5);
  assert.match(PRIMER_SUBJECT, /Before you start/);
  const message = primerPlainText("https://example.test/help#start");
  for (const idea of PRIMER_IDEAS) assert.ok(message.includes(idea.body));
  assert.match(message, /Team resource/);
  assert.match(message, /tasks can show up on your phone's calendar/);
  assert.match(message, /Get started: https:\/\/example\.test\/help#start/);
});
