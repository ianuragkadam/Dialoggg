import { notFound, redirect } from "next/navigation";
import db from "@/db";
import ProjectWorkspacePrototype from "@/components/ProjectWorkspacePrototype";
import { getCurrentActor } from "@/lib/auth";
import { canViewProject, isProjectAssigned } from "@/lib/authorization";
import { workingDayEnd } from "@/lib/dates";
import { getProjectPlan } from "@/lib/gantt-cascade";
import type { ProjectUiRecord } from "@/lib/projects-ui";

export default async function ProjectViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || !canViewProject(actor, projectId)) notFound();
  const external = actor.companyRole === "external";
  const select = external
    ? `SELECT p.id, p.project_type_id, p.name, p.status, p.version, NULL AS client_name, NULL AS client_email,
        NULL AS address, NULL AS city, NULL AS state, NULL AS zip, NULL AS phone,
        p.start_date, p.end_date, NULL AS note, pt.name AS project_type,
        COUNT(t.id) AS task_count, SUM(CASE WHEN t.progress >= 1 THEN 1 ELSE 0 END) AS completed_task_count,
        NULL AS derived_end_date
       FROM project p JOIN project_type pt ON pt.id = p.project_type_id AND pt.company_id = p.company_id
       LEFT JOIN task t ON t.project_id = p.id AND t.is_header = 0 AND t.external_visible = 1 WHERE p.id = ? AND p.company_id = ? GROUP BY p.id`
    : `SELECT p.id, p.project_type_id, p.name, p.status, p.version, p.client_name, p.client_email,
        p.address, p.city, p.state, p.zip, p.phone, p.start_date, p.end_date, p.note,
        pt.name AS project_type, COUNT(t.id) AS task_count,
        SUM(CASE WHEN t.progress >= 1 THEN 1 ELSE 0 END) AS completed_task_count,
        p.end_date AS derived_end_date
       FROM project p JOIN project_type pt ON pt.id = p.project_type_id AND pt.company_id = p.company_id
       LEFT JOIN task t ON t.project_id = p.id AND t.is_header = 0 WHERE p.id = ? AND p.company_id = ? GROUP BY p.id`;
  let project = db.prepare(select).get(projectId, actor.companyId) as ProjectUiRecord | undefined;
  if (!project) notFound();
  if (external) {
    const tasks = db.prepare("SELECT start_date, duration, allow_saturday, allow_sunday FROM task WHERE project_id = ? AND is_header = 0 AND external_visible = 1")
      .all(projectId) as Array<{ start_date: string; duration: number; allow_saturday: number; allow_sunday: number }>;
    const derivedEnd = tasks.reduce<string | null>((latest, task) => {
      const end = workingDayEnd(task.start_date, task.duration, { allowSaturday: !!task.allow_saturday, allowSunday: !!task.allow_sunday });
      return !latest || end > latest ? end : latest;
    }, null);
    project = { ...project, derived_end_date: derivedEnd };
  } else {
    // The persisted project.end_date can be stale for plans created before
    // end-date recalculation was introduced. Use the same calculated plan
    // end date shown by the Project Plan, derived from its scheduled leaves.
    const plan = getProjectPlan(projectId, actor.companyId!);
    const planEndDate = plan?.project.endDate ?? null;
    project = { ...project, end_date: planEndDate, derived_end_date: planEndDate };
  }
  const projectUsers = external ? [] : db.prepare(`SELECT trim(i.first_name || ' ' || i.last_name) AS full_name, i.normalized_email AS email, cm.role
    FROM identity i JOIN company_membership cm ON cm.identity_id = i.id
    JOIN project_membership pm ON pm.company_membership_id = cm.id
    WHERE pm.project_id = ? AND cm.company_id = ? AND cm.status = 'active' ORDER BY lower(i.first_name), lower(i.last_name)`).all(project.id, actor.companyId) as Array<{ full_name: string | null; email: string; role: string }>;
  const creator = external ? null : db.prepare(`SELECT COALESCE(NULLIF(trim(i.first_name || ' ' || i.last_name), ''), NULLIF(u.full_name, ''), u.email) AS name
    FROM project p
    LEFT JOIN company_membership cm ON cm.id = p.created_by_membership_id AND cm.company_id = p.company_id
    LEFT JOIN identity i ON i.id = cm.identity_id
    LEFT JOIN user u ON u.id = p.created_by AND u.company_id = p.company_id
    WHERE p.id = ? AND p.company_id = ?`).get(project.id, actor.companyId) as { name: string | null } | undefined;
  const assigned = isProjectAssigned(project.id, actor.membershipId);
  return <ProjectWorkspacePrototype project={project} projectUsers={projectUsers} createdBy={creator?.name || null} identityId={actor.identityId} canManage={actor.companyRole === "owner" || actor.companyRole === "admin"} isOwner={actor.companyRole === "owner"} external={external} assigned={assigned} />;
}
