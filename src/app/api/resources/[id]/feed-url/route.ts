import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { getResourceToken } from "@/lib/ical";

// Returns the personal calendar link for one resource.
// Allowed: any admin of the resource's company, OR the user that resource is linked to.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resource = db.prepare(
    "SELECT id, company_id, linked_user_id FROM resource WHERE id = ?",
  ).get(Number(id)) as any;
  if (!resource || resource.company_id !== user.company_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const isAdminUser = user.user_type === "admin";
  const isOwnResource = resource.linked_user_id === user.id;
  if (!isAdminUser && !isOwnResource) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = getResourceToken(Number(id));
  const url = `${req.nextUrl.origin}/api/ical/${token}.ics`;
  return NextResponse.json({ url });
}
