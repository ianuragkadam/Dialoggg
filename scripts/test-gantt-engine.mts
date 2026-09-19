import assert from "node:assert/strict";
import db from "../src/db/index.ts";
import {
  calculatePlan,
  createPlanLink,
  createPlanTask,
  deletePlanLink,
  deletePlanTask,
  getProjectPlan,
  PlanDomainError,
  updatePlanTask,
  type PlanLinkRow,
  type PlanTaskRow,
} from "../src/lib/gantt-cascade.ts";

const baseTask = (id: number, overrides: Partial<PlanTaskRow> = {}): PlanTaskRow => ({
  id,
  project_id: 1,
  parent_id: 100,
  name: `Task ${id}`,
  start_date: "2026-09-18",
  manual_start_date: "2026-09-18",
  duration: 2,
  progress: 0,
  color: "#5599dd",
  is_header: 0,
  is_root: 0,
  start_by_mode: "time_period",
  sort_order: id,
  allow_saturday: 0,
  allow_sunday: 0,
  resource_category_id: null,
  external_visible: 0,
  version: 1,
  ...overrides,
});
const root = baseTask(100, { parent_id: null, name: "Root", is_header: 1, is_root: 1, duration: 1, sort_order: -1 });
const source = baseTask(1);
const target = baseTask(2);
const link = (type: PlanLinkRow["link_type"], lag = 0): PlanLinkRow => ({ id: 1, project_id: 1, source_task_id: 1, target_task_id: 2, link_type: type, lag_days: lag });

assert.equal(calculatePlan([root, source, target], [link("fs")], "2026-09-18").tasks.find(task => task.id === 2)?.start_date, "2026-09-22");
assert.equal(calculatePlan([root, source, target], [link("ss", 2)], "2026-09-18").tasks.find(task => task.id === 2)?.start_date, "2026-09-22");
assert.equal(calculatePlan([root, source, target], [link("ff")], "2026-09-18").tasks.find(task => task.id === 2)?.start_date, "2026-09-18");
assert.equal(calculatePlan([root, source, target], [link("sf")], "2026-09-18").tasks.find(task => task.id === 2)?.start_date, "2026-09-17");
const weekendTarget = baseTask(2, { allow_saturday: 1 });
assert.equal(calculatePlan([root, baseTask(1, { duration: 1 }), weekendTarget], [link("fs")], "2026-09-18").tasks.find(task => task.id === 2)?.start_date, "2026-09-19");
const third = baseTask(3, { start_date: "2026-09-23", manual_start_date: "2026-09-23", duration: 1 });
const merged = calculatePlan([root, source, target, third], [link("fs"), { id: 2, project_id: 1, source_task_id: 3, target_task_id: 2, link_type: "fs", lag_days: 0 }], "2026-09-18");
assert.equal(merged.tasks.find(task => task.id === 2)?.start_date, "2026-09-24");
assert.throws(() => calculatePlan([root, source, target], [link("fs"), { ...link("fs"), id: 2, source_task_id: 2, target_task_id: 1 }], "2026-09-18"), (error: unknown) => error instanceof PlanDomainError && error.code === "DEPENDENCY_CYCLE");

const companyId = Number(db.prepare("INSERT INTO company(name) VALUES('Engine Company')").run().lastInsertRowid);
const typeId = Number(db.prepare("INSERT INTO project_type(company_id,name,normalized_name) VALUES(?,'Court','court')").run(companyId).lastInsertRowid);
const projectId = Number(db.prepare("INSERT INTO project(company_id,project_type_id,name,start_date) VALUES(?,?,'Engine Project','2026-09-18')").run(companyId,typeId).lastInsertRowid);
let planVersion = 1;
let result = createPlanTask(projectId, companyId, { planVersion, isHeader: true, name: "Build", parent: 0, externalVisible: true });
planVersion = result.plan!.project.planVersion;
const headerId = result.taskId;
result = createPlanTask(projectId, companyId, { planVersion, name: "Pour", parent: headerId, startDate: "2026-09-18", duration: 2, progress: 0, resourceIds: [] });
planVersion = result.plan!.project.planVersion;
const firstId = result.taskId;
result = createPlanTask(projectId, companyId, { planVersion, name: "Surface", parent: headerId, startDate: "2026-09-18", duration: 1, progress: 0, resourceIds: [] });
planVersion = result.plan!.project.planVersion;
const secondId = result.taskId;
let linked = createPlanLink(projectId, companyId, { planVersion, source: firstId, target: secondId, type: "fs", lag: 0 });
planVersion = linked.plan!.project.planVersion;
let plan = getProjectPlan(projectId, companyId)!;
assert.equal(plan.tasks.find(task => task.id === secondId)?.start_date, "2026-09-22");
const firstVersion = plan.tasks.find(task => task.id === firstId)!.version;
plan = updatePlanTask(projectId, firstId, companyId, { planVersion, version: firstVersion, name: "Pour", parent: headerId, startDate: "2026-09-16", duration: 2, progress: 0, resourceIds: [] })!;
planVersion = plan.project.planVersion;
assert.equal(plan.tasks.find(task => task.id === secondId)?.start_date, "2026-09-18");
assert.throws(() => createPlanLink(projectId, companyId, { planVersion, source: secondId, target: firstId, type: "fs", lag: 0 }), (error: unknown) => error instanceof PlanDomainError && error.code === "DEPENDENCY_CYCLE");
const secondBeforeComplete = plan.tasks.find(task => task.id === secondId)!;
plan = updatePlanTask(projectId, secondId, companyId, { planVersion, version: secondBeforeComplete.version, name: "Surface", parent: headerId, startDate: secondBeforeComplete.start_date, duration: 1, progress: 1, resourceIds: [] })!;
planVersion = plan.project.planVersion;
const completed = plan.tasks.find(task => task.id === secondId)!;
assert.throws(() => updatePlanTask(projectId, secondId, companyId, { planVersion, version: completed.version, name: "Surface", parent: headerId, startDate: "2026-09-21", duration: 1, progress: 1, resourceIds: [] }), (error: unknown) => error instanceof PlanDomainError && error.code === "COMPLETED_TASK_IMMUTABLE");
assert.throws(() => deletePlanTask(projectId, secondId, companyId, planVersion, completed.version), (error: unknown) => error instanceof PlanDomainError && error.code === "COMPLETED_TASK_IMMUTABLE");
const header = plan.tasks.find(task => task.id === headerId)!;
assert.ok(Math.abs(header.progress - (1 / 3)) < 0.000001);
plan = deletePlanLink(projectId, linked.linkId, companyId, planVersion)!;
planVersion = plan.project.planVersion;
assert.equal(plan.links.length, 0);
assert.throws(() => updatePlanTask(projectId, firstId, companyId, { planVersion: planVersion - 1, version: plan.tasks.find(task => task.id === firstId)!.version, name: "Stale", parent: headerId, startDate: "2026-09-16", duration: 2, progress: 0, resourceIds: [] }), (error: unknown) => error instanceof PlanDomainError && error.code === "PLAN_VERSION_CONFLICT");

process.stdout.write("Gantt scheduling engine golden checks passed.\n");
