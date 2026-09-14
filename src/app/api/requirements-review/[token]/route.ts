import { NextRequest, NextResponse } from "next/server";

import { isRequirementsReviewToken } from "@/lib/requirements-access";
import { buildRequirementsMarkdown, requirementsSnapshot } from "@/lib/requirements-store";

const NO_STORE = { "cache-control": "no-store, max-age=0" };

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isRequirementsReviewToken(token)) {
    return NextResponse.json({ error: "Review not found" }, { status: 404, headers: NO_STORE });
  }

  if (req.nextUrl.searchParams.get("format") === "markdown") {
    return new NextResponse(buildRequirementsMarkdown(), {
      headers: {
        ...NO_STORE,
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": 'attachment; filename="dialoggg-requirements-responses.md"',
      },
    });
  }

  return NextResponse.json(requirementsSnapshot(), { headers: NO_STORE });
}

