import assert from "node:assert/strict";
import test from "node:test";
import { defaultNewTaskStartDate } from "../src/lib/gantt-task-defaults.ts";

const projectStartDate = "2026-12-01";

test("new project tasks default to the saved Project Start Date", () => {
  assert.equal(defaultNewTaskStartDate(projectStartDate), projectStartDate);
  assert.equal(defaultNewTaskStartDate(projectStartDate, { type: "project", is_root: true, end_date: "2027-02-10" }), projectStartDate);
  assert.equal(defaultNewTaskStartDate(projectStartDate, { type: "task", end_date: "2027-01-20" }), projectStartDate);
});

test("tasks entered from a header default to its inclusive end date", () => {
  assert.equal(defaultNewTaskStartDate(projectStartDate, { type: "project", is_root: false, end_date: "2027-01-20" }), "2027-01-20");
  assert.equal(defaultNewTaskStartDate(projectStartDate, { type: "project", is_root: false, end_date: null }), projectStartDate);
});
