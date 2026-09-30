import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor, ROLE_PREVIEW_COOKIE } from "@/lib/auth";
import { validateMutationRequest } from "@/lib/request-security";
import { requestId } from "@/lib/security";

const ROLE_RANK: Record<string, number> = { owner: 0, admin: 1, employee: 2, external: 3 };

export async function POST(request: NextRequest) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId);
  if (await validateMutationRequest(request, actor, { allowRolePreview: true })) {
    return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  }
  const actualRole = actor.actualCompanyRole;
  if (actor.contextType !== "company" || (actualRole !== "owner" && actualRole !== "admin")) {
    return apiError(403, "ACTION_FORBIDDEN", "Only a company Owner or Admin can preview roles beneath them.", traceId);
  }

  let body: { role?: unknown };
  try { body = await request.json(); } catch {
    return apiError(400, "VALIDATION_FAILED", "Choose a role to preview.", traceId);
  }
  const role = typeof body.role === "string" ? body.role : "";
  if (!(role in ROLE_RANK) || ROLE_RANK[role] < ROLE_RANK[actualRole]) {
    return apiError(403, "ACTION_FORBIDDEN", "You can only preview your own role or a role beneath it.", traceId);
  }

  const cookieStore = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
  if (role === actualRole) cookieStore.set(ROLE_PREVIEW_COOKIE, "", { ...options, maxAge: 0 });
  else cookieStore.set(ROLE_PREVIEW_COOKIE, role, { ...options, expires: new Date(actor.expiresAt) });

  return apiSuccess({ role, rolePreview: role !== actualRole }, traceId);
}
