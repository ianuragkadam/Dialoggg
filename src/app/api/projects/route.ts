import { NextRequest, NextResponse } from "next/server";

import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { projectScopeSql, serializeProjectForActor, type InternalProjectDto } from "@/lib/authorization";
import { requireCompanyRole } from "@/lib/guard";
import { activeProjectTypeId } from "@/lib/project-types";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

const PROJECT_SELECT = `
  SELECT p.id, p.project_type_id, pt.name AS project_type, p.name, p.status,
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
  const name = String(body?.name ?? "").trim();
  const startDate = String(body?.start_date ?? "").trim();
  const projectTypeId = activeProjectTypeId(body?.project_type_id, actor.companyId!);
  if (!name || !startDate || !projectTypeId) {
    return NextResponse.json({ error: "Name, start_date, and a valid company project_type_id are required" }, { status: 400 });
  }
  try {
    const projectId = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO project (
          company_id, project_type_id, name, client_name, client_email, address,
          city, state, zip, phone, start_date, end_date, note, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        actor.companyId, projectTypeId, name,
        body?.client_name || null, body?.client_email || null, body?.address || null,
        body?.city || null, body?.state || null, body?.zip || null, body?.phone || null,
        startDate, body?.end_date || null, body?.note || null, actor.legacyUserId,
      );
      const id = Number(result.lastInsertRowid);
      if (actor.membershipId) db.prepare("INSERT OR IGNORE INTO project_membership (project_id, company_membership_id) VALUES (?, ?)").run(id, actor.membershipId);
      if (actor.legacyUserId) db.prepare("INSERT OR IGNORE INTO project_user (project_id, user_id) VALUES (?, ?)").run(id, actor.legacyUserId);
      return id;
    })();
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, projectId, action: "project.create", targetType: "project", targetId: projectId, result: "success" });
    return NextResponse.json({ id: projectId });
  } catch {
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "project.create", result: "failure" });
    return NextResponse.json({ error: "The Project could not be created." }, { status: 503 });
  }
}
