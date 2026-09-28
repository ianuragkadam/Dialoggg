import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import db from "@/db";
import { issuePlatformAdministratorInvitation } from "@/lib/account-tokens";
import { getCurrentActor, hashPassword } from "@/lib/auth";
import { validateMutationRequest } from "@/lib/request-security";
import { normalizeEmail, recordAudit, requestId } from "@/lib/security";

function splitName(body: Record<string, unknown>) {
  let firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  let lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : typeof body.full_name === "string" ? body.full_name.trim() : "";
  if ((!firstName || !lastName) && fullName) {
    const parts = fullName.replace(/\s+/g, " ").split(" ").filter(Boolean);
    firstName = parts.slice(0, -1).join(" ") || parts[0] || "";
    lastName = parts.length > 1 ? parts.at(-1) || "" : "";
  }
  return { firstName, lastName };
}

export async function GET(request: NextRequest) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  if (!actor || actor.contextType !== "platform" || !actor.isPlatformAdmin) {
    return NextResponse.json({ error: "Platform Administrator access is required." }, { status: 403, headers: { "x-request-id": traceId } });
  }
  const administrators = db.prepare(`
    SELECT i.id, i.first_name, i.last_name, i.normalized_email,
      CASE WHEN i.is_platform_admin = 1 THEN i.status ELSE 'invited' END AS status,
      i.is_primary_platform_admin, i.created_at, i.updated_at
    FROM identity i
    WHERE i.is_platform_admin = 1 OR EXISTS (
      SELECT 1 FROM platform_admin_invitation pai
      WHERE pai.identity_id = i.id AND pai.used_at IS NULL AND pai.revoked_at IS NULL AND pai.expires_at > CURRENT_TIMESTAMP
    )
    ORDER BY i.is_primary_platform_admin DESC, lower(i.first_name), lower(i.last_name), i.id
  `).all();
  return NextResponse.json({ administrators }, { headers: { "cache-control": "no-store", "x-request-id": traceId } });
}

export async function POST(request: NextRequest) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  if (!actor || actor.contextType !== "platform" || !actor.isPrimaryPlatformAdmin) {
    return NextResponse.json({ error: "Only the Primary Platform Administrator can invite Platform Administrators." }, { status: 403, headers: { "x-request-id": traceId } });
  }
  if (await validateMutationRequest(request, actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "x-request-id": traceId } });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Enter invitation details." }, { status: 400, headers: { "x-request-id": traceId } });
  const { firstName, lastName } = splitName(body);
  const email = normalizeEmail(body.email);
  if (!firstName || !lastName || !email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Enter a full name and a valid email address." }, { status: 400, headers: { "x-request-id": traceId } });
  }

  try {
    let existingIdentity = db.prepare(`SELECT id, status, is_platform_admin FROM identity WHERE normalized_email = ?`).get(email) as {
      id: number; status: string; is_platform_admin: number;
    } | undefined;
    if (existingIdentity?.is_platform_admin === 1) throw new Error("ALREADY_PLATFORM_ADMINISTRATOR");
    const pendingPasswordHash = existingIdentity ? null : await hashPassword(randomBytes(32).toString("base64url"));
    const result = db.transaction(() => {
      let identity = existingIdentity;
      if (!identity) {
        const inserted = db.prepare(`
          INSERT INTO identity (normalized_email, password_hash, first_name, last_name, status)
          VALUES (?, ?, ?, ?, 'pending')
        `).run(email, pendingPasswordHash, firstName, lastName);
        identity = { id: Number(inserted.lastInsertRowid), status: "pending", is_platform_admin: 0 };
      }
      const invitation = issuePlatformAdministratorInvitation({
        identityId: identity.id,
        createdByIdentityId: actor.identityId,
        baseUrl: process.env.APP_BASE_URL || request.nextUrl.origin,
      });
      recordAudit({
        requestId: traceId,
        actorIdentityId: actor.identityId,
        action: "platform_administrator.invite",
        targetType: "identity",
        targetId: identity.id,
        result: "success",
      });
      return { identityId: identity.id, expiresAt: invitation.expiresAt };
    })();
    return NextResponse.json({
      status: "invited", ...result,
      administrator: { id: result.identityId, first_name: firstName, last_name: lastName, normalized_email: email, status: "invited", is_primary_platform_admin: 0 },
    }, { status: 201, headers: { "x-request-id": traceId } });
  } catch (error) {
    const message = error instanceof Error && error.message === "ALREADY_PLATFORM_ADMINISTRATOR"
      ? "This person is already a Platform Administrator."
      : "The Platform Administrator invitation could not be created.";
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, action: "platform_administrator.invite", result: "failure" });
    return NextResponse.json({ error: message }, { status: message.startsWith("This person") ? 409 : 503, headers: { "x-request-id": traceId } });
  }
}
