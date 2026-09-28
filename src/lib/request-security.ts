import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { CSRF_COOKIE, type Actor } from "@/lib/auth";
import { sha256 } from "@/lib/security";

export async function validateMutationRequest(request: NextRequest, actor: Actor, options: { allowRolePreview?: boolean } = {}) {
  if (!validateRequestOrigin(request)) return "ORIGIN_REJECTED" as const;
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get("x-csrf-token");
  if (!cookieToken || !headerToken || cookieToken !== headerToken || sha256(headerToken) !== actor.csrfHash) {
    return "CSRF_REJECTED" as const;
  }
  if (actor.rolePreview && !options.allowRolePreview) return "ROLE_PREVIEW_READ_ONLY" as const;
  return null;
}

export function canonicalAppOrigin(request: NextRequest) {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) {
    const parsed = new URL(configured);
    if (
      !["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password ||
      parsed.pathname !== "/" || parsed.search || parsed.hash
    ) throw new Error("APP_BASE_URL_INVALID");
    return parsed.origin;
  }
  if (process.env.NODE_ENV === "production") throw new Error("APP_BASE_URL_REQUIRED");
  return request.nextUrl.origin;
}

export function validateRequestOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return origin === canonicalAppOrigin(request);
  } catch {
    return false;
  }
}
