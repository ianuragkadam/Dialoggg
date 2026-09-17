import db from "@/db";
import {
  addDays,
  addWorkingDays,
  alignWorkingDay,
  startForWorkingDayEnd,
  workingDayEnd,
  workingDayOffset,
  type WorkingDayRules,
} from "@/lib/dates";
import { activeProjectTypeId } from "@/lib/project-types";

export type ProjectTemplateTaskRecord = {
  id: number;
  templateRef: string;
  parentRef: string | null;
  name: string;
  kind: "Header" | "Task";
  relativeStartWorkdays: number;
  durationWorkdays: number;
  allowSaturday: boolean;
  allowSunday: boolean;
  color: string;
  resourceCategoryName: string | null;
  exactResourceCount: number;
  sortOrder: number;
  offset: string;
  duration: string;
  category: string;
};

export type ProjectTemplateDependencyRecord = {
  id: number;
  sourceRef: string;
  targetRef: string;
  linkType: "fs" | "ss" | "ff" | "sf";
  lagWorkdays: number;
};

export type ProjectTemplateRecord = {
  id: number;
  name: string;
  sourceProjectId: number | null;
  sourceProject: string;
  taskCount: number;
  headerCount: number;
  workingDays: number;
  categoryCount: number;
  updatedLabel: string;
  updatedAt: string;
  weekendRule: string;
  colorCount: number;
  includeResourceAssignments: boolean;
  tasks: ProjectTemplateTaskRecord[];
  dependencies: ProjectTemplateDependencyRecord[];
};

export type TemplateSourceProject = {
  id: number;
  name: string;
  tasks: number;
  categories: number;
  duration: number;
};

type TemplateRow = {
  id: number;
  name: string;
  source_project_id: number | null;
  source_project_name: string;
  include_resource_assignments: number;
  updated_at: string;
};

type TemplateTaskRow = {
  id: number;
  template_ref: string;
  parent_ref: string | null;
  name: string;
  is_header: number;
  relative_start_workdays: number;
  duration_workdays: number;
  allow_saturday: number;
  allow_sunday: number;
  color: string;
  resource_category_name: string | null;
  exact_resource_ids_json: string | null;
  sort_order: number;
};

type TemplateDependencyRow = {
  id: number;
  source_ref: string;
  target_ref: string;
  link_type: "fs" | "ss" | "ff" | "sf";
  lag_workdays: number;
};

type SourceTaskRow = {
  id: number;
  parent_id: number | null;
  name: string;
  start_date: string;
  duration: number;
  color: string | null;
  is_header: number;
  allow_saturday: number;
  allow_sunday: number;
  sort_order: number;
  resource_category_name: string | null;
};

type ScheduledTemplateTask = TemplateTaskRow & { startDate: string; endDate: string };

export class ProjectTemplateDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function rulesFor(task: Pick<TemplateTaskRow, "allow_saturday" | "allow_sunday">): WorkingDayRules {
  return { allowSaturday: !!task.allow_saturday, allowSunday: !!task.allow_sunday };
}

function parseResourceIds(value: string | null) {
  if (!value) return [];
  try {
    const ids = JSON.parse(value) as unknown;
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.map(Number).filter(id => Number.isInteger(id) && id > 0))];
  } catch {
    return [];
  }
}

