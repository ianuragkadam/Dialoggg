import { NextRequest, NextResponse } from "next/server";
import { deletePlanLink, PlanDomainError } from "@/lib/gantt-cascade";
import { requireCompanyRole } from "@/lib/guard";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

const noStore = { "cache-control": "no-store" };
const idFrom = (value: string) => { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; };

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const trace = requestId(request);
  const guarded = await requireCompanyRole(["owner", "admin"]);
  if ("error" in guarded) return guarded.error;
  const actor = guarded.actor;
  if (await validateMutationRequest(request, actor)) return NextResponse.json({ error: { code: "ACTION_FORBIDDEN", message: "The request could not be verified." } }, { status: 403, headers: noStore });
  const values = await params;
  const projectId = idFrom(values.id);
  const linkId = idFrom(values.linkId);
  const body = await request.json().catch(() => null) as { planVersion?: unknown } | null;
  if (!projectId || !linkId || !actor.companyId || !body) return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "Refresh the Plan and try again." } }, { status: 400, headers: noStore });
  try {
    const plan = deletePlanLink(projectId, linkId, actor.companyId, Number(body.planVersion));
    recordAudit({ requestId: trace, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, projectId, action: "task_dependency.delete", targetType: "task_dependency", targetId: linkId, result: "success" });
    return NextResponse.json({ ok: true, planVersion: plan?.project.planVersion }, { headers: noStore });
  } catch (error) {
    if (error instanceof PlanDomainError) return NextResponse.json({ error: { code: error.code, message: error.message, fields: error.fields } }, { status: error.status, headers: noStore });
    return NextResponse.json({ error: { code: "DEPENDENCY_WRITE_FAILED", message: "The dependency could not be removed." } }, { status: 503, headers: noStore });
  }
}
