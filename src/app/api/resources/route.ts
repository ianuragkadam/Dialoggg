import { NextRequest, NextResponse } from "next/server";

import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { validateMutationRequest } from "@/lib/request-security";
import {
  createResource,
  listResources,
  normalizeResourceName,
  ResourceEmailConflictError,
  ResourceValidationError,
  validateResourceInput,
} from "@/lib/resources";
import { type ResourceCategoryUi } from "@/lib/resources-ui";
import { recordAudit, requestId } from "@/lib/security";

async function companyActor() {
  const actor = await getCurrentActor();
  if (!actor) return { actor: null, status: 401 } as const;
  if (actor.contextType !== "company" || !actor.companyId || !actor.membershipId || actor.companyRole === "external") {
    return { actor: null, status: 403 } as const;
  }
  return { actor, status: 200 } as const;
}

function categoryForLegacyBody(companyId: number, body: Record<string, unknown>) {
  if (body.category_id !== undefined && body.category_id !== null && body.category_id !== "") {
    const row = db.prepare("SELECT name FROM resource_category WHERE id = ? AND company_id = ?")
      .get(Number(body.category_id), companyId) as { name: string } | undefined;
    return row?.name ?? null;
  }
  return typeof body.category_name === "string" ? body.category_name.trim() : null;
}

export async function GET() {
  const auth = await companyActor();
  if (!auth.actor) return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  const actor = auth.actor;
  const categories = db.prepare("SELECT id, name FROM resource_category WHERE company_id = ? ORDER BY name")
    .all(actor.companyId) as Array<{ id: number; name: string }>;
  const categoryIds = new Map(categories.map(category => [category.name, category.id]));
  const resources = listResources(actor.companyId).map(resource => ({
    ...resource,
    category_id: categoryIds.get(resource.category),
  }));
  return NextResponse.json({ categories, resources }, { headers: { "cache-control": "no-store" } });
}

// Compatibility endpoint for existing clients. It delegates to the v1 domain rules;
// custom categories are intentionally no longer created here.
export async function POST(request: NextRequest) {
  const traceId = requestId(request);
  const auth = await companyActor();
  if (!auth.actor) return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  const actor = auth.actor;
  if (actor.companyRole !== "owner" && actor.companyRole !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await validateMutationRequest(request, actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const parsedName = normalizeResourceName(body.name);
  const category = categoryForLegacyBody(actor.companyId, body);
  const email = typeof body.email === "string" ? body.email.trim().toLocaleLowerCase("en-US") : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const fields = validateResourceInput({ name: parsedName.name, category, email, phone });
  if (Object.keys(fields).length) return NextResponse.json({ error: "Validation failed", fields }, { status: 400 });
  try {
    const resource = createResource(actor.companyId, {
      ...parsedName,
      category: category as ResourceCategoryUi,
      email,
      phone,
      linkedMembershipId: null,
    });
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "resource.create", targetType: "resource", targetId: resource.id, result: "success", metadata: { endpoint: "legacy_compatibility" } });
    return NextResponse.json({ id: resource.id }, { headers: { "x-request-id": traceId, "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ResourceEmailConflictError || (error instanceof Error && error.message.includes("EMAIL_ALREADY_IN_USE"))) return NextResponse.json({ error: "This email is already used by a User or Resource in Dialoggg. Use a different email address.", fields: { email: "This email is already in use." } }, { status: 409, headers: { "x-request-id": traceId } });
    if (error instanceof ResourceValidationError) return NextResponse.json({ error: "Validation failed", fields: error.fields }, { status: 400 });
    if (error instanceof Error && /UNIQUE|ux_resource_company_normalized_name/i.test(error.message)) return NextResponse.json({ error: "Resource name already exists" }, { status: 409 });
    return NextResponse.json({ error: "Resource could not be created" }, { status: 503 });
  }
}
