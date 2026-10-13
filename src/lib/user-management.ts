import db from "@/db";
import type { Actor, CompanyRole } from "@/lib/auth";
import { canAssignMembershipProjects, canManageMembership, canSetMembershipRole } from "@/lib/authorization";

export type MembershipStatus = "pending" | "active" | "deactivated";

export type UserProjectDto = {
  id: number;
  name: string;
  projectType: string;
  assigned: boolean;
};

export type CompanyUserDto = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: CompanyRole;
  status: MembershipStatus;
  isCurrent: boolean;
  invitedAt: string | null;
  acceptedAt: string | null;
  lastActiveAt: string | null;
  linkedResource: { id: number; name: string; status: string } | null;
  projects: UserProjectDto[];
  permissions: {
    canEdit: boolean;
    canChangeRole: boolean;
    canDeactivate: boolean;
    canRestore: boolean;
    canCancelInvitation: boolean;
    canResendInvitation: boolean;
    canDelete: boolean;
    canAssignProjects: boolean;
    allowedRoles: CompanyRole[];
  };
};

export type DeletedCompanyUserDto = {
  id: number;
  name: string;
  email: string;
  removedAt: string;
};

type MembershipRow = {
  id: number;
  identity_id: number;
  legacy_user_id: number | null;
  first_name: string;
  last_name: string;
  normalized_email: string;
  phone: string | null;
  role: CompanyRole;
  status: MembershipStatus;
  invited_at: string | null;
  accepted_at: string | null;
  last_active_at: string | null;
  resource_id: number | null;
  resource_name: string | null;
  resource_status: string | null;
  removed_at: string | null;
};

function rowForMembership(membershipId: number, companyId: number) {
  return db.prepare(`
    SELECT cm.id, cm.identity_id, cm.legacy_user_id,
      COALESCE(cm.invited_first_name, i.first_name) AS first_name,
      COALESCE(cm.invited_last_name, i.last_name) AS last_name,
      i.normalized_email, i.phone,
      cm.role, cm.status, cm.invited_at, cm.accepted_at, cm.removed_at,
      COALESCE(i.last_active_at, MAX(s.last_seen_at)) AS last_active_at,
      r.id AS resource_id, r.name AS resource_name, r.status AS resource_status
    FROM company_membership cm
    JOIN identity i ON i.id = cm.identity_id
    LEFT JOIN auth_session s ON s.identity_id = i.id
    LEFT JOIN resource r ON r.linked_membership_id = cm.id AND r.company_id = cm.company_id
    WHERE cm.id = ? AND cm.company_id = ? AND cm.removed_at IS NULL
    GROUP BY cm.id, r.id
  `).get(membershipId, companyId) as MembershipRow | undefined;
}

function allowedRoles(actor: Actor, row: MembershipRow): CompanyRole[] {
  const all: CompanyRole[] = ["owner", "admin", "employee", "external"];
  return all.filter(role => canSetMembershipRole(actor, { membershipId: row.id, role: row.role, status: row.status }, role));
}

function permissions(actor: Actor, row: MembershipRow) {
  const target = { membershipId: row.id, role: row.role, status: row.status };
  const manageable = canManageMembership(actor, target);
  const self = actor.membershipId === row.id;
  return {
    canEdit: manageable,
    canChangeRole: manageable && !self,
    canDeactivate: manageable && !self && row.status === "active",
    canRestore: manageable && row.status === "deactivated",
    canCancelInvitation: manageable && row.status === "pending",
    canResendInvitation: manageable && row.status === "pending",
    canDelete: manageable && !self,
    canAssignProjects: canAssignMembershipProjects(actor, target),
    allowedRoles: allowedRoles(actor, row),
  };
}

function projectsForMembership(row: MembershipRow, companyId: number): UserProjectDto[] {
  return db.prepare(`
    SELECT p.id, p.name, pt.name AS project_type,
      CASE WHEN pm.project_id IS NULL THEN 0 ELSE 1 END AS assigned
    FROM project p
    JOIN project_type pt ON pt.id = p.project_type_id AND pt.company_id = p.company_id
    LEFT JOIN project_membership pm
      ON pm.project_id = p.id AND pm.company_membership_id = ?
    WHERE p.company_id = ?
    ORDER BY lower(p.name), p.id
  `).all(row.id, companyId).map((project: any) => ({
    id: Number(project.id),
    name: String(project.name),
    projectType: String(project.project_type),
    assigned: project.assigned === 1,
  }));
}

