import db from "@/db";
import { workingDayEnd } from "@/lib/dates";
import {
  RESOURCE_CATEGORIES,
  type ResourceAssignmentUi,
  type ResourceCategoryUi,
  type ResourceDirectoryUi,
  type ResourceUi,
  type ResourceUserOptionUi,
} from "@/lib/resources-ui";

type ResourceRow = {
  id: number;
  company_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  status: "active" | "inactive";
  version: number;
  category: ResourceCategoryUi;
  linked_membership_id: number | null;
  linked_first_name: string | null;
  linked_last_name: string | null;
  linked_email: string | null;
};

type AssignmentInterval = ResourceAssignmentUi & { start: number; end: number; activeForConflict: boolean };

export class ResourceValidationError extends Error {
  constructor(public fields: Record<string, string>) {
    super("RESOURCE_VALIDATION_FAILED");
  }
}

export class ResourceEmailConflictError extends Error {
  constructor() {
    super("EMAIL_ALREADY_IN_USE");
  }
}

function validateResourceEmailAvailability(emailValue: string, linkedMembershipId: number | null, resourceId?: number) {
  const email = emailValue.trim().toLocaleLowerCase("en-US");
  if (!email) return;

  const identity = db.prepare("SELECT id FROM identity WHERE normalized_email = ? COLLATE NOCASE LIMIT 1").get(email) as { id: number } | undefined;
  if (identity) {
    const linkedToIdentity = linkedMembershipId
      ? db.prepare("SELECT 1 FROM company_membership WHERE id = ? AND identity_id = ? LIMIT 1").get(linkedMembershipId, identity.id)
      : undefined;
    if (!linkedToIdentity) throw new ResourceEmailConflictError();
  }

  const duplicateResource = db.prepare(`
    SELECT 1 FROM resource
    WHERE lower(trim(COALESCE(email, ''))) = ? AND id IS NOT ? LIMIT 1
  `).get(email, resourceId ?? null);
  if (duplicateResource) throw new ResourceEmailConflictError();
}

export function normalizeResourceName(value: unknown) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return { name, normalizedName: name.toLocaleLowerCase("en-US") };
}

export function validateResourceInput(input: { name: string; category: unknown; email: string; phone: string }) {
  const fields: Record<string, string> = {};
  if (!input.name) fields.name = "Enter the Resource Name.";
  else if (input.name.length > 120) fields.name = "Use 120 characters or fewer.";
  if (!RESOURCE_CATEGORIES.includes(input.category as ResourceCategoryUi)) fields.category = "Choose one fixed Resource Category.";
  if (input.email && !/^\S+@\S+\.\S+$/.test(input.email)) fields.email = "Enter a valid contact email or leave it blank.";
  else if (input.email.length > 254) fields.email = "Use 254 characters or fewer.";
  if (input.phone.length > 40) fields.phone = "Use 40 characters or fewer.";
  return fields;
}

function resourceRow(resourceId: number, companyId: number) {
  return db.prepare(`
    SELECT r.id, r.company_id, r.name, r.email, r.phone, r.status, r.version,
      rc.name AS category, r.linked_membership_id,
      i.first_name AS linked_first_name, i.last_name AS linked_last_name,
      i.normalized_email AS linked_email
    FROM resource r
    JOIN resource_category rc ON rc.id = r.category_id AND rc.company_id = r.company_id
    LEFT JOIN company_membership cm ON cm.id = r.linked_membership_id AND cm.company_id = r.company_id
    LEFT JOIN identity i ON i.id = cm.identity_id
    WHERE r.id = ? AND r.company_id = ?
  `).get(resourceId, companyId) as ResourceRow | undefined;
}

