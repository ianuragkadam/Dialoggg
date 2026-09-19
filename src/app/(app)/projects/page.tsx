import { redirect } from "next/navigation";
import db from "@/db";
import ProjectsPrototype from "@/components/ProjectsPrototype";
import { getCurrentActor } from "@/lib/auth";
import { workingDayEnd } from "@/lib/dates";
import type { ProjectUiRecord } from "@/lib/projects-ui";

export const metadata = { title: "All Projects | Dialoggg" };

export default async function ProjectsPage() {
  const actor = await getCurrentActor();
  if (!actor || actor.contextType !== "company" || !actor.companyId) redirect("/login");
  const external = actor.companyRole === "external";
  const canManage = actor.companyRole === "owner" || actor.companyRole === "admin";
  const baseSelect = external
    ? `SELECT p.id, p.project_type_id, p.name, p.status, p.version, NULL AS client_name, NULL AS client_email,
        NULL AS address, NULL AS city, NULL AS state, NULL AS zip, NULL AS phone,
        p.start_date, p.end_date, NULL AS note, pt.name AS project_type, NULL AS derived_end_date
       FROM project p JOIN project_type pt ON pt.id = p.project_type_id AND pt.company_id = p.company_id`
    : `SELECT p.id, p.project_type_id, p.name, p.status, p.version, p.client_name, p.client_email,
        p.address, p.city, p.state, p.zip, p.phone, p.start_date, p.end_date, p.note,
        pt.name AS project_type, p.end_date AS derived_end_date
       FROM project p JOIN project_type pt ON pt.id = p.project_type_id AND pt.company_id = p.company_id`;
  let projects = (external
    ? db.prepare(`${baseSelect} JOIN project_membership pm ON pm.project_id = p.id WHERE pm.company_membership_id = ? AND p.company_id = ? ORDER BY p.created_at DESC`).all(actor.membershipId, actor.companyId)
    : db.prepare(`${baseSelect} WHERE p.company_id = ? ORDER BY p.created_at DESC`).all(actor.companyId)) as ProjectUiRecord[];
  if (external) {
    projects = projects.map(project => {
      const tasks = db.prepare("SELECT start_date, duration, allow_saturday, allow_sunday FROM task WHERE project_id = ? AND is_header = 0 AND external_visible = 1")
        .all(project.id) as Array<{ start_date: string; duration: number; allow_saturday: number; allow_sunday: number }>;
      const derivedEnd = tasks.reduce<string | null>((latest, task) => {
        const end = workingDayEnd(task.start_date, task.duration, { allowSaturday: !!task.allow_saturday, allowSunday: !!task.allow_sunday });
        return !latest || end > latest ? end : latest;
      }, null);
      return { ...project, derived_end_date: derivedEnd };
    });
  }
  return <ProjectsPrototype projects={projects} canManage={canManage} external={external} />;
}
