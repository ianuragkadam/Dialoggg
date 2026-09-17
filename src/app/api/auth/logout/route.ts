import { NextRequest, NextResponse } from "next/server";
import { destroySession, getCurrentActor } from "@/lib/auth";
import { validateMutationRequest } from "@/lib/request-security";

export async function POST(request: NextRequest) {
  const actor = await getCurrentActor();
  if (actor) {
    const rejected = await validateMutationRequest(request, actor);
    if (rejected) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
