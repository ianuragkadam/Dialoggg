export type ProjectUiStatus = "active" | "archived";

export type ProjectUiRecord = {
  id: number;
  project_type_id: number;
  name: string;
  status: string;
  calendar_color: string;
  client_name: string | null;
  client_email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  extension: string | null;
  start_date: string;
  end_date: string | null;
  note: string | null;
  created_at?: string;
  project_type?: string;
  derived_end_date?: string | null;
  task_count?: number;
  completed_task_count?: number;
  version: number;
  assignments?: ProjectUserOptionUi[];
};

export type ProjectUserOptionUi = { id: number; name: string; email: string; role: "owner" | "admin" | "employee" | "external"; assigned: boolean };
export type ProjectTemplateOptionUi = { id: number; name: string };

export function projectTypeFor(project: ProjectUiRecord): string {
  return project.project_type || "Unavailable";
}

export function normalizeProjectStatus(status: string): ProjectUiStatus {
  return status === "active" ? "active" : "archived";
}

export function formatProjectDate(value: string | null | undefined): string {
  if (!value) return "Not available until the Project Plan has scheduled leaf Tasks";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
