import { NextRequest, NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import { getCompanyToken, resetCompanyToken } from "@/lib/ical";
import { canonicalAppOrigin, validateMutationRequest } from "@/lib/request-security";

export async function GET(req: NextRequest) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.contextType !== "company" || !actor.companyId || actor.companyRole === "external") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const token = getCompanyToken(actor.companyId);
  const url = `${canonicalAppOrigin(req)}/api/ical/${token}.ics`;
  return NextResponse.json({ url }, { headers: { "cache-control": "no-store, max-age=0", pragma: "no-cache" } });
}

export async function POST(req: NextRequest) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.contextType !== "company" || !actor.companyId || !["owner", "admin"].includes(actor.companyRole || "")) {
    return NextResponse.json({ error: "Only Owners and Admins can reset this calendar link." }, { status: 403 });
  }
  const securityError = await validateMutationRequest(req, actor);
  if (securityError) return NextResponse.json({ error: "Security check failed. Refresh the page and try again." }, { status: 403 });
  const token = resetCompanyToken(actor.companyId);
  const url = `${canonicalAppOrigin(req)}/api/ical/${token}.ics`;
  return NextResponse.json({ url }, { headers: { "cache-control": "no-store, max-age=0", pragma: "no-cache" } });
}