function dateValue(value: string | null, endOfDay = false) {
  if (!value) return 0;
  const suffix = /^\d{4}-\d{2}-\d{2}$/.test(value) ? (endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z") : "";
  const parsed = Date.parse(`${value}${suffix}`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function displayDate(value: string | null) {
  if (!value) return "Unscheduled";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function assignmentsForResource(resourceId: number, companyId: number): ResourceAssignmentUi[] {
  const taskRows = db.prepare(`
    SELECT t.id, t.name, t.start_date, t.duration, t.allow_saturday, t.allow_sunday,
      p.name AS project_name, p.status AS project_status
    FROM task_resource tr
    JOIN task t ON t.id = tr.task_id
    JOIN project p ON p.id = t.project_id
    WHERE tr.resource_id = ? AND p.company_id = ?
    ORDER BY t.start_date, t.id
  `).all(resourceId, companyId) as Array<{ id: number; name: string; start_date: string; duration: number; allow_saturday: number; allow_sunday: number; project_name: string; project_status: string }>;
  const eventRows = db.prepare(`
    SELECT es.id, es.title, es.timing_mode, es.start_date, es.end_date, es.start_at, es.end_at,
      COALESCE(p.name, 'Company calendar') AS project_name, es.project_id, p.status AS project_status
    FROM event_resource er
    JOIN event_series es ON es.id = er.series_id
    LEFT JOIN project p ON p.id = es.project_id AND p.company_id = es.company_id
    WHERE er.resource_id = ? AND es.company_id = ?
    ORDER BY COALESCE(es.start_at, es.start_date), es.id
  `).all(resourceId, companyId) as Array<{
    id: number; title: string; timing_mode: "all_day" | "timed"; start_date: string | null; end_date: string | null;
    start_at: string | null; end_at: string | null; project_name: string; project_id: number | null; project_status: string | null;
  }>;

  const intervals: AssignmentInterval[] = [
    ...taskRows.map(task => {
      const endDate = workingDayEnd(task.start_date, task.duration, { allowSaturday: !!task.allow_saturday, allowSunday: !!task.allow_sunday });
      return {
        id: task.id, kind: "Task" as const, title: task.name, project: task.project_name,
        timing: `${displayDate(task.start_date)} – ${displayDate(endDate)} · All day`, conflict: false,
        start: dateValue(task.start_date), end: dateValue(endDate, true), activeForConflict: task.project_status === "active",
      };
    }),
    ...eventRows.map(event => {
      const startValue = event.timing_mode === "timed" ? event.start_at : event.start_date;
      const endValue = event.timing_mode === "timed" ? event.end_at : event.end_date || event.start_date;
      return {
        id: event.id, kind: "Event" as const, title: event.title, project: event.project_name,
        timing: event.timing_mode === "timed"
          ? `${displayDate(event.start_at)} – ${displayDate(event.end_at)}`
          : `${displayDate(event.start_date)} – ${displayDate(event.end_date || event.start_date)} · All day`,
        conflict: false, start: dateValue(startValue), end: dateValue(endValue, event.timing_mode === "all_day"),
        activeForConflict: event.project_id === null || event.project_status === "active",
      };
    }),
  ];
  for (let left = 0; left < intervals.length; left += 1) {
    for (let right = left + 1; right < intervals.length; right += 1) {
      if (intervals[left].activeForConflict && intervals[right].activeForConflict && intervals[left].start < intervals[right].end && intervals[right].start < intervals[left].end) {
        intervals[left].conflict = true;
        intervals[right].conflict = true;
      }
    }
  }
  return intervals
    .sort((a, b) => a.start - b.start || a.kind.localeCompare(b.kind) || a.id - b.id)
    .map(({ start: _start, end: _end, activeForConflict: _activeForConflict, ...assignment }) => assignment);
}

function toDto(row: ResourceRow): ResourceUi {
  const linkedUser = row.linked_membership_id ? {
    id: row.linked_membership_id,
    name: `${row.linked_first_name ?? ""} ${row.linked_last_name ?? ""}`.trim(),
    email: row.linked_email ?? "",
  } : null;
  return {
    id: row.id, name: row.name, category: row.category, status: row.status,
    email: row.email ?? "", phone: row.phone ?? "", linkedUser,
    assignments: assignmentsForResource(row.id, row.company_id), version: row.version,
  };
}

export function listResources(companyId: number): ResourceUi[] {
  const rows = db.prepare(`SELECT id FROM resource WHERE company_id = ? ORDER BY id DESC`).all(companyId) as Array<{ id: number }>;
  return rows.map(row => getResource(row.id, companyId)).filter((value): value is ResourceUi => !!value);
}

export function getResource(resourceId: number, companyId: number) {
  const row = resourceRow(resourceId, companyId);
  return row ? toDto(row) : null;
}

export function listAvailableResourceUsers(companyId: number, currentResourceId?: number): ResourceUserOptionUi[] {
  return db.prepare(`
    SELECT cm.id, i.first_name, i.last_name, i.normalized_email
    FROM company_membership cm
    JOIN identity i ON i.id = cm.identity_id
    LEFT JOIN resource linked ON linked.linked_membership_id = cm.id
    WHERE cm.company_id = ? AND (
      (cm.status IN ('pending','active') AND linked.id IS NULL) OR linked.id = ?
    )
    ORDER BY lower(i.first_name), lower(i.last_name), lower(i.normalized_email), cm.id
  `).all(companyId, currentResourceId ?? -1).map((row: any) => ({
    id: Number(row.id), name: `${row.first_name} ${row.last_name}`.trim(), email: String(row.normalized_email),
  }));
}

export function resourceDirectory(companyId: number): ResourceDirectoryUi {
  return { resources: listResources(companyId), categories: RESOURCE_CATEGORIES, availableUsers: listAvailableResourceUsers(companyId) };
}

function categoryId(companyId: number, category: ResourceCategoryUi) {
  const row = db.prepare(`SELECT id FROM resource_category WHERE company_id = ? AND name = ?`).get(companyId, category) as { id: number } | undefined;
  if (!row) throw new Error("RESOURCE_CATEGORY_MISSING");
  return row.id;
}

function validateLinkedMembership(companyId: number, membershipId: number | null, resourceId?: number) {
  if (!membershipId) return;
  const row = db.prepare(`
    SELECT cm.id, linked.id AS linked_resource_id
    FROM company_membership cm
    LEFT JOIN resource linked ON linked.linked_membership_id = cm.id
    WHERE cm.id = ? AND cm.company_id = ?
      AND (cm.status IN ('pending','active') OR linked.id = ?)
  `).get(membershipId, companyId, resourceId ?? -1) as { id: number; linked_resource_id: number | null } | undefined;
  if (!row) throw new ResourceValidationError({ linkedMembershipId: "Choose an available User from this company." });
  if (row.linked_resource_id && row.linked_resource_id !== resourceId) {
    throw new ResourceValidationError({ linkedMembershipId: "That User is already linked to another Resource." });
  }
}

export function createResource(companyId: number, input: {
  name: string; normalizedName: string; category: ResourceCategoryUi; email: string; phone: string; linkedMembershipId: number | null;
}) {
  validateLinkedMembership(companyId, input.linkedMembershipId);
  validateResourceEmailAvailability(input.email, input.linkedMembershipId);
  const result = db.prepare(`
    INSERT INTO resource (
      company_id, category_id, name, normalized_name, email, phone, linked_membership_id,
      status, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(companyId, categoryId(companyId, input.category), input.name, input.normalizedName, input.email || null, input.phone || null, input.linkedMembershipId);
  return getResource(Number(result.lastInsertRowid), companyId)!;
}

export function updateResource(resourceId: number, companyId: number, input: {
  name: string; normalizedName: string; category: ResourceCategoryUi; email: string; phone: string; linkedMembershipId: number | null; version: number;
}) {
  validateLinkedMembership(companyId, input.linkedMembershipId, resourceId);
  validateResourceEmailAvailability(input.email, input.linkedMembershipId, resourceId);
  const result = db.prepare(`
    UPDATE resource SET category_id = ?, name = ?, normalized_name = ?, email = ?, phone = ?,
      linked_membership_id = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND company_id = ? AND version = ?
  `).run(categoryId(companyId, input.category), input.name, input.normalizedName, input.email || null, input.phone || null,
    input.linkedMembershipId, resourceId, companyId, input.version);
  return result.changes === 1 ? getResource(resourceId, companyId) : null;
}

export function setResourceLifecycle(resourceId: number, companyId: number, action: "deactivate" | "restore", version: number) {
  const current = resourceRow(resourceId, companyId);
  if (!current) return null;
  const expected = action === "deactivate" ? "active" : "inactive";
  const next = action === "deactivate" ? "inactive" : "active";
  if (current.status !== expected) throw new Error("RESOURCE_STATE_INVALID");
  const result = db.prepare(`
    UPDATE resource SET status = ?, deactivated_at = CASE WHEN ? = 'inactive' THEN CURRENT_TIMESTAMP ELSE NULL END,
      version = version + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND company_id = ? AND version = ?
  `).run(next, next, resourceId, companyId, version);
  return result.changes === 1 ? getResource(resourceId, companyId) : null;
}

function integerIds(value: unknown) {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.map(Number))];
  return ids.every(id => Number.isInteger(id) && id > 0) ? ids : null;
}

export function parseAssignmentIds(taskIds: unknown, eventSeriesIds: unknown) {
  const tasks = integerIds(taskIds);
  const events = integerIds(eventSeriesIds);
  return tasks && events ? { taskIds: tasks, eventSeriesIds: events } : null;
}

export function setResourceAssignments(resourceId: number, companyId: number, taskIds: number[], eventSeriesIds: number[]) {
  const resource = resourceRow(resourceId, companyId);
  if (!resource) return null;
  const validateIds = (table: "task" | "event_series", ids: number[]) => {
    if (!ids.length) return;
    const placeholders = ids.map(() => "?").join(",");
    const sql = table === "task"
      ? `SELECT COUNT(*) AS count FROM task t JOIN project p ON p.id = t.project_id WHERE p.company_id = ? AND t.id IN (${placeholders})`
      : `SELECT COUNT(*) AS count FROM event_series WHERE company_id = ? AND id IN (${placeholders})`;
    const found = db.prepare(sql).get(companyId, ...ids) as { count: number };
    if (found.count !== ids.length) throw new Error("RESOURCE_ASSIGNMENT_SCOPE_INVALID");
  };
  validateIds("task", taskIds);
  validateIds("event_series", eventSeriesIds);
  const currentTaskIds = new Set((db.prepare("SELECT task_id FROM task_resource WHERE resource_id = ?").all(resourceId) as Array<{ task_id: number }>).map(row => row.task_id));
  const currentEventIds = new Set((db.prepare("SELECT series_id FROM event_resource WHERE resource_id = ?").all(resourceId) as Array<{ series_id: number }>).map(row => row.series_id));
  const hasAdditions = taskIds.some(id => !currentTaskIds.has(id)) || eventSeriesIds.some(id => !currentEventIds.has(id));
  if (hasAdditions && resource.status !== "active") throw new Error("RESOURCE_INACTIVE");
  db.transaction(() => {
    const keepTasks = new Set(taskIds);
    const keepEvents = new Set(eventSeriesIds);
    const removeTask = db.prepare("DELETE FROM task_resource WHERE task_id = ? AND resource_id = ?");
    const removeEvent = db.prepare("DELETE FROM event_resource WHERE series_id = ? AND resource_id = ?");
    for (const id of currentTaskIds) if (!keepTasks.has(id)) removeTask.run(id, resourceId);
    for (const id of currentEventIds) if (!keepEvents.has(id)) removeEvent.run(id, resourceId);
    const addTask = db.prepare("INSERT OR IGNORE INTO task_resource (task_id, resource_id) VALUES (?, ?)");
    const addEvent = db.prepare("INSERT OR IGNORE INTO event_resource (series_id, resource_id) VALUES (?, ?)");
    for (const id of taskIds) if (!currentTaskIds.has(id)) addTask.run(id, resourceId);
    for (const id of eventSeriesIds) if (!currentEventIds.has(id)) addEvent.run(id, resourceId);
  })();
  return getResource(resourceId, companyId)!;
}
