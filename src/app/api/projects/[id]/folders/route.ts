import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import {
  configureProjectFolder,
  listProjectFolderChoices,
  MicrosoftStorageError,
  openProjectFolder,
  projectFoldersSnapshot,
} from "@/lib/microsoft-storage";
import { validateMutationRequest } from "@/lib/request-security";
import { recordAudit, requestId } from "@/lib/security";

function projectId(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function message(error: MicrosoftStorageError) {
  if (error.code === "PROJECT_NOT_FOUND") return "Project not found.";
  if (error.kind === "authorization") return "Reconnect the company Microsoft Storage connection to continue.";
  if (error.kind === "permission") return "Microsoft denied access to this folder. Ask a Microsoft 365 administrator to restore permission.";
  if (error.kind === "missing") return "The saved Microsoft folder is missing or moved. An Owner or Admin can relink it.";
  if (error.kind === "transient") return "Microsoft Graph is temporarily unavailable. Try again.";
  return "The Microsoft folder action could not be completed.";
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = requestId();
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", id);
  const target = projectId((await params).id);
  if (!target) return apiError(404, "PROJECT_NOT_FOUND", "Project not found.", id);
  try { return apiSuccess(projectFoldersSnapshot(actor, target), id); }
  catch (error) {
    const domain = error instanceof MicrosoftStorageError ? error : new MicrosoftStorageError("MICROSOFT_FOLDER_STATUS_FAILED", "transient", 503);
    return apiError(domain.status, domain.code, message(domain), id);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", id);
  const target = projectId((await params).id);
  if (!target) return apiError(404, "PROJECT_NOT_FOUND", "Project not found.", id);
  if (await validateMutationRequest(request, actor)) return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", id);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return apiError(400, "INVALID_JSON", "Choose a folder action.", id);
  const action = String(body.action ?? "");
  const kind = body.kind === "private" ? "private" as const : body.kind === "common" ? "common" as const : null;

  try {
    if (action === "choices") return apiSuccess({ choices: await listProjectFolderChoices(actor, target) }, id);
    if (action === "configure") {
      if (!kind || body.confirmed !== true || !['create', 'link'].includes(String(body.method))) return apiError(400, "FOLDER_CONFIRMATION_REQUIRED", "Choose a Common or Private folder method and confirm Microsoft permissions remain unchanged.", id);
      const result = await configureProjectFolder(actor, target, { kind, method: body.method as "create" | "link", choice: typeof body.choice === "string" ? body.choice : undefined });
      recordAudit({ requestId: id, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, projectId: target, action: "microsoft_folder.configure", targetType: "project_folder_mapping", targetId: kind, result: "success", metadata: { kind, method: String(body.method) } });
      return apiSuccess(result, id);
    }
    if (action === "open") {
      if (!kind) return apiError(400, "FOLDER_KIND_REQUIRED", "Choose Common or Private.", id);
      const result = await openProjectFolder(actor, target, kind);
      recordAudit({ requestId: id, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, projectId: target, action: "microsoft_folder.open", targetType: "project_folder_mapping", targetId: kind, result: "success", metadata: { kind } });
      return apiSuccess(result, id);
    }
    return apiError(400, "ACTION_INVALID", "Choose a valid folder action.", id);
  } catch (error) {
    const domain = error instanceof MicrosoftStorageError ? error : new MicrosoftStorageError("MICROSOFT_FOLDER_ACTION_FAILED", "transient", 503);
    recordAudit({ requestId: id, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId, companyId: actor.companyId, projectId: target, action: `microsoft_folder.${action || "unknown"}`, targetType: "project_folder_mapping", targetId: kind, result: "failure", metadata: { kind: kind || "unknown", errorCode: domain.code } });
    return apiError(domain.status, domain.code, message(domain), id);
  }
}
