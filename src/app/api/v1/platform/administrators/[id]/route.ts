import { NextRequest, NextResponse } from "next/server";

import db from "@/db";
import { getCurrentActor, revokeIdentitySessions } from "@/lib/auth";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  if (!actor || actor.contextType !== "platform" || !actor.isPrimaryPlatformAdmin) {
    return NextResponse.json({ error: "Only the Primary Platform Administrator can remove Platform Administrators." }, { status: 403, headers: { "x-request-id": traceId } });
  }
  if (await validateMutationRequest(request, actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "x-request-id": traceId } });
  }
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Platform Administrator not found." }, { status: 404, headers: { "x-request-id": traceId } });
  const target = db.prepare(`SELECT id, is_platform_admin, is_primary_platform_admin FROM identity WHERE id = ?`).get(id) as {
    id: number; is_platform_admin: number; is_primary_platform_admin: number;
  } | undefined;
  const pendingInvitation = target ? db.prepare(`
    SELECT id FROM platform_admin_invitation
    WHERE identity_id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
  `).get(id) as { id: number } | undefined : undefined;
  if (!target || (target.is_platform_admin !== 1 && !pendingInvitation)) return NextResponse.json({ error: "Platform Administrator not found." }, { status: 404, headers: { "x-request-id": traceId } });
  if (target.is_primary_platform_admin === 1) {
    return NextResponse.json({ error: "The Primary Platform Administrator cannot be removed." }, { status: 409, headers: { "x-request-id": traceId } });
  }
  db.transaction(() => {
    if (target.is_platform_admin === 1) db.prepare(`UPDATE identity SET is_platform_admin = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
    db.prepare(`UPDATE platform_admin_invitation SET revoked_at = CURRENT_TIMESTAMP WHERE identity_id = ? AND used_at IS NULL AND revoked_at IS NULL`).run(id);
    revokeIdentitySessions(id, "platform_administrator_removed");
    recordAudit({
      requestId: traceId,
      actorIdentityId: actor.identityId,
      action: "platform_administrator.remove",
      targetType: "identity",
      targetId: id,
      result: "success",
    });
  })();
  return NextResponse.json({ ok: true }, { headers: { "x-request-id": traceId } });
}
