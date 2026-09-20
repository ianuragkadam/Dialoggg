import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { buildICS, projectFeedItems, companyFeedItems, resourceFeedItems } from "@/lib/ical";

// Public, token-protected calendar feed. No login required — the secret token IS the auth.
// Subscribe URL looks like: /api/ical/prj_abc123.ics  or  /api/ical/cmp_abc123.ics
export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/i, "");
  if (!/^(?:prj|cmp|res)_[a-f0-9]{36}$/.test(token)) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } });

  let calName = "Dialoggg";
  let items;

  if (token.startsWith("prj_")) {
    const project = db.prepare("SELECT id, name FROM project WHERE ical_token = ?").get(token) as any;
    if (!project) return new NextResponse("Not found", { status: 404 });
    calName = project.name;
    items = projectFeedItems(project.id);
  } else if (token.startsWith("cmp_")) {
    const company = db.prepare("SELECT id, name FROM company WHERE ical_token = ?").get(token) as any;
    if (!company) return new NextResponse("Not found", { status: 404 });
    calName = `${company.name} — All Projects`;
    items = companyFeedItems(company.id);
  } else if (token.startsWith("res_")) {
    const resource = db.prepare("SELECT id, name FROM resource WHERE ical_token = ?").get(token) as any;
    if (!resource) return new NextResponse("Not found", { status: 404 });
    calName = `${resource.name} — My Schedule`;
    items = resourceFeedItems(resource.id);
  } else {
    return new NextResponse("Not found", { status: 404 });
  }

  const ics = buildICS(calName, items);
  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${token}.ics"`,
      "Cache-Control": "private, no-store, max-age=0",
      "Pragma": "no-cache",
    },
  });
}
