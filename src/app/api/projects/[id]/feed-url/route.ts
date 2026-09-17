import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { canViewProject } from "@/lib/authorization";
import { getProjectToken } from "@/lib/ical";

// Any logged-in company member can get the subscribe URL (viewers included).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const projectId = Number(id);
  if (!canViewProject(actor, projectId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (actor.companyRole === "external") return NextResponse.json({ error: "External/Client calendar subscriptions are not available because access could outlive a Project assignment." }, { status: 403 });

  const token = getProjectToken(projectId);
  const url = `${req.nextUrl.origin}/api/ical/${token}.ics`;
  return NextResponse.json({ url });
}
