import db from "@/db";
import {
  addDays,
  addWorkingDays,
  alignWorkingDay,
  daysBetween,
  isWorkingDay,
  startForWorkingDayEnd,
  workingDayEnd,
  type WorkingDayRules,
} from "@/lib/dates";

export type PlanLinkType = "fs" | "ss" | "ff" | "sf";

export type PlanTaskRow = {
  id: number;
  project_id: number;
  parent_id: number | null;
  name: string;
  start_date: string;
  manual_start_date: string | null;
  duration: number;
  progress: number;
  color: string;
  is_header: number;
  is_root: number;
  start_by_mode: string;
  sort_order: number;
  allow_saturday: number;
  allow_sunday: number;
  resource_category_id: number | null;
  external_visible: number;
  version: number;
};

export type PlanLinkRow = {
  id: number;
  project_id: number;
  source_task_id: number;
  target_task_id: number;
  link_type: PlanLinkType;
  lag_days: number;
};

export type ScheduledTask = PlanTaskRow & { end_date: string };

export class PlanDomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LINK_TYPES = new Set<PlanLinkType>(["fs", "ss", "ff", "sf"]);

function rules(task: Pick<PlanTaskRow, "allow_saturday" | "allow_sunday">): WorkingDayRules {
  return { allowSaturday: task.allow_saturday === 1, allowSunday: task.allow_sunday === 1 };
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function nextAllowedAfter(value: string, targetRules: WorkingDayRules) {
  return alignWorkingDay(addDays(value, 1), targetRules, 1);
}

export function dependencyStart(
  link: Pick<PlanLinkRow, "link_type" | "lag_days">,
  source: Pick<ScheduledTask, "start_date" | "end_date">,
  target: Pick<PlanTaskRow, "duration" | "allow_saturday" | "allow_sunday">,
) {
  const targetRules = rules(target);
  if (link.link_type === "fs") {
    return addWorkingDays(nextAllowedAfter(source.end_date, targetRules), link.lag_days, targetRules);
  }
  if (link.link_type === "ss") {
    return addWorkingDays(alignWorkingDay(source.start_date, targetRules, 1), link.lag_days, targetRules);
  }
  const sourcePoint = link.link_type === "ff" ? source.end_date : source.start_date;
  const requiredEnd = addWorkingDays(alignWorkingDay(sourcePoint, targetRules, 1), link.lag_days, targetRules);
  return startForWorkingDayEnd(requiredEnd, target.duration, targetRules);
}

function taskRows(projectId: number) {
  return db.prepare(`SELECT id, project_id, parent_id, name, start_date, manual_start_date,
      duration, progress, color, is_header, is_root, start_by_mode, sort_order,
      allow_saturday, allow_sunday, resource_category_id, external_visible, version
    FROM task WHERE project_id=? ORDER BY sort_order,id`).all(projectId) as PlanTaskRow[];
}

function linkRows(projectId: number) {
  return db.prepare(`SELECT id, project_id, source_task_id, target_task_id, link_type, lag_days
    FROM task_link WHERE project_id=? ORDER BY id`).all(projectId) as PlanLinkRow[];
}

function projectRow(projectId: number, companyId?: number) {
  const where = companyId ? "p.id=? AND p.company_id=?" : "p.id=?";
  return db.prepare(`SELECT p.id,p.company_id,p.name,p.start_date,p.end_date,p.status,p.plan_version,p.calendar_color
    FROM project p WHERE ${where}`).get(...(companyId ? [projectId, companyId] : [projectId])) as
    | { id: number; company_id: number; name: string; start_date: string; end_date: string | null; status: string; plan_version: number; calendar_color: string }
    | undefined;
}

export function calculatePlan(
  tasks: PlanTaskRow[],
  links: PlanLinkRow[],
  projectStartDate: string,
): { tasks: ScheduledTask[]; projectEndDate: string | null } {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const leaves = tasks.filter(task => task.is_header === 0);
  const leafIds = new Set(leaves.map(task => task.id));
  const incoming = new Map<number, PlanLinkRow[]>();
  const outgoing = new Map<number, PlanLinkRow[]>();
  const indegree = new Map(leaves.map(task => [task.id, 0]));

  for (const task of tasks) {
    if (task.is_root === 1 && (task.is_header !== 1 || task.parent_id !== null)) {
      throw new PlanDomainError("PLAN_HIERARCHY_INVALID", "The protected Project root is invalid.", 409);
    }
    if (task.is_root === 0) {
      const parent = task.parent_id ? byId.get(task.parent_id) : undefined;
      if (!parent || parent.project_id !== task.project_id || parent.is_header !== 1) {
        throw new PlanDomainError("PLAN_HIERARCHY_INVALID", "Every Task must belong to a Header in this Project.", 409);
      }
    }
  }

  for (const link of links) {
    if (!leafIds.has(link.source_task_id) || !leafIds.has(link.target_task_id) || link.source_task_id === link.target_task_id) {
      throw new PlanDomainError("DEPENDENCY_INVALID", "Dependencies may connect only two different leaf Tasks.", 409);
    }
    if (!LINK_TYPES.has(link.link_type) || !Number.isInteger(link.lag_days) || link.lag_days < 0) {
      throw new PlanDomainError("DEPENDENCY_INVALID", "Choose a supported dependency type and a non-negative whole-day lag.", 400);
    }
    incoming.set(link.target_task_id, [...(incoming.get(link.target_task_id) ?? []), link]);
    outgoing.set(link.source_task_id, [...(outgoing.get(link.source_task_id) ?? []), link]);
    indegree.set(link.target_task_id, (indegree.get(link.target_task_id) ?? 0) + 1);
  }

  const queue = leaves.filter(task => (indegree.get(task.id) ?? 0) === 0).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const scheduled = new Map<number, ScheduledTask>();
  while (queue.length) {
    const task = queue.shift()!;
    const targetRules = rules(task);
    const predecessors = incoming.get(task.id) ?? [];
    let start = alignWorkingDay(task.manual_start_date || task.start_date || projectStartDate, targetRules, 1);
    if (predecessors.length) {
      const constraints = predecessors.map(link => {
        const source = scheduled.get(link.source_task_id);
        if (!source) throw new PlanDomainError("DEPENDENCY_CYCLE", "The dependency graph contains a cycle.", 409);
        return dependencyStart(link, source, task);
      });
      start = constraints.reduce((latest, value) => value > latest ? value : latest);
    }
    const end = workingDayEnd(start, task.duration, targetRules);
    scheduled.set(task.id, { ...task, start_date: start, start_by_mode: predecessors.length ? "linked" : "time_period", end_date: end });
    for (const link of outgoing.get(task.id) ?? []) {
      const next = (indegree.get(link.target_task_id) ?? 0) - 1;
      indegree.set(link.target_task_id, next);
      if (next === 0) {
        const target = byId.get(link.target_task_id)!;
        queue.push(target);
        queue.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      }
    }
  }
  if (scheduled.size !== leaves.length) {
    throw new PlanDomainError("DEPENDENCY_CYCLE", "The dependency graph contains a cycle.", 409);
  }

  const childMap = new Map<number, PlanTaskRow[]>();
  for (const task of tasks) if (task.parent_id) childMap.set(task.parent_id, [...(childMap.get(task.parent_id) ?? []), task]);
  const visiting = new Set<number>();
  const complete = new Set<number>();
  const headerResult = new Map<number, ScheduledTask>();
  const collectLeaves = (headerId: number): ScheduledTask[] => {
    if (visiting.has(headerId)) throw new PlanDomainError("PLAN_HIERARCHY_CYCLE", "The Task hierarchy contains a cycle.", 409);
    visiting.add(headerId);
    const descendants: ScheduledTask[] = [];
    for (const child of childMap.get(headerId) ?? []) {
      if (child.is_header) descendants.push(...collectLeaves(child.id));
      else descendants.push(scheduled.get(child.id)!);
    }
    visiting.delete(headerId);
    complete.add(headerId);
    const header = byId.get(headerId)!;
    const start = descendants.length
      ? descendants.map(item => item.start_date).reduce((a, b) => a < b ? a : b)
      : projectStartDate;
    const end = descendants.length
      ? descendants.map(item => item.end_date).reduce((a, b) => a > b ? a : b)
      : projectStartDate;
    const totalDuration = descendants.reduce((sum, item) => sum + item.duration, 0);
    const weightedProgress = totalDuration
      ? descendants.reduce((sum, item) => sum + item.duration * item.progress, 0) / totalDuration
      : 0;
    headerResult.set(headerId, {
      ...header,
      start_date: start,
      manual_start_date: start,
      duration: Math.max(1, daysBetween(start, end) + 1),
      progress: weightedProgress,
      start_by_mode: "time_period",
      end_date: end,
    });
    return descendants;
  };
  for (const header of tasks.filter(task => task.is_header === 1)) if (!complete.has(header.id)) collectLeaves(header.id);

  const ordered = tasks.map(task => task.is_header ? headerResult.get(task.id)! : scheduled.get(task.id)!);
  const projectEndDate = leaves.length
    ? [...scheduled.values()].map(item => item.end_date).reduce((a, b) => a > b ? a : b)
    : null;
  return { tasks: ordered, projectEndDate };
}

function assertProjectWritable(projectId: number, companyId: number, expectedPlanVersion: number) {
  const project = projectRow(projectId, companyId);
  if (!project) throw new PlanDomainError("PROJECT_NOT_FOUND", "Project not found.", 404);
  if (project.status !== "active") throw new PlanDomainError("PROJECT_READ_ONLY", "Reopen or restore this Project before changing its Plan.", 409);
  if (!Number.isInteger(expectedPlanVersion) || expectedPlanVersion !== project.plan_version) {
    throw new PlanDomainError("PLAN_VERSION_CONFLICT", "This Project Plan changed after you opened it. Refresh and try again.", 409);
  }
  return project;
}

function persistCalculatedPlan(projectId: number, incrementPlanVersion: boolean) {
  const project = projectRow(projectId);
  if (!project) throw new PlanDomainError("PROJECT_NOT_FOUND", "Project not found.", 404);
  const currentTasks = taskRows(projectId);
  const calculated = calculatePlan(currentTasks, linkRows(projectId), project.start_date);
  const currentById = new Map(currentTasks.map(task => [task.id, task]));
  const update = db.prepare(`UPDATE task SET start_date=?,manual_start_date=?,duration=?,progress=?,start_by_mode=?,
    version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`);
  for (const next of calculated.tasks) {
    const current = currentById.get(next.id)!;
    const changed = current.start_date !== next.start_date
      || current.manual_start_date !== next.manual_start_date
      || current.duration !== next.duration
      || Math.abs(current.progress - next.progress) > 0.0000001
      || current.start_by_mode !== next.start_by_mode;
    if (changed) update.run(next.start_date, next.manual_start_date, next.duration, next.progress, next.start_by_mode, next.id);
  }
  db.prepare(`UPDATE project SET end_date=?,plan_version=plan_version+?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(calculated.projectEndDate, incrementPlanVersion ? 1 : 0, projectId);
  return getProjectPlan(projectId, project.company_id);
}

function asInteger(value: unknown, field: string, minimum = 0) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new PlanDomainError("VALIDATION_FAILED", "Check the highlighted fields.", 400, { [field]: `Enter a whole number of at least ${minimum}.` });
  }
  return parsed;
}

function leafFields(input: Record<string, unknown>) {
  const name = String(input.name ?? input.text ?? "").trim();
  if (!name) throw new PlanDomainError("VALIDATION_FAILED", "Check the highlighted fields.", 400, { name: "Enter the Task Name." });
  const startDate = String(input.startDate ?? input.start_date ?? "");
  if (!validDate(startDate)) throw new PlanDomainError("VALIDATION_FAILED", "Check the highlighted fields.", 400, { startDate: "Choose a valid Start Date." });
  const duration = asInteger(input.duration, "duration", 1);
  const progress = Number(input.progress ?? 0);
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    throw new PlanDomainError("VALIDATION_FAILED", "Check the highlighted fields.", 400, { progress: "Progress must be between 0 and 1." });
  }
  return {
    name,
    startDate,
    duration,
    progress,
    color: String(input.color ?? "#5599dd").trim() || "#5599dd",
    allowSaturday: input.allowSaturday === true || input.allow_saturday === true || input.allow_saturday === 1,
    allowSunday: input.allowSunday === true || input.allow_sunday === true || input.allow_sunday === 1,
    categoryId: input.resourceCategoryId == null && input.resource_category_id == null ? null : asInteger(input.resourceCategoryId ?? input.resource_category_id, "resourceCategoryId", 1),
    externalVisible: input.externalVisible === true || input.external_visible === true || input.external_visible === 1,
  };
}

function parentFor(projectId: number, requested: unknown) {
  const root = db.prepare("SELECT id FROM task WHERE project_id=? AND is_root=1").get(projectId) as { id: number } | undefined;
  const parentId = Number(requested) > 0 ? Number(requested) : root?.id;
  const parent = db.prepare("SELECT id FROM task WHERE id=? AND project_id=? AND is_header=1").get(parentId, projectId) as { id: number } | undefined;
  if (!parent) throw new PlanDomainError("VALIDATION_FAILED", "Choose a Header in this Project.", 400, { parentId: "Choose a valid parent Header." });
  return parent.id;
}

function setTaskResources(projectId: number, companyId: number, taskId: number, raw: unknown) {
  const ids = [...new Set((Array.isArray(raw) ? raw : []).map(Number))];
  if (!ids.every(id => Number.isInteger(id) && id > 0)) throw new PlanDomainError("VALIDATION_FAILED", "Choose active Resources from this company.", 400, { resourceIds: "Choose valid Resources." });
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const found = db.prepare(`SELECT COUNT(1) count FROM resource r JOIN project p ON p.company_id=r.company_id
      WHERE p.id=? AND r.company_id=? AND r.status='active' AND r.id IN (${placeholders})`).get(projectId, companyId, ...ids) as { count:number };
    if (found.count !== ids.length) throw new PlanDomainError("VALIDATION_FAILED", "Choose active Resources from this company.", 400, { resourceIds: "An assigned Resource is inactive or belongs to another company." });
  }
  db.prepare("DELETE FROM task_resource WHERE task_id=?").run(taskId);
  const insert = db.prepare("INSERT INTO task_resource(task_id,resource_id) VALUES(?,?)");
  for (const id of ids) insert.run(taskId,id);
}

export function getProjectPlan(projectId: number, companyId: number, external = false) {
  const project = projectRow(projectId, companyId);
  if (!project) return null;
  const allTasks = taskRows(projectId);
  const allLinks = linkRows(projectId);
  const calculated = calculatePlan(allTasks, allLinks, project.start_date);
  let visible = calculated.tasks;
  let links = allLinks;
  if (external) {
    const root = allTasks.find(task => task.is_root === 1);
    const allowed = new Set(allTasks.filter(task => task.external_visible === 1).map(task => task.id));
    if (root) allowed.add(root.id);
    visible = calculated.tasks.filter(task => allowed.has(task.id)).map(task => ({
      ...task,
      parent_id: task.parent_id && allowed.has(task.parent_id) ? task.parent_id : root?.id ?? null,
      manual_start_date: null,
      resource_category_id: null,
    }));
    links = [];
  }
  return {
    project: { id: project.id, name: project.name, status: project.status, startDate: project.start_date, endDate: calculated.projectEndDate, planVersion: project.plan_version },
    tasks: visible,
    links,
  };
}

export function recalculateProjectPlan(projectId: number, incrementPlanVersion = false) {
  return db.transaction(() => persistCalculatedPlan(projectId, incrementPlanVersion))();
}

export function createPlanTask(projectId: number, companyId: number, input: Record<string, unknown>) {
  return db.transaction(() => {
    const project = assertProjectWritable(projectId, companyId, Number(input.planVersion));
    const isHeader = input.isHeader === true || input.type === "project";
    const name = String(input.name ?? input.text ?? "").trim();
    if (!name) throw new PlanDomainError("VALIDATION_FAILED", "Check the highlighted fields.", 400, { name: "Enter the Task Name." });
    const parentId = parentFor(projectId, input.parentId ?? input.parent);
    const sort = db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 value FROM task WHERE project_id=?").get(projectId) as { value: number };
    if (isHeader) {
      db.prepare(`INSERT INTO task(project_id,parent_id,name,start_date,manual_start_date,duration,progress,color,is_header,start_by_mode,sort_order,allow_saturday,allow_sunday,version,external_visible,is_root,updated_at)
        VALUES(?,?,?,?,?,1,0,?,1,'time_period',?,0,0,1,?,0,CURRENT_TIMESTAMP)`)
        .run(projectId, parentId, name, project.start_date, project.start_date, String(input.color ?? project.calendar_color), sort.value, input.externalVisible === true ? 1 : 0);
    } else {
      const fields = leafFields({ ...input, color: input.color ?? project.calendar_color });
      db.prepare(`INSERT INTO task(project_id,parent_id,name,start_date,manual_start_date,duration,progress,color,is_header,start_by_mode,sort_order,allow_saturday,allow_sunday,version,resource_category_id,external_visible,is_root,updated_at)
        VALUES(?,?,?,?,?,?,?,?,0,'time_period',?,?,?,?,?,?,0,CURRENT_TIMESTAMP)`)
        .run(projectId,parentId,fields.name,fields.startDate,fields.startDate,fields.duration,fields.progress,fields.color,sort.value,fields.allowSaturday?1:0,fields.allowSunday?1:0,1,fields.categoryId,fields.externalVisible?1:0);
    }
    const id = Number((db.prepare("SELECT last_insert_rowid() id").get() as { id: number }).id);
    if (!isHeader) setTaskResources(projectId, companyId, id, input.resourceIds ?? input.resource_ids);
    const plan = persistCalculatedPlan(projectId, true);
    return { plan, taskId: id };
  })();
}

/** Reorder a Task among its existing siblings without changing hierarchy. */
export function reorderPlanTask(
  projectId: number,
  companyId: number,
  input: { taskId: unknown; parentId: unknown; index: unknown; planVersion: unknown },
) {
  return db.transaction(() => {
    assertProjectWritable(projectId, companyId, Number(input.planVersion));
    const taskId = asInteger(input.taskId, "taskId", 1);
    const parentId = asInteger(input.parentId, "parentId", 1);
    const index = asInteger(input.index, "index", 0);
    const task = db.prepare("SELECT id,parent_id,is_root FROM task WHERE id=? AND project_id=?")
      .get(taskId, projectId) as { id: number; parent_id: number | null; is_root: number } | undefined;
    if (!task) throw new PlanDomainError("TASK_NOT_FOUND", "Task not found.", 404);
    if (task.is_root) throw new PlanDomainError("ROOT_TASK_PROTECTED", "The Project root cannot be reordered.", 409);
    if (task.parent_id !== parentId) {
      throw new PlanDomainError("TASK_REORDER_PARENT_INVALID", "Tasks can only be reordered within the same Header.", 409);
    }

    const siblings = db.prepare(`SELECT id FROM task WHERE project_id=? AND parent_id=? ORDER BY sort_order,id`)
      .all(projectId, parentId) as { id: number }[];
    const oldIndex = siblings.findIndex(sibling => sibling.id === taskId);
    if (oldIndex < 0) throw new PlanDomainError("TASK_NOT_FOUND", "Task not found.", 404);
    const [moving] = siblings.splice(oldIndex, 1);
    siblings.splice(Math.min(index, siblings.length), 0, moving);

    const update = db.prepare("UPDATE task SET sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=?");
    siblings.forEach((sibling, siblingIndex) => update.run(siblingIndex + 1, sibling.id, projectId));
    return persistCalculatedPlan(projectId, true);
  })();
}

function hierarchyContains(taskId: number, possibleDescendantId: number) {
  const descendants = db.prepare(`WITH RECURSIVE tree(id) AS (
      SELECT id FROM task WHERE parent_id=? UNION ALL SELECT t.id FROM task t JOIN tree ON t.parent_id=tree.id
    ) SELECT 1 found FROM tree WHERE id=? LIMIT 1`).get(taskId, possibleDescendantId);
  return !!descendants;
}

function workingLag(anchor: string, requested: string, targetRules: WorkingDayRules) {
  if (!isWorkingDay(requested, targetRules) || requested < anchor) return null;
  let value = anchor;
  let lag = 0;
  while (value < requested) {
    value = addWorkingDays(value, 1, targetRules);
    lag += 1;
  }
  return value === requested ? lag : null;
}

function updateLinkedDrag(projectId: number, task: PlanTaskRow, requested: string) {
  const links = linkRows(projectId).filter(link => link.target_task_id === task.id);
  if (!links.length) return false;
  const scheduled = calculatePlan(taskRows(projectId), linkRows(projectId), projectRow(projectId)!.start_date);
  const byId = new Map(scheduled.tasks.map(item => [item.id, item]));
  const targetRules = rules(task);
  const candidates = links.map(link => {
    const source = byId.get(link.source_task_id)!;
    const current = dependencyStart(link, source, task);
    const zero = dependencyStart({ ...link, lag_days: 0 }, source, task);
    return { link, current, lag: workingLag(zero, requested, targetRules) };
  });
  if (candidates.some(item => item.lag === null)) {
    throw new PlanDomainError("LINKED_DRAG_IMPOSSIBLE", "That date would require a negative dependency lag.", 409);
  }
  const laterThanRequested = candidates.filter(item => item.current > requested);
  if (laterThanRequested.length > 1) {
    throw new PlanDomainError("LINKED_DRAG_REVIEW_REQUIRED", "More than one predecessor would need a lag change. Edit the dependencies explicitly.", 409);
  }
  const controlling = [...candidates].sort((a, b) => b.current.localeCompare(a.current) || a.link.id - b.link.id)[0];
  db.prepare("UPDATE task_link SET lag_days=? WHERE id=? AND project_id=?").run(controlling.lag, controlling.link.id, projectId);
  const after = calculatePlan(taskRows(projectId), linkRows(projectId), projectRow(projectId)!.start_date);
  if (after.tasks.find(item => item.id === task.id)?.start_date !== requested) {
    throw new PlanDomainError("LINKED_DRAG_REVIEW_REQUIRED", "The requested date conflicts with another predecessor. Edit the dependencies explicitly.", 409);
  }
  return true;
}

export function updatePlanTask(projectId: number, taskId: number, companyId: number, input: Record<string, unknown>) {
  return db.transaction(() => {
    assertProjectWritable(projectId, companyId, Number(input.planVersion));
    const current = db.prepare("SELECT * FROM task WHERE id=? AND project_id=?").get(taskId, projectId) as PlanTaskRow | undefined;
    if (!current) throw new PlanDomainError("TASK_NOT_FOUND", "Task not found.", 404);
    if (current.is_root) throw new PlanDomainError("ROOT_TASK_PROTECTED", "The Project root cannot be edited directly.", 409);
    if (Number(input.version) !== current.version) throw new PlanDomainError("TASK_VERSION_CONFLICT", "This Task changed after you opened it. Refresh and try again.", 409);
    const name = String(input.name ?? input.text ?? current.name).trim();
    if (!name) throw new PlanDomainError("VALIDATION_FAILED", "Check the highlighted fields.", 400, { name: "Enter the Task Name." });
    const parentId = parentFor(projectId, input.parentId ?? input.parent ?? current.parent_id);
    if (parentId === taskId || hierarchyContains(taskId, parentId)) throw new PlanDomainError("PLAN_HIERARCHY_CYCLE", "A Header cannot be moved beneath itself or one of its children.", 409);
    if (current.is_header) {
      db.prepare("UPDATE task SET name=?,parent_id=?,color=?,external_visible=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(name,parentId,String(input.color??current.color),input.externalVisible===true||input.external_visible===true?1:0,taskId);
    } else {
      const fields = leafFields({ ...input, name, startDate: input.startDate ?? input.start_date ?? current.start_date, duration: input.duration ?? current.duration, progress: input.progress ?? current.progress, color: input.color ?? current.color, allowSaturday: input.allowSaturday ?? !!current.allow_saturday, allowSunday: input.allowSunday ?? !!current.allow_sunday, resourceCategoryId: input.resourceCategoryId ?? current.resource_category_id, externalVisible: input.externalVisible ?? !!current.external_visible });
      const scheduleChanged = fields.startDate !== current.start_date || fields.duration !== current.duration || fields.allowSaturday !== !!current.allow_saturday || fields.allowSunday !== !!current.allow_sunday;
      if (current.progress >= 1 && scheduleChanged) throw new PlanDomainError("COMPLETED_TASK_IMMUTABLE", "Completed Task dates and working-day rules cannot be changed.", 409);
      db.prepare(`UPDATE task SET name=?,parent_id=?,duration=?,progress=?,color=?,allow_saturday=?,allow_sunday=?,resource_category_id=?,external_visible=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(fields.name,parentId,fields.duration,fields.progress,fields.color,fields.allowSaturday?1:0,fields.allowSunday?1:0,fields.categoryId,fields.externalVisible?1:0,taskId);
      // Duration or other task edits may omit Resource assignments. Treat that
      // as “leave unchanged”; an explicit empty array still clears assignments.
      if (input.resourceIds !== undefined || input.resource_ids !== undefined) {
        setTaskResources(projectId, companyId, taskId, input.resourceIds ?? input.resource_ids);
      }
      const refreshed = db.prepare("SELECT * FROM task WHERE id=?").get(taskId) as PlanTaskRow;
      if (!updateLinkedDrag(projectId, refreshed, fields.startDate)) {
        db.prepare("UPDATE task SET manual_start_date=?,start_date=? WHERE id=?").run(fields.startDate, fields.startDate, taskId);
      }
    }
    return persistCalculatedPlan(projectId, true);
  })();
}

