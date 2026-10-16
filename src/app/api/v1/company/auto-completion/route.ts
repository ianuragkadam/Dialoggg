import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { requireCompanyRole } from "@/lib/guard";
import { validateMutationRequest } from "@/lib/request-security";
import { getProjectPlan } from "@/lib/gantt-cascade";

export async function PATCH(request: NextRequest) {
  const guarded = await requireCompanyRole(["owner", "admin"]);
  if ("error" in guarded) return guarded.error;
  const actor = guarded.actor;
  if (!actor.companyId || actor.rolePreview || actor.actualCompanyRole !== actor.companyRole) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (await validateMutationRequest(request, actor)) return NextResponse.json({ error: "The request could not be verified." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.enabled !== "boolean") return NextResponse.json({ error: "Choose On or Off." }, { status: 400 });
  db.transaction(() => {
    const current = db.prepare("SELECT auto_completion_enabled FROM company WHERE id=?").get(actor.companyId) as { auto_completion_enabled: number } | undefined;
    if (current?.auto_completion_enabled === 1 && !body.enabled) {
      const projects = db.prepare("SELECT id FROM project WHERE company_id=?").all(actor.companyId) as Array<{ id: number }>;
      const snapshot = db.prepare("UPDATE task SET progress=? WHERE id=? AND project_id=? AND progress_mode='auto'");
      for (const project of projects) {
        const plan = getProjectPlan(project.id, actor.companyId);
        for (const task of plan?.tasks ?? []) if (task.is_header === 0) snapshot.run(task.progress, task.id, project.id);
      }
    }
    db.prepare("UPDATE company SET auto_completion_enabled=? WHERE id=?").run(body.enabled ? 1 : 0, actor.companyId);
    db.prepare("UPDATE project SET plan_version=plan_version+1 WHERE company_id=?").run(actor.companyId);
  })();
  return NextResponse.json({ enabled: body.enabled }, { headers: { "cache-control": "no-store" } });
}
