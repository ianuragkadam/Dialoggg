import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin } from "@/lib/guard";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = db.prepare(
    "SELECT * FROM project WHERE company_id = ? ORDER BY created_at DESC",
  ).all(user.company_id);
  return NextResponse.json({ projects: rows });
}

export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if ("error" in g) return g.error;
  const user = g.user;
  const body = await req.json();
  if (!body.name || !body.start_date) {
    return NextResponse.json({ error: "Name and start_date required" }, { status: 400 });
  }
  const r = db.prepare(
    `INSERT INTO project (company_id, name, client_name, client_email, address, city, state, zip, phone, start_date, end_date, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    user.company_id, body.name, body.client_name || null, body.client_email || null,
    body.address || null, body.city || null, body.state || null, body.zip || null,
    body.phone || null, body.start_date, body.end_date || null, body.note || null,
    user.id,
  );
  const projectId = r.lastInsertRowid as number;
  // Auto-assign creator so it shows up in their "My Projects"
  db.prepare("INSERT INTO project_user (project_id, user_id) VALUES (?, ?)").run(projectId, user.id);
  return NextResponse.json({ id: projectId });
}
