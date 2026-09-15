import { NextRequest, NextResponse } from "next/server";

import { buildFollowUpMarkdown, followUpSnapshot } from "@/lib/follow-up-store";
import { reviewKindForToken } from "@/lib/requirements-access";
import { buildRequirementsMarkdown, requirementsSnapshot } from "@/lib/requirements-store";
import { getRequirementsWorkshop } from "@/lib/requirements-workshops";

const NO_STORE = { "cache-control": "no-store, max-age=0" };

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const kind = reviewKindForToken(token);
  if (!kind) {
    return NextResponse.json({ error: "Review not found" }, { status: 404, headers: NO_STORE });
  }

  const workshop = getRequirementsWorkshop(kind);

  if (req.nextUrl.searchParams.get("format") === "markdown") {
    return new NextResponse(kind === "follow_up" ? buildFollowUpMarkdown() : buildRequirementsMarkdown(), {
      headers: {
        ...NO_STORE,
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${workshop.markdownFilename}"`,
      },
    });
  }

  return NextResponse.json(kind === "follow_up" ? followUpSnapshot() : requirementsSnapshot(), { headers: NO_STORE });
}
