import { NextRequest, NextResponse } from "next/server";

const PREVIEW_ROLES = new Set(["admin", "employee", "external"]);
const PREVIEW_ALLOWED_PATHS = new Set(["/api/v1/me/role-preview", "/api/auth/logout", "/api/auth/login"]);

export function middleware(request: NextRequest) {
  const previewRole = request.cookies.get("dialoggg_role_preview")?.value;
  const isWrite = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (PREVIEW_ROLES.has(previewRole ?? "") && isWrite && !PREVIEW_ALLOWED_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.json({ error: { code: "ROLE_PREVIEW_READ_ONLY", message: "Role preview is read-only. Switch back to Owner to make changes." } }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
