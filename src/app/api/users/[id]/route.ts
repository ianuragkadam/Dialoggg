import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { requireAdmin } from "@/lib/guard";

// Change a user's role, or remove them. Admins only, and you can't lock yourself out.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireAdmin();
  if ("error" in g) return g.error;
  const me = g.user;
  const targetId = Number(id);
  const body = await req.json();
  const role = body.role === "admin" ? "admin" : "viewer";

  const target = db.prepare("SELECT id, company_id FROM user WHERE id = ?").get(targetId) as any;
  if (!target || target.company_id !== me.company_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (targetId === me.id && role !== "admin") {
    return NextResponse.json({ error: "You can't remove your own admin access." }, { status: 400 });
  }
  db.prepare("UPDATE user SET user_type = ? WHERE id = ?").run(role, targetId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireAdmin();
  if ("error" in g) return g.error;
  const me = g.user;
  const targetId = Number(id);
  if (targetId === me.id) {
    return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });
  }
  const target = db.prepare("SELECT id, company_id FROM user WHERE id = ?").get(targetId) as any;
  if (!target || target.company_id !== me.company_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  db.prepare("DELETE FROM session WHERE user_id = ?").run(targetId);
  db.prepare("DELETE FROM user WHERE id = ?").run(targetId);
  return NextResponse.json({ ok: true });
}
