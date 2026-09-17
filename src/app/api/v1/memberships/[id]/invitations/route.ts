import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { issueInvitation } from "@/lib/account-tokens";
import { requireCompanyRole } from "@/lib/guard";
import { validateMutationRequest } from "@/lib/request-security";
import { rateLimitStatus, recordAudit, recordRateLimitFailure, requestId } from "@/lib/security";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const auth = await requireCompanyRole(["owner", "admin"]);
  if ("error" in auth) return auth.error;
  const actor = auth.actor;
  if (await validateMutationRequest(request, actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const membershipId = Number((await params).id);
  const target = db.prepare(`
    SELECT id, role, status FROM company_membership WHERE id = ? AND company_id = ?
  `).get(membershipId, actor.companyId) as { id: number; role: string; status: string } | undefined;
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.status !== "pending") return NextResponse.json({ error: "Only pending invitations can be resent." }, { status: 409 });
  if (actor.companyRole !== "owner" && (target.role === "owner" || target.role === "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const options = {
    action: "invitation_resend",
    discriminator: `${actor.identityId}:${membershipId}`,
    maximumAttempts: 3,
    windowSeconds: 60 * 60,
    blockSeconds: 60 * 60,
  };
  const rate = rateLimitStatus(options);
  if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  recordRateLimitFailure(options, rate.keyHash);
  try {
    const invitation = issueInvitation({
      membershipId,
      createdByIdentityId: actor.identityId,
      baseUrl: process.env.APP_BASE_URL || request.nextUrl.origin,
    });
    recordAudit({
      requestId: traceId,
      actorIdentityId: actor.identityId,
      actorMembershipId: actor.membershipId,
      companyId: actor.companyId,
      action: "membership.invitation.reissue",
      targetType: "company_membership",
      targetId: membershipId,
      result: "success",
    });
    return NextResponse.json({ status: "resent", expiresAt: invitation.expiresAt }, { headers: { "x-request-id": traceId } });
  } catch {
    return NextResponse.json({ error: "The invitation could not be resent." }, { status: 503 });
  }
}
