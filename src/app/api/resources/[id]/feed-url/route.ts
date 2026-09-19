import { NextRequest, NextResponse } from "next/server";

import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { getResourceToken } from "@/lib/ical";

// Allowed: an Owner/Admin in the Resource company, or the company membership
// linked one-to-one to that Resource. External memberships cannot access it.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.contextType !== "company" || !actor.companyId || !actor.membershipId || actor.companyRole === "external") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const resourceId = Number((await params).id);
  const resource = Number.isInteger(resourceId) ? db.prepare(`
    SELECT id, linked_membership_id FROM resource WHERE id = ? AND company_id = ?
  `).get(resourceId, actor.companyId) as { id: number; linked_membership_id: number | null } | undefined : undefined;
  if (!resource) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const canManage = actor.companyRole === "owner" || actor.companyRole === "admin";
  if (!canManage && resource.linked_membership_id !== actor.membershipId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = `${request.nextUrl.origin}/api/ical/${getResourceToken(resource.id)}.ics`;
  return NextResponse.json({ url }, { headers: { "cache-control": "no-store" } });
}
