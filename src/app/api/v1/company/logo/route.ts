import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { dataDirectory } from "@/db/connection";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import { COMPANY_LOGO_MAX_BYTES, companyLogoPath, inspectCompanyLogo, resolveCompanyLogoPath } from "@/lib/company-logo";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

export const runtime = "nodejs";

function companyIdFromActor(actor: Awaited<ReturnType<typeof getCurrentActor>>) {
  return actor?.contextType === "company" ? actor.companyId : null;
}

export async function GET(request: NextRequest) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  const companyId = companyIdFromActor(actor);
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId);
  if (!companyId) return apiError(403, "ACTION_FORBIDDEN", "Switch to a company to view its logo.", traceId);

  const company = db.prepare("SELECT logo_path FROM company WHERE id = ?").get(companyId) as { logo_path: string | null } | undefined;
  if (!company?.logo_path) return apiError(404, "COMPANY_LOGO_NOT_FOUND", "This company has not uploaded a logo.", traceId);
  const filePath = resolveCompanyLogoPath(companyId, company.logo_path);
  if (!filePath) return apiError(404, "COMPANY_LOGO_NOT_FOUND", "This company has not uploaded a logo.", traceId);
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = extension === ".png" ? "image/png" : extension === ".jpg" ? "image/jpeg" : extension === ".webp" ? "image/webp" : null;
  if (!mimeType) return apiError(404, "COMPANY_LOGO_NOT_FOUND", "This company has not uploaded a logo.", traceId);

  try {
    const contents = await readFile(filePath);
    return new NextResponse(contents, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(contents.byteLength),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "X-Request-Id": traceId,
      },
    });
  } catch {
    return apiError(404, "COMPANY_LOGO_NOT_FOUND", "This company has not uploaded a logo.", traceId);
  }
}

export async function POST(request: NextRequest) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId);
  if (actor.contextType !== "company" || !actor.companyId || actor.companyRole !== "owner") {
    return apiError(403, "ACTION_FORBIDDEN", "Only the Company Owner can upload its logo.", traceId);
  }
  if (await validateMutationRequest(request, actor)) {
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "company.logo.update", result: "denied", metadata: { reason: "request_protection" } });
    return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > COMPANY_LOGO_MAX_BYTES + 128 * 1024) {
    return apiError(413, "COMPANY_LOGO_TOO_LARGE", "Choose an image no larger than 2 MB.", traceId);
  }

  const form = await request.formData().catch(() => null);
  const upload = form?.get("logo");
  if (!(upload instanceof File)) return apiError(400, "COMPANY_LOGO_REQUIRED", "Choose an image to upload.", traceId);
  const bytes = new Uint8Array(await upload.arrayBuffer());
  const image = inspectCompanyLogo(upload.type, bytes);
  if (!image) return apiError(400, "COMPANY_LOGO_INVALID", "Use a valid PNG, JPEG, or WebP image up to 2 MB.", traceId);

  const filename = `${randomUUID()}.${image.extension}`;
  const filePath = companyLogoPath(actor.companyId, filename);
  if (!filePath) return apiError(400, "COMPANY_LOGO_INVALID", "The image could not be saved.", traceId);
  const storedPath = path.relative(dataDirectory, filePath).split(path.sep).join("/");
  const existing = db.prepare("SELECT logo_path FROM company WHERE id = ?").get(actor.companyId) as { logo_path: string | null } | undefined;
  if (!existing) return apiError(404, "COMPANY_NOT_FOUND", "The company could not be found.", traceId);

  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
    const result = db.prepare("UPDATE company SET logo_path = ? WHERE id = ?").run(storedPath, actor.companyId);
    if (result.changes !== 1) throw new Error("COMPANY_LOGO_UPDATE_FAILED");
  } catch {
    await unlink(filePath).catch(() => undefined);
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "company.logo.update", result: "failure", metadata: { reason: "storage_or_database_error" } });
    return apiError(503, "COMPANY_LOGO_UPDATE_FAILED", "The company logo could not be saved. Please try again.", traceId);
  }

  if (existing.logo_path) {
    const oldPath = resolveCompanyLogoPath(actor.companyId, existing.logo_path);
    if (oldPath && oldPath !== filePath) await unlink(oldPath).catch(() => undefined);
  }
  recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "company.logo.update", targetType: "company", targetId: actor.companyId, result: "success", metadata: { mimeType: image.mimeType, bytes: bytes.byteLength } });
  return apiSuccess({ logoUrl: `/api/v1/company/logo?v=${encodeURIComponent(filename)}` }, traceId);
}

export async function DELETE(request: NextRequest) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId);
  if (actor.contextType !== "company" || !actor.companyId || actor.companyRole !== "owner") {
    return apiError(403, "ACTION_FORBIDDEN", "Only the Company Owner can remove its logo.", traceId);
  }
  if (await validateMutationRequest(request, actor)) {
    recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "company.logo.remove", result: "denied", metadata: { reason: "request_protection" } });
    return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  }

  const company = db.prepare("SELECT logo_path FROM company WHERE id = ?").get(actor.companyId) as { logo_path: string | null } | undefined;
  if (!company) return apiError(404, "COMPANY_NOT_FOUND", "The company could not be found.", traceId);
  db.prepare("UPDATE company SET logo_path = NULL WHERE id = ?").run(actor.companyId);
  if (company.logo_path) {
    const filePath = resolveCompanyLogoPath(actor.companyId, company.logo_path);
    if (filePath) await unlink(filePath).catch(() => undefined);
  }
  recordAudit({ requestId: traceId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, action: "company.logo.remove", targetType: "company", targetId: actor.companyId, result: "success" });
  return apiSuccess({ removed: true }, traceId);
}
