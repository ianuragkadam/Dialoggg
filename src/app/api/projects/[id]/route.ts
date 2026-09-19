import { NextRequest, NextResponse } from "next/server";

import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { canViewProject, serializeProjectForActor, type InternalProjectDto } from "@/lib/authorization";
import { requireCompanyRole } from "@/lib/guard";
import { permanentlyDeleteProject, ProjectValidationError, updateProjectRecord } from "@/lib/projects";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

function idFrom(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.contextType !== "company" || !actor.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const projectId = idFrom((await params).id);
  if (!projectId || !canViewProject(actor, projectId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const project = db.prepare(`
    SELECT p.id, p.project_type_id, pt.name AS project_type, p.name, p.status, p.version,
      p.client_name, p.client_email, p.address, p.city, p.state, p.zip, p.phone,
      p.start_date, p.end_date, p.note, p.external_gantt_enabled
    FROM project p JOIN project_type pt ON pt.id = p.project_type_id AND pt.company_id = p.company_id
    WHERE p.id = ? AND p.company_id = ?
  `).get(projectId, actor.companyId) as InternalProjectDto | undefined;
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ project: serializeProjectForActor(actor, project) }, { headers: { "cache-control": "no-store" } });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = requestId(request);
  const guard = await requireCompanyRole(["owner", "admin"]);
  if ("error" in guard) return guard.error;
  const actor = guard.actor;
  if (await validateMutationRequest(request, actor)) return NextResponse.json({ error: "The request could not be verified." }, { status: 403 });
  const projectId = idFrom((await params).id);
  if (!projectId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Check the required Project fields." }, { status: 400 });
  try {
    const project = updateProjectRecord(actor, projectId, {
      name: body.name, clientName: body.client_name, clientEmail: body.client_email,
      address: body.address, city: body.city, state: body.state, zip: body.zip,
      phone: body.phone, startDate: body.start_date, note: body.note,
      projectTypeId: body.project_type_id, assignmentIds: body.assignment_ids,
      version: body.version, rebaseMode: body.rebase_mode,
    });
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, projectId, action: "project.update", targetType: "project", targetId: projectId, result: "success", metadata: { projectTypeId: project.project_type_id } });
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    if (error instanceof ProjectValidationError) return NextResponse.json({ error: "Check the required Project fields.", fields: error.fields }, { status: 400 });
    if (error instanceof Error && error.message === "PROJECT_READ_ONLY") return NextResponse.json({ error: "Reopen or restore this Project before editing." }, { status: 409 });
    if (error instanceof Error && error.message === "PROJECT_VERSION_CONFLICT") return NextResponse.json({ error: "Refresh this Project before saving." }, { status: 409 });
    return NextResponse.json({ error: "The Project could not be updated." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyRole(["owner"]);
  if ("error" in guard) return guard.error;
  const actor = guard.actor;
  if (await validateMutationRequest(request, actor)) return NextResponse.json({ error: "The request could not be verified." }, { status: 403 });
  const projectId = idFrom((await params).id);
  if (!projectId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => null) as { name?: unknown; acknowledged?: unknown } | null;
  if (!body || body.acknowledged !== true || typeof body.name !== "string") return NextResponse.json({ error: "Exact Project Name and acknowledgement are required." }, { status: 400 });
  if (!permanentlyDeleteProject(projectId, actor.companyId!, body.name)) return NextResponse.json({ error: "Only the exact named archived Project can be permanently deleted." }, { status: 409 });
  recordAudit({ requestId: requestId(request), actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "project.delete", targetType: "project", targetId: projectId, result: "success" });
  return NextResponse.json({ ok: true });
}
