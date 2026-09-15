export type ProjectUiStatus = "active" | "completed" | "archived";

export type ProjectUiRecord = {
  id: number;
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
  created_at?: string;
  project_type?: string;
  derived_end_date?: string | null;
  task_count?: number;
  completed_task_count?: number;
};

export const PROJECT_TYPES = ["Residential Court", "Commercial Court", "Court Resurfacing"] as const;

export const PROJECT_ASSIGNMENT_USERS = [
  { id: "jamie-morgan", name: "Jamie Morgan", role: "Employee (Internal)" },
  { id: "priya-shah", name: "Priya Shah", role: "Employee (Internal)" },
  { id: "alex-rivera", name: "Alex Rivera", role: "External/Client" },
] as const;

export function projectTypeFor(project: ProjectUiRecord): string {
  if (project.project_type) return project.project_type;
  return PROJECT_TYPES[Math.abs(project.id) % PROJECT_TYPES.length];
}

export function normalizeProjectStatus(status: string): ProjectUiStatus {
  return status === "completed" || status === "archived" ? status : "active";
}

export function formatProjectDate(value: string | null | undefined): string {
  if (!value) return "Not available until the Project Plan has scheduled leaf Tasks";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
