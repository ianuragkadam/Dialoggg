import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import { canViewProject } from "@/lib/authorization";
import { getProjectPlan } from "@/lib/gantt-cascade";
import { requestId } from "@/lib/security";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const trace = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", trace);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1 || !actor.companyId || !canViewProject(actor, id)) return apiError(404, "PROJECT_NOT_FOUND", "Project not found.", trace);
  const plan = getProjectPlan(id, actor.companyId, actor.companyRole === "external");
  if (!plan) return apiError(404, "PROJECT_NOT_FOUND", "Project not found.", trace);
  if (actor.companyRole !== "external") return apiSuccess({ plan }, trace);
  return apiSuccess({ plan: {
    project: { id: plan.project.id, name: plan.project.name, status: plan.project.status, startDate: plan.project.startDate, endDate: plan.project.endDate },
    tasks: plan.tasks.map(task => ({
      id: task.id, parentId: task.parent_id, name: task.name, startDate: task.start_date,
      endDate: task.end_date, duration: task.duration, progress: task.progress,
      color: task.color, isHeader: task.is_header === 1, isRoot: task.is_root === 1,
    })),
    links: [],
  } }, trace);
}
