import { redirect } from "next/navigation";
import db from "@/db";
import ProjectsPrototype from "@/components/ProjectsPrototype";
import { getCurrentActor } from "@/lib/auth";
import type { ProjectUiRecord } from "@/lib/projects-ui";

export const metadata = { title: "All Projects | Dialoggg" };

export default async function ProjectsPage() {
  const actor = await getCurrentActor();
  if (!actor || actor.contextType !== "company" || !actor.companyId) redirect("/login");
  const external = actor.companyRole === "external";
  const canManage = actor.companyRole === "owner" || actor.companyRole === "admin";
  const baseSelect = external
    ? `SELECT p.id, p.project_type_id, p.name, p.status, NULL AS client_name, NULL AS client_email,
        NULL AS address, NULL AS city, NULL AS state, NULL AS zip, NULL AS phone,
        p.start_date, p.end_date, NULL AS note, pt.name AS project_type,
        (SELECT MAX(date(t.start_date, '+' || MAX(t.duration - 1, 0) || ' day')) FROM task t WHERE t.project_id = p.id AND t.is_header = 0 AND t.external_visible = 1) AS derived_end_date
       FROM project p JOIN project_type pt ON pt.id = p.project_type_id AND pt.company_id = p.company_id`
    : `SELECT p.id, p.project_type_id, p.name, p.status, p.client_name, p.client_email,
        p.address, p.city, p.state, p.zip, p.phone, p.start_date, p.end_date, p.note,
        pt.name AS project_type,
        (SELECT MAX(date(t.start_date, '+' || MAX(t.duration - 1, 0) || ' day')) FROM task t WHERE t.project_id = p.id AND t.is_header = 0) AS derived_end_date
       FROM project p JOIN project_type pt ON pt.id = p.project_type_id AND pt.company_id = p.company_id`;
  const projects = (external
    ? db.prepare(`${baseSelect} JOIN project_membership pm ON pm.project_id = p.id WHERE pm.company_membership_id = ? AND p.company_id = ? ORDER BY p.created_at DESC`).all(actor.membershipId, actor.companyId)
    : db.prepare(`${baseSelect} WHERE p.company_id = ? ORDER BY p.created_at DESC`).all(actor.companyId)) as ProjectUiRecord[];
  return <ProjectsPrototype projects={projects} canManage={canManage} external={external} />;
}
