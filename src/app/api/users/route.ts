import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { issueInvitation } from "@/lib/account-tokens";
import { hashPassword, type CompanyRole } from "@/lib/auth";
import { requireCompanyRole } from "@/lib/guard";
import { validateMutationRequest } from "@/lib/request-security";
import { normalizeEmail, recordAudit, requestId } from "@/lib/security";

function parseRole(value: unknown): CompanyRole | null {
  return value === "owner" || value === "admin" || value === "employee" || value === "external" ? value : null;
}

function parseName(body: Record<string, unknown>) {
  let firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  let lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  if (!firstName && typeof body.full_name === "string") {
    const [first, ...rest] = body.full_name.trim().replace(/\s+/g, " ").split(" ");
    firstName = first || "";
    lastName = rest.join(" ");
  }
  return { firstName, lastName };
}

function parseProjectIds(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.map(item => Number(item)))];
  return ids.every(id => Number.isInteger(id) && id > 0) ? ids : null;
}

export async function GET() {
  const auth = await requireCompanyRole(["owner", "admin"]);
  if ("error" in auth) return auth.error;
  const users = db.prepare(`
    SELECT COALESCE(cm.legacy_user_id, cm.id) AS id, cm.id AS membership_id,
      i.normalized_email AS email, trim(i.first_name || ' ' || i.last_name) AS full_name,
      cm.role AS user_type, cm.status, cm.invited_at, cm.accepted_at
    FROM company_membership cm
    JOIN identity i ON i.id = cm.identity_id
    WHERE cm.company_id = ?
    ORDER BY lower(i.first_name), lower(i.last_name), lower(i.normalized_email)
  `).all(auth.actor.companyId);
  return NextResponse.json({ users }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const traceId = requestId(request);
  const auth = await requireCompanyRole(["owner", "admin"]);
  if ("error" in auth) return auth.error;
  const actor = auth.actor;
  if (await validateMutationRequest(request, actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "x-request-id": traceId } });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (Object.hasOwn(body, "password")) {
    return NextResponse.json({ error: "Administrators cannot set another User's password. Send an invitation instead." }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const { firstName, lastName } = parseName(body);
  const role = parseRole(body.role);
  const projectIds = parseProjectIds(body.projectIds ?? body.project_ids);
  const addAsResource = body.addAsResource === true || body.add_as_resource === true;
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || !firstName || !lastName || !role || !projectIds) {
    return NextResponse.json({ error: "First name, last name, valid email, role, and valid Project IDs are required." }, { status: 400 });
  }
  if (actor.companyRole !== "owner" && (role === "owner" || role === "admin")) {
    return NextResponse.json({ error: "Only an Owner can invite an Owner or Admin." }, { status: 403 });
  }
  if (role === "external" && projectIds.length === 0) {
    return NextResponse.json({ error: "Assign an External/Client to at least one Project." }, { status: 400 });
  }
  if (projectIds.length) {
    const placeholders = projectIds.map(() => "?").join(",");
    const found = db.prepare(`SELECT COUNT(*) AS count FROM project WHERE company_id = ? AND id IN (${placeholders})`)
      .get(actor.companyId, ...projectIds) as { count: number };
    if (found.count !== projectIds.length) return NextResponse.json({ error: "One or more Projects are unavailable." }, { status: 404 });
  }

  let identity = db.prepare("SELECT id, status FROM identity WHERE normalized_email = ?").get(email) as {
    id: number;
    status: string;
  } | undefined;
  const inaccessiblePassword = identity ? null : await hashPassword(randomBytes(32).toString("base64url"));
  try {
    const membershipId = db.transaction(() => {
      if (!identity) {
        const inserted = db.prepare(`
          INSERT INTO identity (normalized_email, password_hash, first_name, last_name, status)
          VALUES (?, ?, ?, ?, 'pending')
        `).run(email, inaccessiblePassword, firstName, lastName);
        identity = { id: Number(inserted.lastInsertRowid), status: "pending" };
      }
      const existing = db.prepare(`
        SELECT id, status FROM company_membership WHERE identity_id = ? AND company_id = ?
      `).get(identity!.id, actor.companyId) as { id: number; status: string } | undefined;
      if (existing?.status === "active") throw new Error("MEMBERSHIP_EXISTS");
      let membershipId: number;
      if (existing) {
        membershipId = existing.id;
        db.prepare(`
          UPDATE company_membership SET role = ?, status = 'pending', deactivated_at = NULL,
            invited_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(role, membershipId);
      } else {
        const membership = db.prepare(`
          INSERT INTO company_membership (identity_id, company_id, role, status, invited_at)
          VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)
        `).run(identity!.id, actor.companyId, role);
        membershipId = Number(membership.lastInsertRowid);
      }
      db.prepare("DELETE FROM project_membership WHERE company_membership_id = ?").run(membershipId);
      const assign = db.prepare("INSERT INTO project_membership (project_id, company_membership_id) VALUES (?, ?)");
      for (const projectId of projectIds) assign.run(projectId, membershipId);
      if (addAsResource) {
        const employeeCategory = db.prepare(`
          SELECT id FROM resource_category WHERE company_id = ? AND lower(name) = 'employee'
        `).get(actor.companyId) as { id: number } | undefined;
        if (!employeeCategory) throw new Error("EMPLOYEE_CATEGORY_MISSING");
        db.prepare(`
          INSERT INTO resource (company_id, category_id, name, email, linked_membership_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(actor.companyId, employeeCategory.id, `${firstName} ${lastName}`, email, membershipId);
      }
      issueInvitation({
        membershipId,
        createdByIdentityId: actor.identityId,
        baseUrl: process.env.APP_BASE_URL || request.nextUrl.origin,
      });
      recordAudit({
        requestId: traceId,
        actorIdentityId: actor.identityId,
        actorMembershipId: actor.membershipId,
        companyId: actor.companyId,
        action: "membership.invite",
        targetType: "company_membership",
        targetId: membershipId,
        result: "success",
        metadata: { role, projectCount: projectIds.length, addAsResource },
      });
      return membershipId;
    })();
    return NextResponse.json({ id: membershipId, status: "invited" }, { status: 201, headers: { "x-request-id": traceId } });
  } catch (error) {
    if (error instanceof Error && error.message === "MEMBERSHIP_EXISTS") {
      return NextResponse.json({ error: "This person already has an active company membership." }, { status: 409 });
    }
    recordAudit({
      requestId: traceId,
      actorIdentityId: actor.identityId,
      actorMembershipId: actor.membershipId,
      companyId: actor.companyId,
      action: "membership.invite",
      result: "failure",
      metadata: { reason: "invite_creation_failed" },
    });
    return NextResponse.json({ error: "The invitation could not be created." }, { status: 503, headers: { "x-request-id": traceId } });
  }
}