function toDto(actor: Actor, row: MembershipRow): CompanyUserDto {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.normalized_email,
    phone: row.phone ?? "",
    role: row.role,
    status: row.status,
    isCurrent: actor.membershipId === row.id,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
    lastActiveAt: row.last_active_at,
    linkedResource: row.resource_id ? { id: row.resource_id, name: row.resource_name!, status: row.resource_status! } : null,
    projects: projectsForMembership(row, actor.companyId!),
    permissions: permissions(actor, row),
  };
}

export function listCompanyUsers(actor: Actor): CompanyUserDto[] {
  if (!actor.companyId) return [];
  const rows = db.prepare(`
    SELECT cm.id FROM company_membership cm
    JOIN identity i ON i.id = cm.identity_id
    WHERE cm.company_id = ? AND cm.removed_at IS NULL
    ORDER BY lower(i.first_name), lower(i.last_name), lower(i.normalized_email), cm.id
  `).all(actor.companyId) as Array<{ id: number }>;
  return rows.map(row => getCompanyUser(actor, row.id)).filter((user): user is CompanyUserDto => !!user);
}

export function listRemovedCompanyUsers(actor: Actor): DeletedCompanyUserDto[] {
  if (!actor.companyId) return [];
  return db.prepare(`
    SELECT cm.id,
      trim(COALESCE(cm.invited_first_name, i.first_name) || ' ' || COALESCE(cm.invited_last_name, i.last_name)) AS name,
      i.normalized_email AS email, cm.removed_at AS removed_at
    FROM company_membership cm
    JOIN identity i ON i.id = cm.identity_id
    WHERE cm.company_id = ? AND cm.removed_at IS NOT NULL
    ORDER BY cm.removed_at DESC, cm.id DESC
  `).all(actor.companyId).map((row: any) => ({
    id: Number(row.id), name: String(row.name || row.email), email: String(row.email), removedAt: String(row.removed_at),
  }));
}

