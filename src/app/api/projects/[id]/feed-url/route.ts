import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { canViewProject } from "@/lib/authorization";
import { getProjectToken, resetProjectToken } from "@/lib/ical";
import { canonicalAppOrigin, validateMutationRequest } from "@/lib/request-security";

// Any logged-in company member can get the subscribe URL (viewers included).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const projectId = Number(id);
  if (!canViewProject(actor, projectId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (actor.companyRole === "external") return NextResponse.json({ error: "External/Client calendar subscriptions are not available because access could outlive a Project assignment." }, { status: 403 });

  const token = getProjectToken(projectId);
  const url = `${canonicalAppOrigin(req)}/api/ical/${token}.ics`;
  return NextResponse.json({ url }, { headers: { "cache-control": "no-store, max-age=0", pragma: "no-cache" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const projectId = Number(id);
  if (!canViewProject(actor, projectId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (actor.companyRole === "external") return NextResponse.json({ error: "External/Client calendar subscriptions are not available." }, { status: 403 });
  if (!["owner", "admin"].includes(actor.companyRole || "")) return NextResponse.json({ error: "Only Owners and Admins can reset this calendar link." }, { status: 403 });
  const securityError = await validateMutationRequest(req, actor);
  if (securityError) return NextResponse.json({ error: "Security check failed. Refresh the page and try again." }, { status: 403 });

  const token = resetProjectToken(projectId);
  const url = `${canonicalAppOrigin(req)}/api/ical/${token}.ics`;
  return NextResponse.json({ url }, { headers: { "cache-control": "no-store, max-age=0", pragma: "no-cache" } });
}