export function deletePlanTask(projectId: number, taskId: number, companyId: number, expectedPlanVersion: number, expectedTaskVersion: number) {
  return db.transaction(() => {
    assertProjectWritable(projectId, companyId, expectedPlanVersion);
    const task = db.prepare("SELECT * FROM task WHERE id=? AND project_id=?").get(taskId, projectId) as PlanTaskRow | undefined;
    if (!task) throw new PlanDomainError("TASK_NOT_FOUND", "Task not found.", 404);
    if (task.version !== expectedTaskVersion) throw new PlanDomainError("TASK_VERSION_CONFLICT", "This Task changed after you opened it. Refresh and try again.", 409);
    if (task.is_root) throw new PlanDomainError("ROOT_TASK_PROTECTED", "The Project root cannot be deleted.", 409);
    if (task.is_header && db.prepare("SELECT 1 FROM task WHERE parent_id=? LIMIT 1").get(taskId)) throw new PlanDomainError("HEADER_NOT_EMPTY", "Move or delete every child before deleting this Header.", 409);
    if (!task.is_header && task.progress >= 1) throw new PlanDomainError("COMPLETED_TASK_IMMUTABLE", "Completed Task history cannot be deleted.", 409);
    const targets = db.prepare("SELECT DISTINCT target_task_id id FROM task_link WHERE source_task_id=?").all(taskId) as Array<{ id: number }>;
    db.prepare("DELETE FROM task WHERE id=? AND project_id=?").run(taskId, projectId);
    for (const target of targets) {
      const stillLinked = db.prepare("SELECT 1 FROM task_link WHERE target_task_id=? LIMIT 1").get(target.id);
      if (!stillLinked) db.prepare("UPDATE task SET start_by_mode='time_period',manual_start_date=start_date WHERE id=?").run(target.id);
    }
    return persistCalculatedPlan(projectId, true);
  })();
}

