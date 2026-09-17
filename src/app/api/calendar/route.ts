import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentUser } from "@/lib/auth";

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectFilter = req.nextUrl.searchParams.get("project_id");
  const projectId = projectFilter ? Number(projectFilter) : null;
  if (projectFilter && (!Number.isInteger(projectId) || Number(projectId) <= 0)) {
    return NextResponse.json({ error: "Invalid project_id" }, { status: 400 });
  }
  const suppliedTypeIds = req.nextUrl.searchParams.getAll("project_type_id");
  const parsedTypeIds = suppliedTypeIds.map(Number);
  const projectTypeIds = [...new Set(parsedTypeIds)];
  if (parsedTypeIds.some(value => !Number.isInteger(value) || value <= 0)) {
    return NextResponse.json({ error: "Invalid project_type_id" }, { status: 400 });
  }
  if (projectTypeIds.length) {
    const placeholders = projectTypeIds.map(() => "?").join(",");
    const found = db.prepare(`SELECT COUNT(*) AS count FROM project_type WHERE company_id = ? AND status = 'active' AND id IN (${placeholders})`).get(user.company_id, ...projectTypeIds) as { count: number };
    if (found.count !== projectTypeIds.length) return NextResponse.json({ error: "Invalid project_type_id" }, { status: 400 });
  }
  const conditions = ["p.company_id = ?"];
  const args: Array<number | null> = [user.company_id];
  if (projectId) { conditions.push("p.id = ?"); args.push(projectId); }
  if (projectTypeIds.length) {
    conditions.push(`p.project_type_id IN (${projectTypeIds.map(() => "?").join(",")})`);
    args.push(...projectTypeIds);
  }
  const where = conditions.join(" AND ");

  const events = db.prepare(`
    SELECT e.*, p.name AS project_name FROM event e
    JOIN project p ON p.id = e.project_id
    WHERE ${where}
  `).all(...args) as any[];

  const tasks = db.prepare(`
    SELECT t.*, p.name AS project_name FROM task t
    JOIN project p ON p.id = t.project_id
    WHERE ${where} AND t.is_header = 0
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
        start: t.start_date, end: addDays(t.start_date, t.duration),
        color: t.color,
      })),
    ],
  });
}
