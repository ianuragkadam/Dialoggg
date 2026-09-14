import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCompanyToken } from "@/lib/ical";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.company_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const token = getCompanyToken(user.company_id);
  const url = `${req.nextUrl.origin}/api/ical/${token}.ics`;
  return NextResponse.json({ url });
}
