import { NextRequest } from "next/server";
import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { apiError, apiSuccess } from "@/lib/api-response";
import { validateMutationRequest } from "@/lib/request-security";
import { requestId } from "@/lib/security";
import { createResource, normalizeResourceName } from "@/lib/resources";
import { queueGoogleReconciliation } from "@/lib/google-calendar-queue";

function owner(actor: Awaited<ReturnType<typeof getCurrentActor>>) {
  return actor?.contextType === "company" && actor.actualCompanyRole === "owner" && !actor.rolePreview
    && !!actor.companyId && !!actor.membershipId;
}

export async function GET(request: NextRequest) {
  const trace = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", trace);
  if (!owner(actor)) return apiSuccess({ show: false }, trace);
  const answered = db.prepare("SELECT 1 FROM owner_schedule_prompt WHERE membership_id = ?").get(actor!.membershipId);
  const linked = db.prepare("SELECT 1 FROM resource WHERE company_id = ? AND linked_membership_id = ?").get(actor!.companyId, actor!.membershipId);
  return apiSuccess({ show: !answered && !linked }, trace);
}

export async function POST(request: NextRequest) {
  const trace = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", trace);
  if (!owner(actor)) return apiError(403, "ACTION_FORBIDDEN", "Only an Owner can answer this prompt.", trace);
  if (await validateMutationRequest(request, actor!)) return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", trace);
  const body = await request.json().catch(() => null) as { answer?: unknown } | null;
  if (body?.answer !== "yes" && body?.answer !== "not_now") return apiError(400, "VALIDATION_FAILED", "Choose Yes or Not now.", trace);
  const answer = body.answer;
  try {
    const result = db.transaction(() => {
      if (db.prepare("SELECT 1 FROM owner_schedule_prompt WHERE membership_id = ?").get(actor!.membershipId)) return { answered: true, created: false };
      let created = false;
      if (answer === "yes" && !db.prepare("SELECT 1 FROM resource WHERE linked_membership_id = ? AND company_id = ?").get(actor!.membershipId, actor!.companyId)) {
        const identity = db.prepare("SELECT first_name, last_name FROM identity WHERE id = ?").get(actor!.identityId) as { first_name: string; last_name: string };
        const base = normalizeResourceName(`${identity.first_name} ${identity.last_name}`).name || "Owner";
        let name = base;
        for (let suffix = 2; db.prepare("SELECT 1 FROM resource WHERE company_id = ? AND normalized_name = ?").get(actor!.companyId, normalizeResourceName(name).normalizedName); suffix++) name = `${base} (${suffix})`;
        const normalized = normalizeResourceName(name);
        createResource(actor!.companyId!, { ...normalized, category: "Team", email: "", phone: "", linkedMembershipId: actor!.membershipId! });
        created = true;
      }
      db.prepare("INSERT INTO owner_schedule_prompt(membership_id, answer) VALUES (?, ?)").run(actor!.membershipId, answer);
      return { answered: true, created };
    })();
    if (result.created) queueGoogleReconciliation(actor!.companyId!, "resource.create");
    return apiSuccess(result, trace);
  } catch {
    return apiError(503, "OWNER_RESOURCE_FAILED", "Could not save your choice. Please try again.", trace);
  }
}
