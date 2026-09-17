import { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { INTEGRATION_SESSION_COOKIE, integrationSession, integrationSnapshot } from "@/lib/integration-setup";
import { requestId } from "@/lib/security";

export async function GET(request: NextRequest) {
  const id = requestId(request);
  const session = integrationSession(request.cookies.get(INTEGRATION_SESSION_COOKIE)?.value);
  if (!session || session.access_kind !== "review") return apiError(401, "REVIEW_SESSION_REQUIRED", "Open the private review invitation.", id);
  return apiSuccess(integrationSnapshot(session), id);
}
