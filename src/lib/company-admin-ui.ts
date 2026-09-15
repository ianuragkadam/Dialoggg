export type CompanyAdminUiItem = {
  id: string;
  name: string;
  status: "active" | "suspended";
  timeZone: string;
  ownerName: string;
  ownerEmail: string;
  users: number;
  resources: number;
  activeProjects: number;
  createdLabel: string;
  googleStatus: "Connected" | "Not connected" | "Attention needed";
  oneDriveStatus: "Connected" | "Not connected" | "Setup pending";
};

export const COMPANY_ADMIN_UI_DATA: CompanyAdminUiItem[] = [
  {
    id: "sport-court-east-pa",
    name: "Sport Court of East PA",
    status: "active",
    timeZone: "America/New_York",
    ownerName: "Scott Grote",
    ownerEmail: "sgrote@sportcourtpa.com",
    users: 18,
    resources: 42,
    activeProjects: 36,
    createdLabel: "September 2, 2026",
    googleStatus: "Connected",
    oneDriveStatus: "Setup pending",
  },
  {
    id: "northline-courts",
    name: "Northline Courts",
    status: "active",
    timeZone: "America/Chicago",
    ownerName: "Morgan Lee",
    ownerEmail: "morgan@example.test",
    users: 9,
    resources: 21,
    activeProjects: 14,
    createdLabel: "August 18, 2026",
    googleStatus: "Attention needed",
    oneDriveStatus: "Connected",
  },
  {
    id: "legacy-demo-company",
    name: "Legacy Demo Company",
    status: "suspended",
    timeZone: "America/Los_Angeles",
    ownerName: "Taylor Reed",
    ownerEmail: "taylor@example.test",
    users: 4,
    resources: 8,
    activeProjects: 0,
    createdLabel: "July 11, 2026",
    googleStatus: "Not connected",
    oneDriveStatus: "Not connected",
  },
];

export const COMPANY_TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "Pacific/Honolulu",
];

export function findCompanyAdminUi(id: string) {
  return COMPANY_ADMIN_UI_DATA.find(company => company.id === id);
}
