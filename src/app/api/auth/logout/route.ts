import { NextRequest, NextResponse } from "next/server";
import { destroySession, getCurrentActor } from "@/lib/auth";
import { validateMutationRequest, validateRequestOrigin } from "@/lib/request-security";

export async function POST(request: NextRequest) {
  if (!validateRequestOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "cache-control": "no-store" } });
  const actor = await getCurrentActor();
  if (actor) {
    const rejected = await validateMutationRequest(request, actor);
    if (rejected) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "cache-control": "no-store" } });
  }
  await destroySession();
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
