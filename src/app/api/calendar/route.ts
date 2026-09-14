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
  const projectWhere = projectFilter ? "AND p.id = ?" : "";
  const projectArg: any[] = projectFilter ? [Number(projectFilter)] : [];

  const events = db.prepare(`
    SELECT e.*, p.name AS project_name FROM event e
    JOIN project p ON p.id = e.project_id
    WHERE p.company_id = ? ${projectWhere}
  `).all(user.company_id, ...projectArg) as any[];

  const tasks = db.prepare(`
    SELECT t.*, p.name AS project_name FROM task t
    JOIN project p ON p.id = t.project_id
    WHERE p.company_id = ? AND t.is_header = 0 ${projectWhere}
  `).all(user.company_id, ...projectArg) as any[];

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
