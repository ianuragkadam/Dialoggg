import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { revokeIdentitySessions, type CompanyRole } from "@/lib/auth";
import { requireCompanyRole } from "@/lib/guard";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

type TargetMembership = {
  id: number;
  identity_id: number;
  legacy_user_id: number | null;
  role: CompanyRole;
  status: string;
};

function targetMembership(targetId: number, companyId: number) {
  return db.prepare(`
    SELECT id, identity_id, legacy_user_id, role, status
    FROM company_membership
    WHERE company_id = ? AND (id = ? OR legacy_user_id = ?)
    ORDER BY CASE WHEN legacy_user_id = ? THEN 0 ELSE 1 END
    LIMIT 1
  `).get(companyId, targetId, targetId, targetId) as TargetMembership | undefined;
}

function requestedRole(value: unknown): CompanyRole | null {
  if (value === "owner" || value === "admin" || value === "employee" || value === "external") return value;
  if (value === "viewer" || value === "internal") return "employee";
  return null;
}

function legacyRole(role: CompanyRole) {
  return role === "employee" ? "internal" : role;
}

function lastOwnerWouldBeRemoved(companyId: number, target: TargetMembership, nextRole?: CompanyRole) {
  if (target.role !== "owner" || (nextRole && nextRole === "owner")) return false;
  const owners = db.prepare(`
    SELECT COUNT(*) AS count FROM company_membership
    WHERE company_id = ? AND role = 'owner' AND status = 'active'
  `).get(companyId) as { count: number };
  return owners.count <= 1;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const auth = await requireCompanyRole(["owner", "admin"]);
  if ("error" in auth) return auth.error;
  const actor = auth.actor;
  if (await validateMutationRequest(request, actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "x-request-id": traceId } });
  }
  const { id } = await params;
  const target = targetMembership(Number(id), actor.companyId!);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "x-request-id": traceId } });
  const body = await request.json().catch(() => ({}));
  const role = requestedRole(body.role);
  if (!role) return NextResponse.json({ error: "Invalid role" }, { status: 400, headers: { "x-request-id": traceId } });

  if (target.id === actor.membershipId && role !== target.role) {
    return NextResponse.json({ error: "You cannot change your own active role." }, { status: 400, headers: { "x-request-id": traceId } });
  }
  if (actor.companyRole !== "owner" && (target.role === "owner" || target.role === "admin" || role === "owner" || role === "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "x-request-id": traceId } });
  }
  if (lastOwnerWouldBeRemoved(actor.companyId!, target, role)) {
    return NextResponse.json({ error: "The final active Owner cannot be demoted." }, { status: 409, headers: { "x-request-id": traceId } });
  }

  db.transaction(() => {
    db.prepare("UPDATE company_membership SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(role, target.id);
    if (target.legacy_user_id) db.prepare("UPDATE user SET user_type = ? WHERE id = ?").run(legacyRole(role), target.legacy_user_id);
    revokeIdentitySessions(target.identity_id, "membership_role_changed");
    recordAudit({
      actorIdentityId: actor.identityId,
      actorMembershipId: actor.membershipId,
      companyId: actor.companyId,
      requestId: traceId,
      action: "membership.role.change",
      targetType: "company_membership",
      targetId: target.id,
      result: "success",
      metadata: { fromRole: target.role, toRole: role },
    });
  })();
  return NextResponse.json({ ok: true }, { headers: { "x-request-id": traceId } });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const auth = await requireCompanyRole(["owner", "admin"]);
  if ("error" in auth) return auth.error;
  const actor = auth.actor;
  if (await validateMutationRequest(request, actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "x-request-id": traceId } });
  }
  const { id } = await params;
  const target = targetMembership(Number(id), actor.companyId!);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "x-request-id": traceId } });
  if (target.id === actor.membershipId) {
    return NextResponse.json({ error: "You cannot deactivate your own active membership." }, { status: 400, headers: { "x-request-id": traceId } });
  }
  if (actor.companyRole !== "owner" && (target.role === "owner" || target.role === "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "x-request-id": traceId } });
  }
  if (lastOwnerWouldBeRemoved(actor.companyId!, target)) {
    return NextResponse.json({ error: "The final active Owner cannot be deactivated." }, { status: 409, headers: { "x-request-id": traceId } });
  }

  db.transaction(() => {
    db.prepare(`
      UPDATE company_membership
      SET status = 'deactivated', deactivated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(target.id);
    revokeIdentitySessions(target.identity_id, "membership_deactivated");
    const remaining = db.prepare(`
      SELECT COUNT(*) AS count FROM company_membership WHERE identity_id = ? AND status = 'active'
    `).get(target.identity_id) as { count: number };
    const platform = db.prepare("SELECT is_platform_admin FROM identity WHERE id = ?").get(target.identity_id) as { is_platform_admin: number };
    if (remaining.count === 0 && platform.is_platform_admin !== 1) {
      db.prepare("UPDATE identity SET status = 'deactivated', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(target.identity_id);
    }
    recordAudit({
      actorIdentityId: actor.identityId,
      actorMembershipId: actor.membershipId,
      companyId: actor.companyId,
      requestId: traceId,
      action: "membership.deactivate",
      targetType: "company_membership",
      targetId: target.id,
      result: "success",
    });
  })();
  return NextResponse.json({ ok: true }, { headers: { "x-request-id": traceId } });
}
