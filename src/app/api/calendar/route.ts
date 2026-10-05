import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { canViewProject } from "@/lib/authorization";
import { addDays, workingDayEnd } from "@/lib/dates";
import { EventDomainError, listEventOccurrences } from "@/lib/events-calendar";

const noStore = { "cache-control": "no-store" };

export async function GET(request: NextRequest) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  if (actor.contextType !== "company" || !actor.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });

  const projectValue = request.nextUrl.searchParams.get("project_id");
  const projectId = projectValue ? Number(projectValue) : null;
  if (projectValue && (!Number.isInteger(projectId) || Number(projectId) <= 0)) return NextResponse.json({ error: "Invalid project_id" }, { status: 400, headers: noStore });
  if (actor.companyRole === "external" && (!projectId || !canViewProject(actor, projectId))) {
    return NextResponse.json({ error: projectId ? "Not found" : "Company-wide calendars are unavailable." }, { status: projectId ? 404 : 403, headers: noStore });
  }

  const projectTypeIds = [...new Set(request.nextUrl.searchParams.getAll("project_type_id").map(Number))];
  if (projectTypeIds.some(value => !Number.isInteger(value) || value <= 0)) return NextResponse.json({ error: "Invalid project_type_id" }, { status: 400, headers: noStore });
  if (projectTypeIds.length) {
    const placeholders = projectTypeIds.map(() => "?").join(",");
    const found = (db.prepare(`SELECT COUNT(*) count FROM project_type WHERE company_id=? AND status='active' AND id IN (${placeholders})`)
      .get(actor.companyId, ...projectTypeIds) as { count: number }).count;
    if (found !== projectTypeIds.length) return NextResponse.json({ error: "Invalid project_type_id" }, { status: 400, headers: noStore });
  }

  const includeCompleted = request.nextUrl.searchParams.get("include_completed") === "true";
  const now = new Date();
  const rangeStart = request.nextUrl.searchParams.get("start") || new Date(now.getTime() - 366 * 86400000).toISOString();
  const rangeEnd = request.nextUrl.searchParams.get("end") || new Date(now.getTime() + 732 * 86400000).toISOString();
  if (!Number.isFinite(Date.parse(rangeStart)) || !Number.isFinite(Date.parse(rangeEnd)) || rangeEnd <= rangeStart) {
    return NextResponse.json({ error: "Invalid calendar range" }, { status: 400, headers: noStore });
  }

  try {
    const occurrences = listEventOccurrences(actor, { rangeStart, rangeEnd, projectId, projectTypeIds, includeCompleted });
    const conditions = ["p.company_id=?", "t.is_header=0"];
    const args: Array<number> = [actor.companyId];
    if (projectId) { conditions.push("p.id=?"); args.push(projectId); }
    if (projectTypeIds.length) { conditions.push(`p.project_type_id IN (${projectTypeIds.map(() => "?").join(",")})`); args.push(...projectTypeIds); }
    if (!includeCompleted) conditions.push("p.status='active'");
    if (actor.companyRole === "external") {
      conditions.push("t.external_visible=1", "EXISTS (SELECT 1 FROM project_membership pm WHERE pm.project_id=p.id AND pm.company_membership_id=?)");
      args.push(actor.membershipId!);
    }
    const tasks = db.prepare(`SELECT t.id,t.name,t.start_date,t.duration,t.allow_saturday,t.allow_sunday,
      p.id project_id,p.name project_name,p.calendar_color project_calendar_color
      FROM task t JOIN project p ON p.id=t.project_id WHERE ${conditions.join(" AND ")}`)
      .all(...args) as Array<{ id: number; name: string; start_date: string; duration: number; allow_saturday: number; allow_sunday: number; project_id: number; project_name: string; project_calendar_color: string }>;

    return NextResponse.json({ events: [
      ...occurrences.map(item => ({
        id: item.id,
        title: item.projectName ? `${item.title} (${item.projectName})` : item.title,
        start: item.start,
        end: item.end,
        allDay: item.allDay,
        color: item.color,
        editable: actor.companyRole !== "external",
        extendedProps: {
          kind: "event", rawTitle: item.title, seriesId: item.seriesId, occurrenceKey: item.occurrenceKey,
          project_id: item.projectId, resourceIds: actor.companyRole === "external" ? undefined : item.resourceIds,
          version: item.version, recurring: item.recurring, timeZone: item.timeZone,
        },
      })),
      ...tasks.map(task => ({
        id: `task:${task.id}`,
        title: `${task.name} (${task.project_name})`,
        start: task.start_date,
        end: addDays(workingDayEnd(task.start_date, task.duration, { allowSaturday: !!task.allow_saturday, allowSunday: !!task.allow_sunday }), 1),
        allDay: true,
        // Master Calendar uses the project color; each Task keeps its independent Gantt color.
        color: task.project_calendar_color || "#3B417D",
        editable: false,
        extendedProps: { kind: "task", taskId: task.id, project_id: task.project_id },
      })),
    ] }, { headers: noStore });
  } catch (error) {
    const domain = error instanceof EventDomainError ? error : new EventDomainError("CALENDAR_READ_FAILED", "The calendar could not be loaded.", 503);
    return NextResponse.json({ error: { code: domain.code, message: domain.message } }, { status: domain.status, headers: noStore });
  }
}