export function createPlanLink(projectId: number, companyId: number, input: Record<string, unknown>) {
  return db.transaction(() => {
    assertProjectWritable(projectId, companyId, Number(input.planVersion));
    const source = asInteger(input.sourceTaskId ?? input.source, "sourceTaskId", 1);
    const target = asInteger(input.targetTaskId ?? input.target, "targetTaskId", 1);
    const rawType = String(input.linkType ?? input.type ?? "fs");
    const typeMap: Record<string, PlanLinkType> = { "0":"fs", "1":"ss", "2":"ff", "3":"sf", fs:"fs", ss:"ss", ff:"ff", sf:"sf" };
    const linkType = typeMap[rawType];
    const lag = asInteger(input.lagWorkdays ?? input.lag ?? 0, "lagWorkdays", 0);
    if (!linkType) throw new PlanDomainError("VALIDATION_FAILED", "Choose a supported dependency type.", 400, { linkType: "Choose FS, SS, FF, or SF." });
    const count = (db.prepare("SELECT COUNT(1) count FROM task WHERE project_id=? AND id IN (?,?) AND is_header=0").get(projectId,source,target) as { count:number }).count;
    if (source === target || count !== 2) throw new PlanDomainError("DEPENDENCY_INVALID", "Dependencies may connect only two different leaf Tasks in this Project.", 400);
    if (wouldCreateCycle(source, target, projectId)) throw new PlanDomainError("DEPENDENCY_CYCLE", "That dependency would create a cycle.", 409);
    try {
      db.prepare("INSERT INTO task_link(project_id,source_task_id,target_task_id,link_type,lag_days) VALUES(?,?,?,?,?)").run(projectId,source,target,linkType,lag);
    } catch (error) {
      if (error instanceof Error && /UNIQUE/.test(error.message)) throw new PlanDomainError("DEPENDENCY_DUPLICATE", "These Tasks are already linked.", 409);
      throw error;
    }
    db.prepare("UPDATE task SET start_by_mode='linked' WHERE id=?").run(target);
    const id = Number((db.prepare("SELECT last_insert_rowid() id").get() as { id:number }).id);
    return { plan: persistCalculatedPlan(projectId, true), linkId: id };
  })();
}

