import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin } from "@/lib/guard";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = db.prepare(
    "SELECT * FROM project WHERE id = ? AND company_id = ?",
  ).get(Number(id), user.company_id);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ project: p });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireAdmin();
  if ("error" in g) return g.error;
  const user = g.user;
  const body = await req.json();
  db.prepare(
    `UPDATE project SET name=?, status=?, client_name=?, client_email=?, address=?, city=?, state=?, zip=?, phone=?, start_date=?, end_date=?, note=?
     WHERE id=? AND company_id=?`,
  ).run(
    body.name, body.status || "active", body.client_name, body.client_email,
    body.address, body.city, body.state, body.zip, body.phone,
    body.start_date, body.end_date, body.note,
    Number(id), user.company_id,
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireAdmin();
  if ("error" in g) return g.error;
  const user = g.user;
  db.prepare("DELETE FROM project WHERE id = ? AND company_id = ?").run(Number(id), user.company_id);
  return NextResponse.json({ ok: true });
}
