import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { canViewProject } from "@/lib/authorization";
import { addDays, workingDayEnd } from "@/lib/dates";

export async function GET(req: NextRequest) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.contextType !== "company" || !actor.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const projectFilter = req.nextUrl.searchParams.get("project_id");
  const projectId = projectFilter ? Number(projectFilter) : null;
  if (projectFilter && (!Number.isInteger(projectId) || Number(projectId) <= 0)) {
    return NextResponse.json({ error: "Invalid project_id" }, { status: 400 });
  }
  if (actor.companyRole === "external" && (!projectId || !canViewProject(actor, projectId))) {
    return NextResponse.json({ error: projectId ? "Not found" : "Company-wide calendars are unavailable." }, { status: projectId ? 404 : 403 });
  }
  const suppliedTypeIds = req.nextUrl.searchParams.getAll("project_type_id");
  const parsedTypeIds = suppliedTypeIds.map(Number);
  const projectTypeIds = [...new Set(parsedTypeIds)];
  if (parsedTypeIds.some(value => !Number.isInteger(value) || value <= 0)) {
    return NextResponse.json({ error: "Invalid project_type_id" }, { status: 400 });
  }
  if (projectTypeIds.length) {
    const placeholders = projectTypeIds.map(() => "?").join(",");
    const found = db.prepare(`SELECT COUNT(*) AS count FROM project_type WHERE company_id = ? AND status = 'active' AND id IN (${placeholders})`).get(actor.companyId, ...projectTypeIds) as { count: number };
    if (found.count !== projectTypeIds.length) return NextResponse.json({ error: "Invalid project_type_id" }, { status: 400 });
  }
  const conditions = ["p.company_id = ?"];
  const args: Array<number | null> = [actor.companyId];
  if (projectId) { conditions.push("p.id = ?"); args.push(projectId); }
  if (projectTypeIds.length) {
    conditions.push(`p.project_type_id IN (${projectTypeIds.map(() => "?").join(",")})`);
    args.push(...projectTypeIds);
  }
  const where = conditions.join(" AND ");

  const events = db.prepare(`
    SELECT e.id, e.title, e.start_date, e.end_date, e.color, p.name AS project_name FROM event e
    JOIN project p ON p.id = e.project_id
    WHERE ${where} ${actor.companyRole === "external" ? "AND e.external_visible = 1" : ""}
  `).all(...args) as any[];

  const tasks = db.prepare(`
    SELECT t.id, t.name, t.start_date, t.duration, t.color, t.allow_saturday, t.allow_sunday,
      p.name AS project_name FROM task t
    JOIN project p ON p.id = t.project_id
    WHERE ${where} AND t.is_header = 0 ${actor.companyRole === "external" ? "AND t.external_visible = 1" : ""}
  `).all(...args) as any[];

  return NextResponse.json({
    events: [
      ...events.map(e => ({
        id: `e${e.id}`, title: `${e.title} (${e.project_name})`,
        start: e.start_date, end: addDays(e.end_date || e.start_date, 1),
        color: e.color || "#7f8c8d",
      })),
      ...tasks.map(t => ({
        id: `t${t.id}`, title: `${t.name} (${t.project_name})`,
        start: t.start_date,
        end: addDays(workingDayEnd(t.start_date, t.duration, { allowSaturday: !!t.allow_saturday, allowSunday: !!t.allow_sunday }), 1),
        color: t.color,
      })),
    ],
  });
}
