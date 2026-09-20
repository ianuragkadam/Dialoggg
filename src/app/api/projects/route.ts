import { NextRequest, NextResponse } from "next/server";

import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { projectScopeSql, serializeProjectForActor, type InternalProjectDto } from "@/lib/authorization";
import { requireCompanyRole } from "@/lib/guard";
import { createProjectRecord, ProjectValidationError } from "@/lib/projects";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";
import { queueGoogleReconciliation } from "@/lib/google-calendar-queue";

const PROJECT_SELECT = `
  SELECT p.id, p.project_type_id, pt.name AS project_type, p.name, p.status, p.version,
    p.client_name, p.client_email, p.address, p.city, p.state, p.zip, p.phone,
    p.start_date, p.end_date, p.note, p.external_gantt_enabled
  FROM project p
  JOIN project_type pt ON pt.id = p.project_type_id AND pt.company_id = p.company_id
`;

export async function GET() {
  const actor = await getCurrentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.contextType !== "company" || !actor.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const scope = projectScopeSql(actor);
  const rows = db.prepare(`${PROJECT_SELECT} WHERE ${scope.sql} ORDER BY p.created_at DESC`).all(...scope.args) as InternalProjectDto[];
  return NextResponse.json({ projects: rows.map(row => serializeProjectForActor(actor, row)) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const traceId = requestId(request);
  const guard = await requireCompanyRole(["owner", "admin"]);
  if ("error" in guard) return guard.error;
  const actor = guard.actor;
  if (await validateMutationRequest(request, actor)) {
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "project.create", result: "denied", metadata: { reason: "request_protection" } });
    return NextResponse.json({ error: "The request could not be verified." }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Check the required Project fields." }, { status: 400 });
  try {
    const project = createProjectRecord(actor, {
      name: body.name, clientName: body.client_name, clientEmail: body.client_email,
      address: body.address, city: body.city, state: body.state, zip: body.zip,
      phone: body.phone, startDate: body.start_date, note: body.note,
      projectTypeId: body.project_type_id, assignmentIds: body.assignment_ids,
    });
    const projectId = project.id;
    queueGoogleReconciliation(actor.companyId!, "project.create");
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, projectId, action: "project.create", targetType: "project", targetId: projectId, result: "success" });
    return NextResponse.json({ id: projectId });
  } catch (error) {
    if (error instanceof ProjectValidationError) return NextResponse.json({ error: "Check the required Project fields.", fields: error.fields }, { status: 400 });
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "project.create", result: "failure" });
    return NextResponse.json({ error: "The Project could not be created." }, { status: 503 });
  }
}
