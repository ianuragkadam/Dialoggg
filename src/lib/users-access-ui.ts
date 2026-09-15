export type CompanyRoleUi = "owner" | "admin" | "employee" | "external";
export type UserStatusUi = "active" | "invited" | "deactivated";

export type ProjectAccessUi = {
  id: string;
  name: string;
  projectType: string;
  assigned: boolean;
};

export type CompanyUserUi = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: CompanyRoleUi;
  status: UserStatusUi;
  isCurrent?: boolean;
  linkedResource?: string;
  lastActiveLabel?: string;
  invitationLabel?: string;
  projects: ProjectAccessUi[];
};

export const USER_ACCESS_PROJECTS: Omit<ProjectAccessUi, "assigned">[] = [
  { id: "reading-residence", name: "Reading Residence Court", projectType: "Acrylic" },
  { id: "wilson-school", name: "Wilson School Gym", projectType: "Hardwood" },
  { id: "heritage-park", name: "Heritage Park Pickleball", projectType: "Modular" },
  { id: "oak-lane", name: "Oak Lane Tennis Court", projectType: "Acrylic" },
];

const projects = (...assignedIds: string[]): ProjectAccessUi[] => USER_ACCESS_PROJECTS.map(project => ({
  ...project,
  assigned: assignedIds.includes(project.id),
}));

export const COMPANY_USERS_UI: CompanyUserUi[] = [
  {
    id: "scott-grote",
    firstName: "Scott",
    lastName: "Grote",
    email: "sgrote@sportcourtpa.com",
    role: "owner",
    status: "active",
    lastActiveLabel: "Today at 8:42 AM",
    linkedResource: "Scott Grote",
    projects: projects("reading-residence", "wilson-school", "heritage-park", "oak-lane"),
  },
  {
    id: "mehul-nahar",
    firstName: "Mehul",
    lastName: "Nahar",
    email: "mehul@example.test",
    role: "admin",
    status: "active",
    isCurrent: true,
    lastActiveLabel: "Now",
    projects: projects("reading-residence", "wilson-school"),
  },
  {
    id: "jamie-morgan",
    firstName: "Jamie",
    lastName: "Morgan",
    email: "jamie@example.test",
    role: "employee",
    status: "active",
    lastActiveLabel: "Yesterday at 4:18 PM",
    linkedResource: "Jamie Morgan",
    projects: projects("reading-residence", "heritage-park"),
  },
  {
    id: "alex-rivera",
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex.client@example.test",
    role: "external",
    status: "active",
    lastActiveLabel: "September 12, 2026",
    projects: projects("reading-residence"),
  },
  {
    id: "priya-shah",
    firstName: "Priya",
    lastName: "Shah",
    email: "priya@example.test",
    role: "employee",
    status: "invited",
    invitationLabel: "Expires September 18 at 9:30 AM",
    projects: projects("wilson-school"),
  },
  {
    id: "taylor-reed",
    firstName: "Taylor",
    lastName: "Reed",
    email: "taylor@example.test",
    role: "employee",
    status: "deactivated",
    lastActiveLabel: "August 22, 2026",
    linkedResource: "Taylor Reed",
    projects: projects("oak-lane"),
  },
];

export function companyRoleLabel(role: CompanyRoleUi): string {
  if (role === "employee") return "Employee (Internal)";
  if (role === "external") return "External/Client";
  return role === "owner" ? "Owner" : "Admin";
}

export function userStatusLabel(status: UserStatusUi): string {
  if (status === "invited") return "Invitation pending";
  return status === "active" ? "Active" : "Deactivated";
}

export function findCompanyUserUi(id: string): CompanyUserUi | undefined {
  return COMPANY_USERS_UI.find(user => user.id === id);
}
