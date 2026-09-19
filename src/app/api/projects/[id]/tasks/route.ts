import { NextRequest, NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import { canViewProject } from "@/lib/authorization";
import { createPlanTask, getProjectPlan, PlanDomainError } from "@/lib/gantt-cascade";
import { requireCompanyRole } from "@/lib/guard";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

const idFrom = (value: string) => { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; };
const noStore = { "cache-control": "no-store" };
function failure(error: unknown) {
  if (error instanceof PlanDomainError) return NextResponse.json({ error: { code: error.code, message: error.message, fields: error.fields } }, { status: error.status, headers: noStore });
  return NextResponse.json({ error: { code: "PLAN_WRITE_FAILED", message: "The Project Plan could not be saved." } }, { status: 503, headers: noStore });
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const projectId = idFrom((await params).id);
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in to continue." } }, { status: 401, headers: noStore });
  if (!projectId || !actor.companyId || !canViewProject(actor, projectId)) return NextResponse.json({ error: { code: "PROJECT_NOT_FOUND", message: "Project not found." } }, { status: 404, headers: noStore });
  const plan = getProjectPlan(projectId, actor.companyId, actor.companyRole === "external");
  if (!plan) return NextResponse.json({ error: { code: "PROJECT_NOT_FOUND", message: "Project not found." } }, { status: 404, headers: noStore });
  const external = actor.companyRole === "external";
  const data = plan.tasks.map(task => ({
    id: task.id,
    text: task.name,
    start_date: task.start_date,
    end_date: task.end_date,
    duration: task.duration,
    progress: task.progress,
    parent: task.parent_id || 0,
    color: task.color,
    type: task.is_header ? "project" : "task",
    open: true,
    is_root: task.is_root === 1,
    ...(!external ? {
      version: task.version,
      allow_saturday: task.allow_saturday === 1,
      allow_sunday: task.allow_sunday === 1,
      resource_category_id: task.resource_category_id,
      external_visible: task.external_visible === 1,
      start_by_mode: task.start_by_mode,
    } : {}),
  }));
  const links = plan.links.map(link => ({ id: link.id, source: link.source_task_id, target: link.target_task_id, type: ({ fs: "0", ss: "1", ff: "2", sf: "3" } as const)[link.link_type], lag: link.lag_days }));
  return NextResponse.json({ data, links, ...(!external ? { planVersion: plan.project.planVersion } : {}), projectEndDate: plan.project.endDate }, { headers: noStore });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const trace = requestId(request);
  const projectId = idFrom((await params).id);
  const guarded = await requireCompanyRole(["owner", "admin"]);
  if ("error" in guarded) return guarded.error;
  const actor = guarded.actor;
  if (await validateMutationRequest(request, actor)) return NextResponse.json({ error: { code: "ACTION_FORBIDDEN", message: "The request could not be verified." } }, { status: 403, headers: noStore });
  if (!projectId || !actor.companyId) return NextResponse.json({ error: { code: "PROJECT_NOT_FOUND", message: "Project not found." } }, { status: 404, headers: noStore });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "Check the highlighted fields." } }, { status: 400, headers: noStore });
  try {
    const result = createPlanTask(projectId, actor.companyId, body);
    recordAudit({ requestId: trace, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, projectId, action: "task.create", targetType: "task", targetId: result.taskId, result: "success" });
    return NextResponse.json({ id: result.taskId, tid: result.taskId, planVersion: result.plan?.project.planVersion }, { status: 201, headers: noStore });
  } catch (error) { return failure(error); }
}
