import { redirect } from "next/navigation";
import db from "@/db";
import ProjectsPrototype from "@/components/ProjectsPrototype";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import type { ProjectUiRecord } from "@/lib/projects-ui";

export const metadata = { title: "All Projects | Dialoggg" };

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const external = user.user_type === "external";
  const canManage = user.user_type === "owner" || isAdmin(user);
  const baseSelect = `SELECT p.*, (SELECT MAX(date(t.start_date, '+' || MAX(t.duration - 1, 0) || ' day')) FROM task t WHERE t.project_id = p.id AND t.is_header = 0) AS derived_end_date FROM project p`;
  const projects = (external
    ? db.prepare(`${baseSelect} JOIN project_user pu ON pu.project_id = p.id WHERE pu.user_id = ? AND p.company_id = ? ORDER BY p.created_at DESC`).all(user.id, user.company_id)
    : db.prepare(`${baseSelect} WHERE p.company_id = ? ORDER BY p.created_at DESC`).all(user.company_id)) as ProjectUiRecord[];
  return <ProjectsPrototype projects={projects} canManage={canManage} external={external} />;
}
