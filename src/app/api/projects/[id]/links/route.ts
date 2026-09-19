import { NextRequest, NextResponse } from "next/server";
import { createPlanLink, PlanDomainError } from "@/lib/gantt-cascade";
import { requireCompanyRole } from "@/lib/guard";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

const noStore = { "cache-control": "no-store" };
const idFrom = (value: string) => { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const trace = requestId(request);
  const guarded = await requireCompanyRole(["owner", "admin"]);
  if ("error" in guarded) return guarded.error;
  const actor = guarded.actor;
  if (await validateMutationRequest(request, actor)) return NextResponse.json({ error: { code: "ACTION_FORBIDDEN", message: "The request could not be verified." } }, { status: 403, headers: noStore });
  const projectId = idFrom((await params).id);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!projectId || !actor.companyId || !body) return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "Check the dependency values." } }, { status: 400, headers: noStore });
  try {
    const result = createPlanLink(projectId, actor.companyId, body);
    recordAudit({ requestId: trace, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, projectId, action: "task_dependency.create", targetType: "task_dependency", targetId: result.linkId, result: "success" });
    return NextResponse.json({ id: result.linkId, tid: result.linkId, planVersion: result.plan?.project.planVersion }, { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof PlanDomainError) return NextResponse.json({ error: { code: error.code, message: error.message, fields: error.fields } }, { status: error.status, headers: noStore });
    return NextResponse.json({ error: { code: "DEPENDENCY_WRITE_FAILED", message: "The dependency could not be saved." } }, { status: 503, headers: noStore });
  }
}
