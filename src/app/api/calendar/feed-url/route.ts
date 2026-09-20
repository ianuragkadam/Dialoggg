import { NextRequest, NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import { getCompanyToken } from "@/lib/ical";
import { canonicalAppOrigin } from "@/lib/request-security";

export async function GET(req: NextRequest) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.contextType !== "company" || !actor.companyId || actor.companyRole === "external") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const token = getCompanyToken(actor.companyId);
  const url = `${canonicalAppOrigin(req)}/api/ical/${token}.ics`;
  return NextResponse.json({ url }, { headers: { "cache-control": "no-store, max-age=0", pragma: "no-cache" } });
}
