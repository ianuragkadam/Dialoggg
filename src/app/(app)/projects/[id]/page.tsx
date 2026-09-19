import { notFound, redirect } from "next/navigation";
import db from "@/db";
import ProjectWorkspacePrototype from "@/components/ProjectWorkspacePrototype";
import { getCurrentActor } from "@/lib/auth";
import { canViewProject, isProjectAssigned } from "@/lib/authorization";
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
        MAX(CASE WHEN t.is_header = 0 THEN date(t.start_date, '+' || MAX(t.duration - 1, 0) || ' day') END) AS derived_end_date
       FROM project p JOIN project_type pt ON pt.id = p.project_type_id AND pt.company_id = p.company_id
       LEFT JOIN task t ON t.project_id = p.id AND t.external_visible = 1 WHERE p.id = ? AND p.company_id = ? GROUP BY p.id`
    : `SELECT p.id, p.project_type_id, p.name, p.status, p.version, p.client_name, p.client_email,
        p.address, p.city, p.state, p.zip, p.phone, p.start_date, p.end_date, p.note,
        pt.name AS project_type, COUNT(t.id) AS task_count,
        SUM(CASE WHEN t.progress >= 1 THEN 1 ELSE 0 END) AS completed_task_count,
        MAX(CASE WHEN t.is_header = 0 THEN date(t.start_date, '+' || MAX(t.duration - 1, 0) || ' day') END) AS derived_end_date
       FROM project p JOIN project_type pt ON pt.id = p.project_type_id AND pt.company_id = p.company_id
       LEFT JOIN task t ON t.project_id = p.id WHERE p.id = ? AND p.company_id = ? GROUP BY p.id`;
  const project = db.prepare(select).get(projectId, actor.companyId) as ProjectUiRecord | undefined;
  if (!project) notFound();
  const internalUsers = external ? [] : db.prepare(`SELECT trim(i.first_name || ' ' || i.last_name) AS full_name, i.normalized_email AS email
    FROM identity i JOIN company_membership cm ON cm.identity_id = i.id
    JOIN project_membership pm ON pm.company_membership_id = cm.id
    WHERE pm.project_id = ? AND cm.company_id = ? AND cm.status = 'active' ORDER BY lower(i.first_name), lower(i.last_name)`).all(project.id, actor.companyId) as Array<{ full_name: string | null; email: string }>;
  const assigned = isProjectAssigned(project.id, actor.membershipId);
  return <ProjectWorkspacePrototype project={project} internalUsers={internalUsers} canManage={actor.companyRole === "owner" || actor.companyRole === "admin"} isOwner={actor.companyRole === "owner"} external={external} assigned={assigned} />;
}
