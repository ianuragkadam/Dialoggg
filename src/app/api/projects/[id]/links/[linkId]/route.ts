import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { requireAdmin } from "@/lib/guard";

function ensureMembership(projectId: number, companyId: number | null) {
  const p = db.prepare("SELECT id FROM project WHERE id = ? AND company_id = ?").get(projectId, companyId);
  return !!p;
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const { id, linkId } = await params;
  const g = await requireAdmin();
  if ("error" in g) return g.error;
  const user = g.user;
  if (!ensureMembership(Number(id), user.company_id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  db.prepare("DELETE FROM task_link WHERE id = ? AND project_id = ?").run(Number(linkId), Number(id));
  return NextResponse.json({ ok: true });
}