function formatUpdatedAt(value: string) {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function mapTask(row: TemplateTaskRow): ProjectTemplateTaskRecord {
  const duration = Number(row.duration_workdays);
  const offset = Number(row.relative_start_workdays);
  return {
    id: row.id,
    templateRef: row.template_ref,
    parentRef: row.parent_ref,
    name: row.name,
    kind: row.is_header ? "Header" : "Task",
    relativeStartWorkdays: offset,
    durationWorkdays: duration,
    allowSaturday: !!row.allow_saturday,
    allowSunday: !!row.allow_sunday,
    color: row.color,
    resourceCategoryName: row.resource_category_name,
    exactResourceCount: parseResourceIds(row.exact_resource_ids_json).length,
    sortOrder: Number(row.sort_order),
    offset: `Day ${offset}`,
    duration: `${duration} working day${duration === 1 ? "" : "s"}`,
    category: row.resource_category_name || "Needs category",
  };
}

function templateTaskRows(templateId: number) {
  return db.prepare(`
    SELECT * FROM template_task
    WHERE template_id = ?
    ORDER BY sort_order, id
  `).all(templateId) as TemplateTaskRow[];
}

function templateDependencyRows(templateId: number) {
  return db.prepare(`
    SELECT * FROM template_dependency
    WHERE template_id = ?
    ORDER BY id
  `).all(templateId) as TemplateDependencyRow[];
}

function mapTemplate(row: TemplateRow): ProjectTemplateRecord {
  const taskRows = templateTaskRows(row.id);
  const tasks = taskRows.map(mapTask);
  const leafRows = taskRows.filter(task => !task.is_header);
  const saturdayCount = leafRows.filter(task => task.allow_saturday).length;
  const sundayCount = leafRows.filter(task => task.allow_sunday).length;
  const weekendRule = sundayCount
    ? `Saturday and Sunday rules saved per Task (${saturdayCount} Saturday; ${sundayCount} Sunday)`
    : saturdayCount
      ? `Saturday allowed on ${saturdayCount} Task${saturdayCount === 1 ? "" : "s"}; Sunday excluded`
      : "Monday–Friday only";
  const dependencies = templateDependencyRows(row.id).map(dependency => ({
    id: dependency.id,
    sourceRef: dependency.source_ref,
    targetRef: dependency.target_ref,
    linkType: dependency.link_type,
    lagWorkdays: Number(dependency.lag_workdays),
  }));
  return {
    id: row.id,
    name: row.name,
    sourceProjectId: row.source_project_id,
    sourceProject: row.source_project_name || "Deleted source Project",
    taskCount: tasks.length,
    headerCount: tasks.filter(task => task.kind === "Header").length,
    workingDays: taskRows.reduce((maximum, task) => Math.max(maximum, Number(task.relative_start_workdays) + Number(task.duration_workdays)), 0),
    categoryCount: new Set(taskRows.map(task => task.resource_category_name).filter(Boolean)).size,
    updatedLabel: formatUpdatedAt(row.updated_at),
    updatedAt: row.updated_at,
    weekendRule,
    colorCount: new Set(taskRows.map(task => task.color)).size,
    includeResourceAssignments: !!row.include_resource_assignments,
    tasks,
    dependencies,
  };
}

export function listProjectTemplates(companyId: number) {
  const rows = db.prepare(`
    SELECT id, name, source_project_id, source_project_name, include_resource_assignments, updated_at
    FROM project_template
    WHERE company_id = ? AND status = 'active'
    ORDER BY lower(name), id
  `).all(companyId) as TemplateRow[];
  return rows.map(mapTemplate);
}

export function getProjectTemplate(templateId: number, companyId: number) {
  const row = db.prepare(`
    SELECT id, name, source_project_id, source_project_name, include_resource_assignments, updated_at
    FROM project_template
    WHERE id = ? AND company_id = ? AND status = 'active'
  `).get(templateId, companyId) as TemplateRow | undefined;
  return row ? mapTemplate(row) : null;
}

export function listTemplateSourceProjects(companyId: number) {
  const projects = db.prepare(`
    SELECT id, name, start_date
    FROM project
    WHERE company_id = ? AND status IN ('active', 'completed')
    ORDER BY lower(name), id
  `).all(companyId) as Array<{ id: number; name: string; start_date: string }>;
  return projects.map(project => {
    const tasks = db.prepare(`
      SELECT t.*, rc.name AS resource_category_name
      FROM task t
      LEFT JOIN resource_category rc ON rc.id = t.resource_category_id AND rc.company_id = ?
      WHERE t.project_id = ?
      ORDER BY t.sort_order, t.id
    `).all(companyId, project.id) as SourceTaskRow[];
    const duration = tasks.reduce((maximum, task) => {
      try {
        return Math.max(maximum, workingDayOffset(project.start_date, task.start_date, {
          allowSaturday: !!task.allow_saturday,
          allowSunday: !!task.allow_sunday,
        }) + Math.max(1, Number(task.duration)));
      } catch {
        return maximum;
      }
    }, 0);
    return {
      id: project.id,
      name: project.name,
      tasks: tasks.length,
      categories: new Set(tasks.map(task => task.resource_category_name).filter(Boolean)).size,
      duration,
    } satisfies TemplateSourceProject;
  });
}

export function normalizeProjectTemplateName(value: unknown) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return { name, normalizedName: name.toLocaleLowerCase("en-US") };
}

