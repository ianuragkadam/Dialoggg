import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor, ROLE_PREVIEW_COOKIE } from "@/lib/auth";
import { validateMutationRequest } from "@/lib/request-security";
import { requestId } from "@/lib/security";

const PREVIEW_ROLES = new Set(["owner", "admin", "employee", "external"]);

export async function POST(request: NextRequest) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId);
  if (await validateMutationRequest(request, actor, { allowRolePreview: true })) {
    return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  }
  if (actor.contextType !== "company" || actor.actualCompanyRole !== "owner") {
    return apiError(403, "ACTION_FORBIDDEN", "Only the company Owner can preview company roles.", traceId);
  }

  let body: { role?: unknown };
  try { body = await request.json(); } catch {
    return apiError(400, "VALIDATION_FAILED", "Choose a role to preview.", traceId);
  }
  const role = typeof body.role === "string" ? body.role : "";
  if (!PREVIEW_ROLES.has(role)) return apiError(400, "VALIDATION_FAILED", "Choose a valid company role.", traceId);

  const cookieStore = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
  if (role === "owner") cookieStore.set(ROLE_PREVIEW_COOKIE, "", { ...options, maxAge: 0 });
  else cookieStore.set(ROLE_PREVIEW_COOKIE, role, { ...options, expires: new Date(actor.expiresAt) });

  return apiSuccess({ role, rolePreview: role !== "owner" }, traceId);
}
