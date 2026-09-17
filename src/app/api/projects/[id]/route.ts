import { NextRequest, NextResponse } from "next/server";

import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { canViewProject, serializeProjectForActor, type InternalProjectDto } from "@/lib/authorization";
import { requireCompanyRole } from "@/lib/guard";
import { activeProjectTypeId } from "@/lib/project-types";
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
    SELECT p.id, p.project_type_id, pt.name AS project_type, p.name, p.status,
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
  const name = String(body?.name ?? "").trim();
  const startDate = String(body?.start_date ?? "").trim();
  const projectTypeId = activeProjectTypeId(body?.project_type_id, actor.companyId!);
  if (!name || !startDate || !projectTypeId) return NextResponse.json({ error: "Name, start_date, and a valid company project_type_id are required" }, { status: 400 });
  const result = db.prepare(`
    UPDATE project SET
      project_type_id = ?, name = ?, status = ?, client_name = ?, client_email = ?,
      address = ?, city = ?, state = ?, zip = ?, phone = ?, start_date = ?,
      end_date = ?, note = ?, version = version + 1
    WHERE id = ? AND company_id = ?
  `).run(
    projectTypeId, name, body?.status || "active", body?.client_name || null, body?.client_email || null,
    body?.address || null, body?.city || null, body?.state || null, body?.zip || null, body?.phone || null,
    startDate, body?.end_date || null, body?.note || null, projectId, actor.companyId,
  );
  if (result.changes !== 1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, projectId, action: "project.update", targetType: "project", targetId: projectId, result: "success", metadata: { projectTypeId } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyRole(["owner"]);
  if ("error" in guard) return guard.error;
  const actor = guard.actor;
  if (await validateMutationRequest(request, actor)) return NextResponse.json({ error: "The request could not be verified." }, { status: 403 });
  const projectId = idFrom((await params).id);
  if (!projectId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = db.prepare("DELETE FROM project WHERE id = ? AND company_id = ? AND status = 'archived'").run(projectId, actor.companyId);
  if (result.changes !== 1) return NextResponse.json({ error: "Only an archived Project can be permanently deleted." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