export function deletePlanLink(projectId: number, linkId: number, companyId: number, expectedPlanVersion: number) {
  return db.transaction(() => {
    assertProjectWritable(projectId, companyId, expectedPlanVersion);
    const link = db.prepare("SELECT * FROM task_link WHERE id=? AND project_id=?").get(linkId, projectId) as PlanLinkRow | undefined;
    if (!link) throw new PlanDomainError("DEPENDENCY_NOT_FOUND", "Dependency not found.", 404);
    const currentTarget = db.prepare("SELECT start_date FROM task WHERE id=?").get(link.target_task_id) as { start_date:string };
    db.prepare("DELETE FROM task_link WHERE id=? AND project_id=?").run(linkId, projectId);
    if (!db.prepare("SELECT 1 FROM task_link WHERE target_task_id=? LIMIT 1").get(link.target_task_id)) {
      db.prepare("UPDATE task SET start_by_mode='time_period',manual_start_date=? WHERE id=?").run(currentTarget.start_date, link.target_task_id);
    }
    return persistCalculatedPlan(projectId, true);
  })();
}

export function cascadeFrom(taskId: number): void {
  const row = db.prepare("SELECT project_id FROM task WHERE id=?").get(taskId) as { project_id:number } | undefined;
  if (row) persistCalculatedPlan(row.project_id, false);
}

export function reconcileHeader(headerId: number): void {
  const row = db.prepare("SELECT project_id FROM task WHERE id=?").get(headerId) as { project_id:number } | undefined;
  if (row) persistCalculatedPlan(row.project_id, false);
}

export function wouldCreateCycle(sourceId: number, targetId: number, projectId?: number): boolean {
  if (sourceId === targetId) return true;
  const source = db.prepare("SELECT project_id FROM task WHERE id=?").get(sourceId) as { project_id:number } | undefined;
  const scopedProject = projectId ?? source?.project_id;
  if (!scopedProject) return true;
  const visited = new Set<number>();
  const queue = [targetId];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === sourceId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    const outs = db.prepare("SELECT target_task_id FROM task_link WHERE project_id=? AND source_task_id=?").all(scopedProject,id) as Array<{ target_task_id:number }>;
    for (const out of outs) queue.push(out.target_task_id);
  }
  return false;
}
