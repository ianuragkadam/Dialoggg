import { NextRequest, NextResponse } from "next/server";
import { deletePlanTask, PlanDomainError, updatePlanTask } from "@/lib/gantt-cascade";
import { queueGoogleReconciliation } from "@/lib/google-calendar-queue";
import { requireCompanyRole } from "@/lib/guard";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

const idFrom = (value: string) => { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; };
const noStore = { "cache-control": "no-store" };
function failure(error: unknown) {
  if (error instanceof PlanDomainError) return NextResponse.json({ error: { code: error.code, message: error.message, fields: error.fields } }, { status: error.status, headers: noStore });
  return NextResponse.json({ error: { code: "PLAN_WRITE_FAILED", message: "The Project Plan could not be saved." } }, { status: 503, headers: noStore });
}

async function context(request: NextRequest, params: Promise<{ id: string; taskId: string }>) {
  const guarded = await requireCompanyRole(["owner", "admin"]);
  if ("error" in guarded) return { response: guarded.error };
  if (await validateMutationRequest(request, guarded.actor)) return { response: NextResponse.json({ error: { code: "ACTION_FORBIDDEN", message: "The request could not be verified." } }, { status: 403, headers: noStore }) };
  const values = await params;
  const projectId = idFrom(values.id);
  const taskId = idFrom(values.taskId);
  if (!projectId || !taskId || !guarded.actor.companyId) return { response: NextResponse.json({ error: { code: "TASK_NOT_FOUND", message: "Task not found." } }, { status: 404, headers: noStore }) };
  return { actor: guarded.actor, projectId, taskId };
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const trace = requestId(request);
  const scoped = await context(request, params);
  if ("response" in scoped) return scoped.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "Check the highlighted fields." } }, { status: 400, headers: noStore });
  try {
    const plan = updatePlanTask(scoped.projectId, scoped.taskId, scoped.actor.companyId!, body);
    queueGoogleReconciliation(scoped.actor.companyId!, "task.update");
    recordAudit({ requestId: trace, actorIdentityId: scoped.actor.identityId, actorMembershipId: scoped.actor.membershipId, companyId: scoped.actor.companyId!, projectId: scoped.projectId, action: "task.update", targetType: "task", targetId: scoped.taskId, result: "success" });
    return NextResponse.json({ ok: true, planVersion: plan?.project.planVersion }, { headers: noStore });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const trace = requestId(request);
  const scoped = await context(request, params);
  if ("response" in scoped) return scoped.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: { code: "DELETE_CONFIRMATION_REQUIRED", message: "Refresh the Plan and confirm Task deletion." } }, { status: 400, headers: noStore });
  try {
    const plan = deletePlanTask(scoped.projectId, scoped.taskId, scoped.actor.companyId!, Number(body.planVersion), Number(body.version));
    queueGoogleReconciliation(scoped.actor.companyId!, "task.delete");
    recordAudit({ requestId: trace, actorIdentityId: scoped.actor.identityId, actorMembershipId: scoped.actor.membershipId, companyId: scoped.actor.companyId!, projectId: scoped.projectId, action: "task.delete", targetType: "task", targetId: scoped.taskId, result: "success" });
    return NextResponse.json({ ok: true, planVersion: plan?.project.planVersion }, { headers: noStore });
  } catch (error) { return failure(error); }
}
