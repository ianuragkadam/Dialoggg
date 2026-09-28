import db from "@/db";

export type AffectedProject = { id: number; name: string };

export type ProjectTypeRecord = {
  id: number;
  name: string;
  projectCount: number;
  updatedAt: string;
  affectedProjects: AffectedProject[];
};

type ProjectTypeRow = {
  id: number;
  name: string;
  updated_at: string;
  project_count: number;
};

function affectedProjects(projectTypeId: number, companyId: number) {
  return db.prepare(`
    SELECT id, name FROM project
    WHERE project_type_id = ? AND company_id = ?
    ORDER BY lower(name), id
  `).all(projectTypeId, companyId) as AffectedProject[];
}

function mapRow(row: ProjectTypeRow, companyId: number): ProjectTypeRecord {
  return {
    id: row.id,
    name: row.name,
    projectCount: Number(row.project_count),
    updatedAt: row.updated_at,
    affectedProjects: affectedProjects(row.id, companyId),
  };
}

export function listProjectTypes(companyId: number) {
  const rows = db.prepare(`
    SELECT pt.id, pt.name, pt.updated_at,
      COUNT(p.id) AS project_count
    FROM project_type pt
    LEFT JOIN project p ON p.project_type_id = pt.id AND p.company_id = pt.company_id
    WHERE pt.company_id = ? AND pt.status = 'active'
    GROUP BY pt.id
    ORDER BY lower(pt.name), pt.id
  `).all(companyId) as ProjectTypeRow[];
  return rows.map(row => mapRow(row, companyId));
}

export function countProjectsMissingType(companyId: number) {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM project p
    LEFT JOIN project_type pt
      ON pt.id = p.project_type_id
      AND pt.company_id = p.company_id
      AND pt.status = 'active'
    WHERE p.company_id = ? AND pt.id IS NULL
  `).get(companyId) as { count: number };
  return Number(row.count);
}

export function getProjectType(projectTypeId: number, companyId: number) {
  const row = db.prepare(`
    SELECT pt.id, pt.name, pt.updated_at,
      COUNT(p.id) AS project_count
    FROM project_type pt
    LEFT JOIN project p ON p.project_type_id = pt.id AND p.company_id = pt.company_id
    WHERE pt.id = ? AND pt.company_id = ? AND pt.status = 'active'
    GROUP BY pt.id
  `).get(projectTypeId, companyId) as ProjectTypeRow | undefined;
  return row ? mapRow(row, companyId) : null;
}

export function activeProjectTypeId(value: unknown, companyId: number) {
  const projectTypeId = Number(value);
  if (!Number.isInteger(projectTypeId) || projectTypeId <= 0) return null;
  const row = db.prepare(`
    SELECT id FROM project_type
    WHERE id = ? AND company_id = ? AND status = 'active'
  `).get(projectTypeId, companyId) as { id: number } | undefined;
  return row?.id ?? null;
}

export function normalizeProjectTypeName(value: unknown) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return { name, normalizedName: name.toLocaleLowerCase("en-US") };
}

export function validateProjectTypeName(name: string) {
  if (!name) return "Enter a Project Type name.";
  if (name.length > 50) return "Use 50 characters or fewer.";
  return null;
}

export function createProjectType(companyId: number, name: string, normalizedName: string) {
  const result = db.prepare(`
    INSERT INTO project_type (company_id, name, normalized_name)
    VALUES (?, ?, ?)
  `).run(companyId, name, normalizedName);
  return getProjectType(Number(result.lastInsertRowid), companyId)!;
}

export function renameProjectType(projectTypeId: number, companyId: number, name: string, normalizedName: string) {
  const result = db.prepare(`
    UPDATE project_type SET name = ?, normalized_name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND company_id = ? AND status = 'active'
  `).run(name, normalizedName, projectTypeId, companyId);
  return result.changes === 1 ? getProjectType(projectTypeId, companyId) : null;
}

export function deleteProjectType(projectTypeId: number, companyId: number) {
  return db.transaction(() => {
    const projectType = getProjectType(projectTypeId, companyId);
    if (!projectType) return { outcome: "not_found" as const };
    if (projectType.projectCount > 0) return { outcome: "in_use" as const, projectType };
    db.prepare("DELETE FROM project_type WHERE id = ? AND company_id = ?").run(projectTypeId, companyId);
    return { outcome: "deleted" as const, projectType };
  })();
}
