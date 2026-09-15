export const RESOURCE_CATEGORIES = ["Employee", "Subcontractor", "Supplier", "Equipment", "Other"] as const;
export type ResourceCategoryUi = typeof RESOURCE_CATEGORIES[number];
export type ResourceStatusUi = "active" | "inactive";

export type ResourceAssignmentUi = { id: string; kind: "Task" | "Event"; title: string; project: string; timing: string; conflict?: boolean };
export type ResourceUi = { id: string; name: string; category: ResourceCategoryUi; status: ResourceStatusUi; email?: string; phone?: string; linkedUser?: string; assignments: ResourceAssignmentUi[] };

export const RESOURCES_UI: ResourceUi[] = [
  { id: "jamie-morgan", name: "Jamie Morgan", category: "Employee", status: "active", email: "jamie@example.test", phone: "717-555-0138", linkedUser: "Jamie Morgan", assignments: [
    { id: "a1", kind: "Task", title: "Install acrylic surface", project: "Reading Residence Court", timing: "Sep 18–19 · All day" },
    { id: "a2", kind: "Event", title: "Client walkthrough", project: "Reading Residence Court", timing: "Sep 19 · 2:00–3:00 PM", conflict: true },
  ] },
  { id: "east-coast-surfacing", name: "East Coast Surfacing", category: "Subcontractor", status: "active", email: "dispatch@eastcoast.example.test", phone: "610-555-0174", assignments: [{ id: "a3", kind: "Task", title: "Surface preparation", project: "Heritage Park Pickleball", timing: "Sep 21–23 · All day" }] },
  { id: "court-supply-co", name: "Court Supply Co.", category: "Supplier", status: "active", email: "orders@courtsupply.example.test", assignments: [{ id: "a4", kind: "Event", title: "Material delivery", project: "Wilson School Gym", timing: "Sep 22 · 8:00–10:00 AM" }] },
  { id: "laser-screed-a", name: "Laser Screed A", category: "Equipment", status: "active", assignments: [{ id: "a5", kind: "Task", title: "Concrete placement", project: "Oak Lane Tennis Court", timing: "Sep 24 · All day" }] },
  { id: "permit-coordinator", name: "Permit Coordinator", category: "Other", status: "inactive", email: "permits@example.test", assignments: [{ id: "a6", kind: "Task", title: "Permit closeout", project: "Reading Residence Court", timing: "Completed Sep 10" }] },
];

export function findResourceUi(id: string): ResourceUi | undefined { return RESOURCES_UI.find(resource => resource.id === id); }