export function validateProjectTemplateName(name: string) {
  if (!name) return "Enter a Template name.";
  if (name.length > 80) return "Use 80 characters or fewer.";
  return null;
}

export function validateIdempotencyKey(value: unknown) {
  const key = typeof value === "string" ? value.trim() : "";
  return key.length >= 8 && key.length <= 120 ? key : null;
}

export function saveProjectAsTemplate(input: {
  companyId: number;
  membershipId: number;
  sourceProjectId: number;
  name: string;
  normalizedName: string;
  includeResourceAssignments: boolean;
  idempotencyKey: string;
}) {
  return db.transaction(() => {
    const replay = db.prepare(`
      SELECT id FROM project_template
      WHERE company_id = ? AND creation_idempotency_key = ? AND status = 'active'
    `).get(input.companyId, input.idempotencyKey) as { id: number } | undefined;
    if (replay) return { template: getProjectTemplate(replay.id, input.companyId)!, replayed: true };

    const source = db.prepare(`
      SELECT id, name, start_date FROM project
      WHERE id = ? AND company_id = ? AND status IN ('active', 'completed')
    `).get(input.sourceProjectId, input.companyId) as { id: number; name: string; start_date: string } | undefined;
    if (!source) throw new ProjectTemplateDomainError("TEMPLATE_SOURCE_NOT_FOUND", "Source Project not found.");

    const sourceTasks = db.prepare(`
      SELECT t.*, COALESCE(rc.name, (
        SELECT rc2.name FROM task_resource tr2
        JOIN resource r2 ON r2.id = tr2.resource_id AND r2.company_id = ?
        JOIN resource_category rc2 ON rc2.id = r2.category_id AND rc2.company_id = r2.company_id
        WHERE tr2.task_id = t.id
        ORDER BY r2.id LIMIT 1
      )) AS resource_category_name
      FROM task t
      LEFT JOIN resource_category rc ON rc.id = t.resource_category_id AND rc.company_id = ?
      WHERE t.project_id = ?
      ORDER BY t.sort_order, t.id
    `).all(input.companyId, input.companyId, source.id) as SourceTaskRow[];

    const sourceLinks = db.prepare(`
      SELECT tl.source_task_id, tl.target_task_id, tl.link_type, tl.lag_days
      FROM task_link tl
      JOIN task source_task ON source_task.id = tl.source_task_id AND source_task.project_id = tl.project_id
      JOIN task target_task ON target_task.id = tl.target_task_id AND target_task.project_id = tl.project_id
      WHERE tl.project_id = ?
      ORDER BY tl.id
    `).all(source.id) as Array<{ source_task_id: number; target_task_id: number; link_type: string; lag_days: number }>;
    if (sourceLinks.some(link => !["fs", "ss", "ff", "sf"].includes(link.link_type) || !Number.isInteger(link.lag_days) || link.lag_days < 0)) {
      throw new ProjectTemplateDomainError("TEMPLATE_SOURCE_PLAN_INVALID", "The source Project contains an invalid dependency.");
    }

    const resourcesByTask = new Map<number, number[]>();
    if (input.includeResourceAssignments) {
      const assignments = db.prepare(`
        SELECT tr.task_id, r.id AS resource_id
        FROM task_resource tr
        JOIN task t ON t.id = tr.task_id AND t.project_id = ?
        JOIN resource r ON r.id = tr.resource_id AND r.company_id = ?
        ORDER BY tr.task_id, r.id
      `).all(source.id, input.companyId) as Array<{ task_id: number; resource_id: number }>;
      for (const assignment of assignments) {
        resourcesByTask.set(assignment.task_id, [...(resourcesByTask.get(assignment.task_id) ?? []), assignment.resource_id]);
      }
    }

    const result = db.prepare(`
      INSERT INTO project_template (
        company_id, source_project_id, source_project_name, name, normalized_name,
        include_resource_assignments, created_by_membership_id, creation_idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.companyId,
      source.id,
      source.name,
      input.name,
      input.normalizedName,
      input.includeResourceAssignments ? 1 : 0,
      input.membershipId,
      input.idempotencyKey,
    );
    const templateId = Number(result.lastInsertRowid);
    const taskIds = new Set(sourceTasks.map(task => task.id));
    const insertTask = db.prepare(`
      INSERT INTO template_task (
        template_id, template_ref, parent_ref, name, is_header,
        relative_start_workdays, duration_workdays, allow_saturday, allow_sunday,
        color, resource_category_name, exact_resource_ids_json, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const task of sourceTasks) {
      if (task.parent_id && !taskIds.has(task.parent_id)) {
        throw new ProjectTemplateDomainError("TEMPLATE_SOURCE_PLAN_INVALID", `${task.name}: parent Task is outside the source Project.`);
      }
      let offset: number;
      try {
        offset = workingDayOffset(source.start_date, task.start_date, {
          allowSaturday: !!task.allow_saturday,
          allowSunday: !!task.allow_sunday,
        });
      } catch (error) {
        throw new ProjectTemplateDomainError(
          "TEMPLATE_SOURCE_PLAN_INVALID",
          error instanceof Error ? `${task.name}: ${error.message}` : `${task.name}: invalid schedule.`,
        );
      }
      const duration = Number(task.duration);
      if (!Number.isInteger(duration) || duration < 1) {
        throw new ProjectTemplateDomainError("TEMPLATE_SOURCE_PLAN_INVALID", `${task.name}: Duration must be at least one working day.`);
      }
      insertTask.run(
        templateId,
        String(task.id),
        task.parent_id && taskIds.has(task.parent_id) ? String(task.parent_id) : null,
        task.name,
        task.is_header ? 1 : 0,
        offset,
        duration,
        task.allow_saturday ? 1 : 0,
        task.allow_sunday ? 1 : 0,
        task.color || "#5599dd",
        task.resource_category_name,
        input.includeResourceAssignments ? JSON.stringify(resourcesByTask.get(task.id) ?? []) : null,
        Number(task.sort_order),
      );
    }

    const insertDependency = db.prepare(`
      INSERT INTO template_dependency (
        template_id, source_ref, target_ref, link_type, lag_workdays
      ) VALUES (?, ?, ?, ?, ?)
    `);
    for (const link of sourceLinks) {
      if (!taskIds.has(link.source_task_id) || !taskIds.has(link.target_task_id)) {
        throw new ProjectTemplateDomainError("TEMPLATE_SOURCE_PLAN_INVALID", "A dependency refers to a Task outside the source Project.");
      }
      const sourceTask = sourceTasks.find(task => task.id === link.source_task_id);
      const targetTask = sourceTasks.find(task => task.id === link.target_task_id);
      if (sourceTask?.is_header || targetTask?.is_header) {
        throw new ProjectTemplateDomainError("TEMPLATE_SOURCE_PLAN_INVALID", "Header Tasks cannot carry dependencies.");
      }
      insertDependency.run(templateId, String(link.source_task_id), String(link.target_task_id), link.link_type, link.lag_days);
    }
    calculateTemplateSchedule(templateTaskRows(templateId), templateDependencyRows(templateId), source.start_date);
    return { template: getProjectTemplate(templateId, input.companyId)!, replayed: false };
  })();
}

export function renameProjectTemplate(templateId: number, companyId: number, name: string, normalizedName: string) {
  const result = db.prepare(`
    UPDATE project_template
    SET name = ?, normalized_name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND company_id = ? AND status = 'active'
  `).run(name, normalizedName, templateId, companyId);
  return result.changes === 1 ? getProjectTemplate(templateId, companyId) : null;
}

export function deleteProjectTemplate(templateId: number, companyId: number) {
  const template = getProjectTemplate(templateId, companyId);
  if (!template) return null;
  db.prepare("DELETE FROM project_template WHERE id = ? AND company_id = ?").run(templateId, companyId);
  return template;
}

function dependencyConstraint(
  dependency: TemplateDependencyRow,
  source: ScheduledTemplateTask,
  target: TemplateTaskRow,
) {
  const rules = rulesFor(target);
  switch (dependency.link_type) {
    case "ss":
      return addWorkingDays(alignWorkingDay(source.startDate, rules, 1), dependency.lag_workdays, rules);
    case "ff": {
      const requiredEnd = addWorkingDays(alignWorkingDay(source.endDate, rules, 1), dependency.lag_workdays, rules);
      return startForWorkingDayEnd(requiredEnd, target.duration_workdays, rules);
    }
    case "sf": {
      const requiredEnd = addWorkingDays(alignWorkingDay(source.startDate, rules, 1), dependency.lag_workdays, rules);
      return startForWorkingDayEnd(requiredEnd, target.duration_workdays, rules);
    }
    case "fs":
    default:
      return addWorkingDays(addDays(source.endDate, 1), dependency.lag_workdays, rules);
  }
}

function validateTemplateHierarchy(tasks: TemplateTaskRow[]) {
  const byRef = new Map(tasks.map(task => [task.template_ref, task]));
  for (const task of tasks) {
    if (task.parent_ref && (!byRef.has(task.parent_ref) || !byRef.get(task.parent_ref)!.is_header)) {
      throw new ProjectTemplateDomainError("TEMPLATE_HIERARCHY_INVALID", `${task.name}: parent Header is missing or invalid.`);
    }
    const visited = new Set<string>([task.template_ref]);
    let parentRef = task.parent_ref;
    while (parentRef) {
      if (visited.has(parentRef)) throw new ProjectTemplateDomainError("TEMPLATE_HIERARCHY_INVALID", "The Template contains a hierarchy cycle.");
      visited.add(parentRef);
      parentRef = byRef.get(parentRef)?.parent_ref ?? null;
    }
  }
}

function calculateTemplateSchedule(tasks: TemplateTaskRow[], dependencies: TemplateDependencyRow[], projectStartDate: string) {
  validateTemplateHierarchy(tasks);
  const byRef = new Map(tasks.map(task => [task.template_ref, task]));
  const incoming = new Map<string, TemplateDependencyRow[]>();
  const outgoing = new Map<string, TemplateDependencyRow[]>();
  const indegree = new Map(tasks.map(task => [task.template_ref, 0]));
  for (const dependency of dependencies) {
    if (!byRef.has(dependency.source_ref) || !byRef.has(dependency.target_ref) || dependency.source_ref === dependency.target_ref) {
      throw new ProjectTemplateDomainError("TEMPLATE_GRAPH_INVALID", "The Template contains an invalid dependency reference.");
    }
    incoming.set(dependency.target_ref, [...(incoming.get(dependency.target_ref) ?? []), dependency]);
    outgoing.set(dependency.source_ref, [...(outgoing.get(dependency.source_ref) ?? []), dependency]);
    indegree.set(dependency.target_ref, (indegree.get(dependency.target_ref) ?? 0) + 1);
  }
  const queue = tasks.filter(task => indegree.get(task.template_ref) === 0).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const scheduled = new Map<string, ScheduledTemplateTask>();
  while (queue.length) {
    const task = queue.shift()!;
    const rules = rulesFor(task);
    let startDate = addWorkingDays(projectStartDate, task.relative_start_workdays, rules);
    for (const dependency of incoming.get(task.template_ref) ?? []) {
      const source = scheduled.get(dependency.source_ref);
      if (!source) throw new ProjectTemplateDomainError("TEMPLATE_GRAPH_INVALID", "The Template dependency graph could not be ordered.");
      const constrained = dependencyConstraint(dependency, source, task);
      if (constrained > startDate) startDate = constrained;
    }
    const endDate = workingDayEnd(startDate, task.duration_workdays, rules);
    scheduled.set(task.template_ref, { ...task, startDate, endDate });
    for (const dependency of outgoing.get(task.template_ref) ?? []) {
      const next = (indegree.get(dependency.target_ref) ?? 0) - 1;
      indegree.set(dependency.target_ref, next);
      if (next === 0) {
        queue.push(byRef.get(dependency.target_ref)!);
        queue.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      }
    }
  }
  if (scheduled.size !== tasks.length) {
    throw new ProjectTemplateDomainError("TEMPLATE_GRAPH_CYCLE", "The Template contains a dependency cycle.");
  }
  return scheduled;
}

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function instantiateProjectTemplate(input: {
  companyId: number;
  membershipId: number;
  legacyUserId: number | null;
  templateId: number;
  projectTypeId: number;
  projectName: string;
  startDate: string;
  clientName: string | null;
  idempotencyKey: string;
}) {
  if (!validIsoDate(input.startDate)) {
    throw new ProjectTemplateDomainError("VALIDATION_FAILED", "Choose a valid Project Start Date.", { startDate: "Choose a valid Project Start Date." });
  }
  if (!input.projectName || input.projectName.length > 100) {
    throw new ProjectTemplateDomainError("VALIDATION_FAILED", "Enter a Project name of 100 characters or fewer.", { name: "Enter a Project name of 100 characters or fewer." });
  }
  return db.transaction(() => {
    const replay = db.prepare(`
      SELECT project_id, warnings_json, copied_task_count
      FROM project_template_instantiation
      WHERE company_id = ? AND idempotency_key = ?
    `).get(input.companyId, input.idempotencyKey) as { project_id: number; warnings_json: string; copied_task_count: number } | undefined;
    if (replay) {
      return {
        projectId: replay.project_id,
        warnings: JSON.parse(replay.warnings_json) as string[],
        copiedTaskCount: replay.copied_task_count,
        replayed: true,
      };
    }

    const template = getProjectTemplate(input.templateId, input.companyId);
    if (!template) throw new ProjectTemplateDomainError("TEMPLATE_NOT_FOUND", "Template not found.");
    const projectTypeId = activeProjectTypeId(input.projectTypeId, input.companyId);
    if (!projectTypeId) throw new ProjectTemplateDomainError("PROJECT_TYPE_INVALID", "Choose a valid company Project Type.", { projectTypeId: "Choose a valid company Project Type." });
    const taskRows = templateTaskRows(template.id);
    const dependencyRows = templateDependencyRows(template.id);
    const scheduled = calculateTemplateSchedule(taskRows, dependencyRows, input.startDate);
    const warnings: string[] = [];

    const projectResult = db.prepare(`
      INSERT INTO project (
        company_id, project_type_id, name, client_name, start_date, end_date, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.companyId,
      projectTypeId,
      input.projectName,
      input.clientName,
      input.startDate,
      [...scheduled.values()].filter(task => !task.is_header).reduce<string | null>((maximum, task) => !maximum || task.endDate > maximum ? task.endDate : maximum, null),
      input.legacyUserId,
    );
    const projectId = Number(projectResult.lastInsertRowid);
    db.prepare("INSERT OR IGNORE INTO project_membership (project_id, company_membership_id) VALUES (?, ?)").run(projectId, input.membershipId);
    if (input.legacyUserId) db.prepare("INSERT OR IGNORE INTO project_user (project_id, user_id) VALUES (?, ?)").run(projectId, input.legacyUserId);

    const categoryByName = new Map((db.prepare(`
      SELECT id, lower(name) AS normalized_name FROM resource_category WHERE company_id = ?
    `).all(input.companyId) as Array<{ id: number; normalized_name: string }>).map(row => [row.normalized_name, row.id]));
    const taskIdByRef = new Map<string, number>();
    const insertTask = db.prepare(`
      INSERT INTO task (
        project_id, parent_id, name, start_date, duration, progress, color, is_header,
        start_by_mode, sort_order, allow_saturday, allow_sunday, resource_category_id
      ) VALUES (?, NULL, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const task of taskRows) {
      const schedule = scheduled.get(task.template_ref)!;
      const categoryId = task.resource_category_name
        ? categoryByName.get(task.resource_category_name.toLocaleLowerCase("en-US")) ?? null
        : null;
      if (!categoryId && !task.is_header) {
        warnings.push(`${task.name}: assign a valid Resource Category before scheduling Resources.`);
      }
      const result = insertTask.run(
        projectId,
        task.name,
        schedule.startDate,
        task.duration_workdays,
        task.color,
        task.is_header ? 1 : 0,
        (dependencyRows.some(link => link.target_ref === task.template_ref) ? "linked" : "time_period"),
        task.sort_order,
        task.allow_saturday ? 1 : 0,
        task.allow_sunday ? 1 : 0,
        categoryId,
      );
      taskIdByRef.set(task.template_ref, Number(result.lastInsertRowid));
    }
    const setParent = db.prepare("UPDATE task SET parent_id = ? WHERE id = ? AND project_id = ?");
    for (const task of taskRows) {
      if (!task.parent_ref) continue;
      const parentId = taskIdByRef.get(task.parent_ref);
      if (!parentId) throw new ProjectTemplateDomainError("TEMPLATE_HIERARCHY_INVALID", `${task.name}: parent Header is missing.`);
      setParent.run(parentId, taskIdByRef.get(task.template_ref), projectId);
    }
    const insertLink = db.prepare(`
      INSERT INTO task_link (project_id, source_task_id, target_task_id, link_type, lag_days)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const dependency of dependencyRows) {
      insertLink.run(
        projectId,
        taskIdByRef.get(dependency.source_ref),
        taskIdByRef.get(dependency.target_ref),
        dependency.link_type,
        dependency.lag_workdays,
      );
    }

    if (template.includeResourceAssignments) {
      const getResource = db.prepare(`
        SELECT id, status FROM resource WHERE id = ? AND company_id = ?
      `);
      const assignResource = db.prepare("INSERT OR IGNORE INTO task_resource (task_id, resource_id) VALUES (?, ?)");
      for (const task of taskRows) {
        const targetTaskId = taskIdByRef.get(task.template_ref)!;
        for (const resourceId of parseResourceIds(task.exact_resource_ids_json)) {
          const resource = getResource.get(resourceId, input.companyId) as { id: number; status: string } | undefined;
          if (!resource || resource.status !== "active") {
            warnings.push(`${task.name}: an inactive or missing saved Resource was omitted.`);
            continue;
          }
          assignResource.run(targetTaskId, resource.id);
        }
      }
    }

    db.prepare(`
      INSERT INTO project_template_instantiation (
        company_id, template_id, project_id, idempotency_key, warnings_json, copied_task_count
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(input.companyId, template.id, projectId, input.idempotencyKey, JSON.stringify(warnings), taskRows.length);
    return { projectId, warnings, copiedTaskCount: taskRows.length, replayed: false };
  })();
}
