import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { issueInvitation } from "@/lib/account-tokens";
import { hashPassword, type CompanyRole } from "@/lib/auth";
import { requireCompanyRole } from "@/lib/guard";
import { validateMutationRequest } from "@/lib/request-security";
import { normalizeEmail, recordAudit, requestId } from "@/lib/security";
import { listCompanyUsers } from "@/lib/user-management";
import { RESOURCE_CATEGORIES, type ResourceCategoryUi } from "@/lib/resources-ui";

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
  const users = listCompanyUsers(auth.actor);
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
  const resourceCategory = typeof body.resourceCategory === "string" ? body.resourceCategory : "Team";
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || !firstName || !lastName || !role || !projectIds) {
    return NextResponse.json({ error: "First name, last name, valid email, role, and valid Project IDs are required." }, { status: 400 });
  }
  if (addAsResource && !RESOURCE_CATEGORIES.includes(resourceCategory as ResourceCategoryUi)) {
    return NextResponse.json({ error: "Choose a valid Resource type." }, { status: 400, headers: { "x-request-id": traceId } });
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
  const existingMembership = identity
    ? db.prepare("SELECT id FROM company_membership WHERE identity_id = ? AND company_id = ? LIMIT 1")
      .get(identity.id, actor.companyId) as { id: number } | undefined
    : undefined;
  if (identity && !existingMembership) {
    return NextResponse.json({ error: { code: "EMAIL_ALREADY_IN_USE", message: "This email is already assigned to a User in another Dialoggg company. Each email can be used only once across the platform.", fields: { email: "This email is already in use in another company." } } }, { status: 409, headers: { "x-request-id": traceId } });
  }
  const resourceEmailConflict = db.prepare(`
    SELECT 1 FROM resource r
    WHERE lower(trim(COALESCE(r.email, ''))) = lower(trim(?))
      AND (? IS NULL OR r.linked_membership_id IS NOT ?)
    LIMIT 1
  `).get(email, existingMembership?.id ?? null, existingMembership?.id ?? null);
  if (resourceEmailConflict) {
    return NextResponse.json({ error: { code: "EMAIL_ALREADY_IN_USE", message: "This email is already assigned to a Resource in Dialoggg. Use a different email address.", fields: { email: "This email is already in use." } } }, { status: 409, headers: { "x-request-id": traceId } });
  }
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
      SELECT id, status, removed_at FROM company_membership WHERE identity_id = ? AND company_id = ?
      `).get(identity!.id, actor.companyId) as { id: number; status: string; removed_at: string | null } | undefined;
      if (existing?.status === "active") throw new Error("MEMBERSHIP_EXISTS");
      if (existing?.status === "deactivated" && !existing.removed_at) throw new Error("MEMBERSHIP_RESTORE_REQUIRED");
      let membershipId: number;
      if (existing) {
        membershipId = existing.id;
        db.prepare(`
          UPDATE company_membership SET role = ?, status = 'pending', removed_at = NULL,
            invited_first_name = ?, invited_last_name = ?, deactivated_at = NULL,
            invited_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(role, firstName, lastName, membershipId);
      } else {
        const membership = db.prepare(`
          INSERT INTO company_membership (identity_id, company_id, role, status, invited_at, invited_first_name, invited_last_name)
          VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP, ?, ?)
        `).run(identity!.id, actor.companyId, role, firstName, lastName);
        membershipId = Number(membership.lastInsertRowid);
      }
      db.prepare("DELETE FROM project_membership WHERE company_membership_id = ?").run(membershipId);
      const assign = db.prepare("INSERT INTO project_membership (project_id, company_membership_id) VALUES (?, ?)");
      for (const projectId of projectIds) assign.run(projectId, membershipId);
      if (addAsResource) {
        const category = db.prepare(`
          SELECT id FROM resource_category WHERE company_id = ? AND lower(name) = lower(?)
        `).get(actor.companyId, resourceCategory) as { id: number } | undefined;
        if (!category) throw new Error("RESOURCE_CATEGORY_MISSING");
        const resourceName = `${firstName} ${lastName}`.trim().replace(/\s+/g, " ");
        const normalizedResourceName = resourceName.toLocaleLowerCase("en-US");
        const linkedResource = db.prepare(`SELECT id FROM resource WHERE company_id = ? AND linked_membership_id = ?`)
          .get(actor.companyId, membershipId) as { id: number } | undefined;
        const matchingUnlinkedResource = !linkedResource ? db.prepare(`
          SELECT id FROM resource WHERE company_id = ? AND linked_membership_id IS NULL
            AND lower(trim(COALESCE(email, ''))) = lower(?) LIMIT 1
        `).get(actor.companyId, email) as { id: number } | undefined : undefined;
        const nameTaken = db.prepare(`SELECT 1 FROM resource WHERE company_id = ? AND normalized_name = ? AND id IS NOT ? LIMIT 1`)
          .get(actor.companyId, normalizedResourceName, linkedResource?.id ?? matchingUnlinkedResource?.id ?? null);
        if (nameTaken) throw new Error("RESOURCE_NAME_EXISTS");
        if (linkedResource) {
          db.prepare(`UPDATE resource SET category_id = ?, name = ?, normalized_name = ?, email = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND company_id = ?`)
            .run(category.id, resourceName, normalizedResourceName, email, linkedResource.id, actor.companyId);
        } else if (matchingUnlinkedResource) {
          db.prepare(`UPDATE resource SET category_id = ?, name = ?, normalized_name = ?, email = ?, linked_membership_id = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND company_id = ?`)
            .run(category.id, resourceName, normalizedResourceName, email, membershipId, matchingUnlinkedResource.id, actor.companyId);
        } else {
          db.prepare(`INSERT INTO resource (company_id, category_id, name, normalized_name, email, linked_membership_id)
            VALUES (?, ?, ?, ?, ?, ?)`)
            .run(actor.companyId, category.id, resourceName, normalizedResourceName, email, membershipId);
        }
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
        metadata: { role, projectCount: projectIds.length, addAsResource, ...(addAsResource ? { resourceCategory } : {}) },
      });
      return membershipId;
    })();
    return NextResponse.json({ id: membershipId, status: "invited" }, { status: 201, headers: { "x-request-id": traceId } });
  } catch (error) {
    if (error instanceof Error && /EMAIL_ALREADY_IN_USE|identity\.normalized_email/i.test(error.message)) {
      return NextResponse.json({ error: { code: "EMAIL_ALREADY_IN_USE", message: "This email is already used by a User or Resource in Dialoggg. Use a different email address.", fields: { email: "This email is already in use." } } }, { status: 409, headers: { "x-request-id": traceId } });
    }
    if (error instanceof Error && error.message === "MEMBERSHIP_EXISTS") {
      return NextResponse.json({ error: "This person already has an active company membership." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "MEMBERSHIP_RESTORE_REQUIRED") {
      return NextResponse.json({ error: "Restore the deactivated membership before creating new invitations or assignments." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "RESOURCE_NAME_EXISTS") {
      return NextResponse.json({ error: "A Resource with this name already exists. Rename the User or link the existing Resource instead." }, { status: 409, headers: { "x-request-id": traceId } });
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
