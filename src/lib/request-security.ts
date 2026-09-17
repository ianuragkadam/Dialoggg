import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { CSRF_COOKIE, type Actor } from "@/lib/auth";
import { sha256 } from "@/lib/security";

export async function validateMutationRequest(request: NextRequest, actor: Actor) {
  if (!validateRequestOrigin(request)) return "ORIGIN_REJECTED" as const;
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get("x-csrf-token");
  if (!cookieToken || !headerToken || cookieToken !== headerToken || sha256(headerToken) !== actor.csrfHash) {
    return "CSRF_REJECTED" as const;
  }
  return null;
}

export function validateRequestOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  const expectedOrigin = host ? `${protocol}://${host}` : request.nextUrl.origin;
  return !!origin && origin === expectedOrigin;
}
