import { NextResponse } from "next/server";

import db from "@/db";
import { getCurrentActor } from "@/lib/auth";

export async function GET() {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.contextType !== "company" || !actor.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const projectTypes = db.prepare(`
    SELECT id, name FROM project_type
    WHERE company_id = ? AND status = 'active'
    ORDER BY lower(name), id
  `).all(actor.companyId) as Array<{ id: number; name: string }>;

  return NextResponse.json({ projectTypes }, { headers: { "cache-control": "no-store" } });
}
