import { notFound, redirect } from "next/navigation";
import db from "@/db";
import ProjectWorkspacePrototype from "@/components/ProjectWorkspacePrototype";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import type { ProjectUiRecord } from "@/lib/projects-ui";

export default async function ProjectViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const user = await getCurrentUser();
  if (!user) redirect("/login");
  const external = user.user_type === "external";
  const project = db.prepare(`SELECT p.*, pt.name AS project_type, COUNT(t.id) AS task_count, SUM(CASE WHEN t.progress >= 1 THEN 1 ELSE 0 END) AS completed_task_count, MAX(CASE WHEN t.is_header = 0 THEN date(t.start_date, '+' || MAX(t.duration - 1, 0) || ' day') END) AS derived_end_date FROM project p JOIN project_type pt ON pt.id = p.project_type_id AND pt.company_id = p.company_id LEFT JOIN task t ON t.project_id = p.id WHERE p.id = ? AND p.company_id = ? GROUP BY p.id`).get(Number(id), user.company_id) as ProjectUiRecord | undefined;
  if (!project) notFound();
  if (external) {
    const assigned = db.prepare("SELECT 1 FROM project_user WHERE project_id = ? AND user_id = ?").get(project.id, user.id);
    if (!assigned) notFound();
  }
  const internalUsers = external ? [] : db.prepare(`SELECT u.full_name, u.email FROM user u JOIN project_user pu ON pu.user_id = u.id WHERE pu.project_id = ? AND u.company_id = ?`).all(project.id, user.company_id) as Array<{ full_name: string | null; email: string }>;
  const assigned = !!db.prepare("SELECT 1 FROM project_user WHERE project_id = ? AND user_id = ?").get(project.id, user.id);
  return <ProjectWorkspacePrototype project={project} internalUsers={internalUsers} canManage={user.user_type === "owner" || isAdmin(user)} isOwner={user.user_type === "owner"} external={external} assigned={assigned} />;
}