export function removeMembership(actor: Actor, membershipId: number) {
  const row = targetMembership(actor, membershipId);
  if (!row || row.removed_at || !canManageMembership(actor, { membershipId: row.id, role: row.role, status: row.status })) return null;
  if (row.id === actor.membershipId) throw new Error("SELF_LIFECYCLE_FORBIDDEN");

  db.transaction(() => {
    // Retain the resource link as part of the global identity record. Removing this
    // company's membership ends login access here without making the same email available
    // as an unlinked Resource for reuse elsewhere on the platform.
    db.prepare(`UPDATE company_membership SET status = 'deactivated', deactivated_at = COALESCE(deactivated_at, CURRENT_TIMESTAMP),
      removed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(row.id);
    db.prepare("DELETE FROM project_membership WHERE company_membership_id = ?").run(row.id);
    if (row.legacy_user_id) {
      db.prepare(`DELETE FROM project_user WHERE user_id = ? AND project_id IN (SELECT id FROM project WHERE company_id = ?)`)
        .run(row.legacy_user_id, actor.companyId);
      db.prepare("UPDATE resource SET linked_user_id = NULL WHERE company_id = ? AND linked_user_id = ?")
        .run(actor.companyId, row.legacy_user_id);
    }
    const invitationIds = db.prepare(`SELECT id FROM invitation_token WHERE membership_id = ? AND used_at IS NULL AND revoked_at IS NULL`)
      .all(row.id) as Array<{ id: number }>;
    db.prepare("UPDATE invitation_token SET revoked_at = CURRENT_TIMESTAMP WHERE membership_id = ? AND used_at IS NULL AND revoked_at IS NULL")
      .run(row.id);
    const cancelEmail = db.prepare(`UPDATE outbox_job SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE kind = 'invitation_email' AND idempotency_key = ? AND status IN ('pending','retry')`);
    for (const invitation of invitationIds) cancelEmail.run(`invitation:${invitation.id}`);
    const otherAccess = db.prepare("SELECT COUNT(*) AS count FROM company_membership WHERE identity_id = ? AND status = 'active' AND id <> ?")
      .get(row.identity_id, row.id) as { count: number };
    const identity = db.prepare("SELECT is_platform_admin FROM identity WHERE id = ?").get(row.identity_id) as { is_platform_admin: number };
    if (otherAccess.count === 0 && identity.is_platform_admin !== 1) {
      db.prepare("UPDATE identity SET status = 'deactivated', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.identity_id);
    }
  })();
  return (db.prepare("SELECT removed_at FROM company_membership WHERE id = ? AND company_id = ?").get(row.id, actor.companyId) as { removed_at: string } | undefined)?.removed_at ?? null;
}

export function listAssignableProjects(companyId: number): Omit<UserProjectDto, "assigned">[] {
  return db.prepare(`
    SELECT p.id, p.name, pt.name AS project_type
    FROM project p
    JOIN project_type pt ON pt.id = p.project_type_id AND pt.company_id = p.company_id
    WHERE p.company_id = ? AND p.status <> 'archived'
    ORDER BY lower(p.name), p.id
  `).all(companyId).map((project: any) => ({
    id: Number(project.id),
    name: String(project.name),
    projectType: String(project.project_type),
  }));
}

export function getCompanyUser(actor: Actor, membershipId: number): CompanyUserDto | null {
  if (!actor.companyId) return null;
  const row = rowForMembership(membershipId, actor.companyId);
  return row ? toDto(actor, row) : null;
}

export function targetMembership(actor: Actor, membershipId: number) {
  if (!actor.companyId) return null;
  return rowForMembership(membershipId, actor.companyId) ?? null;
}

export function normalizePersonName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function validateProfile(firstName: string, lastName: string, phone: string) {
  const fields: Record<string, string> = {};
  if (!firstName) fields.firstName = "Enter the User's first name.";
  else if (firstName.length > 80) fields.firstName = "Use 80 characters or fewer.";
  if (!lastName) fields.lastName = "Enter the User's last name.";
  else if (lastName.length > 80) fields.lastName = "Use 80 characters or fewer.";
  if (phone.length > 40) fields.phone = "Use 40 characters or fewer.";
  return fields;
}

export function updateUserProfile(actor: Actor, membershipId: number, input: {
  firstName: string;
  lastName: string;
  phone: string;
}) {
  const row = targetMembership(actor, membershipId);
  if (!row || !canManageMembership(actor, { membershipId: row.id, role: row.role, status: row.status })) return null;
  db.transaction(() => {
    const resourceName = `${input.firstName} ${input.lastName}`.trim().replace(/\s+/g, " ");
    db.prepare(`
      UPDATE identity SET first_name = ?, last_name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(input.firstName, input.lastName, input.phone || null, row.identity_id);
    if (row.legacy_user_id) {
      db.prepare("UPDATE user SET full_name = ?, phone = ? WHERE id = ?")
        .run(`${input.firstName} ${input.lastName}`.trim(), input.phone || null, row.legacy_user_id);
    }
    db.prepare(`
      UPDATE resource SET name = ?, normalized_name = ?, email = ?, phone = ?, version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE linked_membership_id = ? AND company_id = ?
    `).run(resourceName, resourceName.toLocaleLowerCase("en-US"), row.normalized_email, input.phone || null, row.id, actor.companyId);
  })();
  return getCompanyUser(actor, membershipId);
}

export function updateMembershipRole(actor: Actor, membershipId: number, role: CompanyRole) {
  const row = targetMembership(actor, membershipId);
  if (!row || !canSetMembershipRole(actor, { membershipId: row.id, role: row.role, status: row.status }, role)) return null;
  db.transaction(() => {
    db.prepare("UPDATE company_membership SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(role, row.id);
    if (row.legacy_user_id) db.prepare("UPDATE user SET user_type = ? WHERE id = ?")
      .run(role === "employee" ? "internal" : role, row.legacy_user_id);
  })();
  return { previousRole: row.role, user: getCompanyUser(actor, membershipId)! };
}

export function setProjectAssignments(actor: Actor, membershipId: number, projectIds: number[]) {
  const row = targetMembership(actor, membershipId);
  if (!row || !canAssignMembershipProjects(actor, { membershipId: row.id, role: row.role, status: row.status })) return null;
  if (row.role === "external" && projectIds.length === 0) throw new Error("EXTERNAL_PROJECT_REQUIRED");
  const uniqueIds = [...new Set(projectIds)];
  if (uniqueIds.length) {
    const placeholders = uniqueIds.map(() => "?").join(",");
    const found = db.prepare(`SELECT COUNT(*) AS count FROM project WHERE company_id = ? AND id IN (${placeholders})`)
      .get(actor.companyId, ...uniqueIds) as { count: number };
    if (found.count !== uniqueIds.length) throw new Error("PROJECT_SCOPE_INVALID");
  }
  db.transaction(() => {
    const insert = db.prepare("INSERT OR IGNORE INTO project_membership (project_id, company_membership_id) VALUES (?, ?)");
    for (const projectId of uniqueIds) insert.run(projectId, row.id);
    if (uniqueIds.length) {
      const placeholders = uniqueIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM project_membership WHERE company_membership_id = ? AND project_id NOT IN (${placeholders})`)
        .run(row.id, ...uniqueIds);
    } else {
      db.prepare("DELETE FROM project_membership WHERE company_membership_id = ?").run(row.id);
    }
    if (row.legacy_user_id) {
      db.prepare("DELETE FROM project_user WHERE user_id = ?").run(row.legacy_user_id);
      const legacyInsert = db.prepare("INSERT OR IGNORE INTO project_user (project_id, user_id) VALUES (?, ?)");
      for (const projectId of uniqueIds) legacyInsert.run(projectId, row.legacy_user_id);
    }
  })();
  return getCompanyUser(actor, membershipId)!;
}

export function setMembershipLifecycle(actor: Actor, membershipId: number, action: "deactivate" | "restore" | "cancel_invitation") {
  const row = targetMembership(actor, membershipId);
  if (!row || !canManageMembership(actor, { membershipId: row.id, role: row.role, status: row.status })) return null;
  if (row.id === actor.membershipId) throw new Error("SELF_LIFECYCLE_FORBIDDEN");
  if (action === "deactivate" && row.status !== "active") throw new Error("MEMBERSHIP_STATE_INVALID");
  if (action === "restore" && row.status !== "deactivated") throw new Error("MEMBERSHIP_STATE_INVALID");
  if (action === "cancel_invitation" && row.status !== "pending") throw new Error("MEMBERSHIP_STATE_INVALID");
  if (action === "restore" && row.role === "external") {
    const assigned = db.prepare("SELECT 1 FROM project_membership WHERE company_membership_id = ? LIMIT 1").get(row.id);
    if (!assigned) throw new Error("EXTERNAL_PROJECT_REQUIRED");
  }
  db.transaction(() => {
    const nextStatus = action === "restore" ? "active" : "deactivated";
    db.prepare(`
      UPDATE company_membership
      SET status = ?, deactivated_at = CASE WHEN ? = 'active' THEN NULL ELSE CURRENT_TIMESTAMP END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(nextStatus, nextStatus, row.id);
    if (action === "cancel_invitation") {
      const invitationIds = db.prepare(`
        SELECT id FROM invitation_token
        WHERE membership_id = ? AND used_at IS NULL AND revoked_at IS NULL
      `).all(row.id) as Array<{ id: number }>;
      db.prepare(`UPDATE invitation_token SET revoked_at = CURRENT_TIMESTAMP
        WHERE membership_id = ? AND used_at IS NULL AND revoked_at IS NULL`).run(row.id);
      const cancelEmail = db.prepare(`UPDATE outbox_job SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE kind = 'invitation_email' AND idempotency_key = ? AND status IN ('pending','retry')`);
      for (const invitation of invitationIds) cancelEmail.run(`invitation:${invitation.id}`);
    }
    if (action === "restore") {
      db.prepare("UPDATE identity SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.identity_id);
    } else {
      const otherAccess = db.prepare(`
        SELECT COUNT(*) AS count FROM company_membership WHERE identity_id = ? AND status = 'active'
      `).get(row.identity_id) as { count: number };
      const identity = db.prepare("SELECT is_platform_admin FROM identity WHERE id = ?").get(row.identity_id) as { is_platform_admin: number };
      if (otherAccess.count === 0 && identity.is_platform_admin !== 1) {
        db.prepare("UPDATE identity SET status = 'deactivated', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.identity_id);
      }
    }
  })();
  return getCompanyUser(actor, membershipId)!;
}
