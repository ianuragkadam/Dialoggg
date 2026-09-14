import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { getProjectToken } from "@/lib/ical";

// Any logged-in company member can get the subscribe URL (viewers included).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = db.prepare("SELECT id FROM project WHERE id = ? AND company_id = ?").get(Number(id), user.company_id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const token = getProjectToken(Number(id));
  const url = `${req.nextUrl.origin}/api/ical/${token}.ics`;
  return NextResponse.json({ url });
}
