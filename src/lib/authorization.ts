import db from "@/db";
import type { Actor, CompanyRole } from "@/lib/auth";

export type CompanyAction =
  | "manage_users"
  | "manage_owner_admin"
  | "manage_projects"
  | "view_all_projects"
  | "view_company_calendars"
  | "view_resources";

export type MembershipTarget = {
  membershipId: number;
  role: CompanyRole;
  status: string;
};

export function can(actor: Actor, action: CompanyAction): boolean {
  if (actor.contextType !== "company" || !actor.companyId || !actor.membershipId || !actor.companyRole) return false;
  switch (action) {
    case "manage_users":
    case "manage_projects":
      return actor.companyRole === "owner" || actor.companyRole === "admin";
    case "manage_owner_admin":
      return actor.companyRole === "owner";
    case "view_all_projects":
    case "view_company_calendars":
      return actor.companyRole !== "external";
    case "view_resources":
      return actor.companyRole !== "external";
  }
}

export function canManageMembership(actor: Actor, target: MembershipTarget): boolean {
  if (!can(actor, "manage_users")) return false;
  if (actor.companyRole === "owner") return true;
  return target.role === "employee" || target.role === "external";
}

export function canAssignMembershipProjects(actor: Actor, target: MembershipTarget): boolean {
  return canManageMembership(actor, target) && target.status !== "deactivated";
}

export function canSetMembershipRole(actor: Actor, target: MembershipTarget, nextRole: CompanyRole): boolean {
  if (target.membershipId === actor.membershipId && target.role !== nextRole) return false;
  if (actor.companyRole === "owner") return true;
  return (target.role === "employee" || target.role === "external")
    && (nextRole === "employee" || nextRole === "external");
}

export function isProjectAssigned(projectId: number, membershipId: number | null): boolean {
  if (!membershipId) return false;
  return !!db.prepare(`
    SELECT 1 FROM project_membership
    WHERE project_id = ? AND company_membership_id = ?
  `).get(projectId, membershipId);
}

export function canViewProject(actor: Actor, projectId: number): boolean {
  if (actor.contextType !== "company" || !actor.companyId || !actor.membershipId || !actor.companyRole) return false;
  const project = db.prepare("SELECT company_id FROM project WHERE id = ?").get(projectId) as { company_id: number } | undefined;
  if (!project || project.company_id !== actor.companyId) return false;
  return actor.companyRole !== "external" || isProjectAssigned(projectId, actor.membershipId);
}

export function projectScopeSql(actor: Actor, alias = "p") {
  if (actor.contextType !== "company" || !actor.companyId || !actor.membershipId || !actor.companyRole) {
    return { sql: "1 = 0", args: [] as number[] };
  }
  if (actor.companyRole !== "external") return { sql: `${alias}.company_id = ?`, args: [actor.companyId] };
  return {
    sql: `${alias}.company_id = ? AND EXISTS (
      SELECT 1 FROM project_membership authorization_pm
      WHERE authorization_pm.project_id = ${alias}.id
        AND authorization_pm.company_membership_id = ?
    )`,
    args: [actor.companyId, actor.membershipId],
  };
}

export type InternalProjectDto = {
  id: number;
  project_type_id: number;
  project_type: string;
  name: string;
  status: string;
  client_name: string | null;
  client_email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  start_date: string;
  end_date: string | null;
  note: string | null;
  external_gantt_enabled: number;
};

export type ExternalProjectDto = Pick<InternalProjectDto,
  "id" | "project_type" | "name" | "status" | "start_date" | "end_date" | "external_gantt_enabled"
>;

export function serializeProjectForActor(actor: Actor, row: InternalProjectDto): InternalProjectDto | ExternalProjectDto {
  if (actor.companyRole !== "external") return row;
  return {
    id: row.id,
    project_type: row.project_type,
    name: row.name,
    status: row.status,
    start_date: row.start_date,
    end_date: row.end_date,
    external_gantt_enabled: row.external_gantt_enabled,
  };
}
