import { NextRequest } from "next/server";
import db from "@/db";
import { getCurrentActor } from "@/lib/auth";
import { apiError, apiSuccess } from "@/lib/api-response";
import { validateMutationRequest } from "@/lib/request-security";
import { requestId } from "@/lib/security";

const COMPANY_STEPS = new Set(["types", "team", "resources", "project", "plan", "calendar", "calendars"]);
const PERSONAL_STEPS = new Set(["logo", "template", "client", "phone", "microsoft"]);
const ROLE_STEPS = new Set(["my-projects", "employee-plan", "employee-calendar", "employee-phone", "client-project", "client-calendar", "client-phone"]);
const STEPS = new Set([...COMPANY_STEPS, ...PERSONAL_STEPS, ...ROLE_STEPS]);

function automaticSteps(companyId: number, membershipId: number) {
  const count = (sql: string, ...args: number[]) => Number((db.prepare(sql).get(...args) as { count: number }).count) > 0;
  const checks: Record<string, boolean> = {
    types: count("SELECT COUNT(*) count FROM project_type WHERE company_id = ? AND status = 'active'", companyId),
    team: count("SELECT COUNT(*) count FROM company_membership WHERE company_id = ? AND role IN ('employee','admin') AND status = 'active'", companyId),
    resources: count("SELECT COUNT(*) count FROM resource WHERE company_id = ? AND status = 'active'", companyId),
    project: count("SELECT COUNT(*) count FROM project WHERE company_id = ? AND status = 'active'", companyId),
    plan: count("SELECT COUNT(*) count FROM task t JOIN project p ON p.id=t.project_id WHERE p.company_id = ? AND t.is_header=0", companyId),
    // Browsing calendars is a user action, not something an Event row can prove.
    calendar: false,
    calendars: false,
    logo: count("SELECT COUNT(*) count FROM company WHERE id = ? AND logo_path IS NOT NULL AND trim(logo_path) <> ''", companyId),
    template: count("SELECT COUNT(*) count FROM project_template WHERE company_id = ? AND status = 'active'", companyId),
    client: count("SELECT COUNT(*) count FROM company_membership WHERE company_id = ? AND role='external' AND status='active'", companyId),
    phone: false,
    microsoft: count("SELECT COUNT(*) count FROM microsoft_connection WHERE company_id = ? AND state='healthy'", companyId),
  };
  // Calendar review and phone subscription remain manual confirmations.
  void membershipId;
  return checks;
}

export async function GET(request: NextRequest) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId);
  if (actor.contextType !== "company" || !actor.companyId || !actor.membershipId) {
    return apiSuccess({ completions: [], automatic: {} }, traceId);
  }
  const role = actor.companyRole;
  const automatic = role === "owner" || role === "admin" ? automaticSteps(actor.companyId, actor.membershipId) : {};
  const completions = db.prepare(`SELECT step_key AS stepKey FROM help_checklist_completion
    WHERE company_id = ? AND (membership_id IS NULL OR membership_id = ?)`)
    .all(actor.companyId, actor.membershipId) as Array<{ stepKey: string }>;
  return apiSuccess({ completions: completions.map(row => row.stepKey), automatic }, traceId);
}

export async function POST(request: NextRequest) {
  const traceId = requestId(request);
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", traceId);
  if (actor.contextType !== "company" || !actor.companyId || !actor.membershipId || !actor.companyRole) {
    return apiError(403, "ACTION_FORBIDDEN", "Checklist confirmations are only available in a company context.", traceId);
  }
  if (await validateMutationRequest(request, actor)) return apiError(403, "ACTION_FORBIDDEN", "The request could not be verified.", traceId);
  const body = await request.json().catch(() => null) as { stepKey?: unknown; completed?: unknown } | null;
  const stepKey = typeof body?.stepKey === "string" ? body.stepKey : "";
  if (!STEPS.has(stepKey) || typeof body?.completed !== "boolean") return apiError(400, "VALIDATION_FAILED", "Choose a valid checklist step.", traceId);
  if ((COMPANY_STEPS.has(stepKey) || PERSONAL_STEPS.has(stepKey)) && !["owner", "admin"].includes(actor.companyRole)) return apiError(403, "ACTION_FORBIDDEN", "This setup step is for Owners and Admins.", traceId);
  if (ROLE_STEPS.has(stepKey) && ["owner", "admin"].includes(actor.companyRole)) return apiError(403, "ACTION_FORBIDDEN", "Choose the checklist for your current role.", traceId);
  if (stepKey.startsWith("employee-") && actor.companyRole !== "employee") return apiError(403, "ACTION_FORBIDDEN", "This step is for Employees.", traceId);
  if (stepKey.startsWith("client-") && actor.companyRole !== "external") return apiError(403, "ACTION_FORBIDDEN", "This step is for Clients.", traceId);
  if (stepKey === "my-projects" && actor.companyRole === "external") return apiError(403, "ACTION_FORBIDDEN", "Choose the checklist for your current role.", traceId);
  const membershipId = COMPANY_STEPS.has(stepKey) ? null : actor.membershipId;
  if (body.completed) {
    db.prepare(`INSERT OR IGNORE INTO help_checklist_completion(company_id, membership_id, step_key)
      VALUES (?, ?, ?)`).run(actor.companyId, membershipId, stepKey);
  } else {
    db.prepare(`DELETE FROM help_checklist_completion WHERE company_id = ? AND membership_id IS ? AND step_key = ?`)
      .run(actor.companyId, membershipId, stepKey);
  }
  return apiSuccess({ stepKey, completed: body.completed }, traceId);
}
