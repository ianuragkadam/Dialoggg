export type ProjectTemplateUiTask = {
  name: string;
  kind: "Header" | "Task";
  offset: string;
  duration: string;
  category: string;
};

export type ProjectTemplateUiItem = {
  id: string;
  name: string;
  sourceProject: string;
  taskCount: number;
  headerCount: number;
  workingDays: number;
  categoryCount: number;
  updatedLabel: string;
  weekendRule: string;
  colorCount: number;
  tasks: ProjectTemplateUiTask[];
};

export const PROJECT_TEMPLATE_UI_DATA: ProjectTemplateUiItem[] = [
  {
    id: "backyard-court",
    name: "Backyard Court",
    sourceProject: "Miller Residence",
    taskCount: 18,
    headerCount: 4,
    workingDays: 34,
    categoryCount: 6,
    updatedLabel: "September 14, 2026",
    weekendRule: "Saturday allowed for surfacing; Sunday excluded",
    colorCount: 5,
    tasks: [
      { name: "Pre-construction", kind: "Header", offset: "Day 0", duration: "4 working days", category: "Project Management" },
      { name: "Site layout", kind: "Task", offset: "Day 0", duration: "1 working day", category: "Employee" },
      { name: "Excavation", kind: "Task", offset: "Day 4", duration: "3 working days", category: "Equipment" },
      { name: "Base and drainage", kind: "Header", offset: "Day 7", duration: "8 working days", category: "Subcontractor" },
      { name: "Court surfacing", kind: "Header", offset: "Day 18", duration: "9 working days", category: "Employee" },
      { name: "Accessories and closeout", kind: "Header", offset: "Day 27", duration: "7 working days", category: "Supplier" },
    ],
  },
  {
    id: "commercial-athletic-surface",
    name: "Commercial Athletic Surface",
    sourceProject: "Westfield Recreation Center",
    taskCount: 27,
    headerCount: 6,
    workingDays: 48,
    categoryCount: 8,
    updatedLabel: "September 12, 2026",
    weekendRule: "Monday–Friday only",
    colorCount: 7,
    tasks: [
      { name: "Approvals and mobilization", kind: "Header", offset: "Day 0", duration: "8 working days", category: "Project Management" },
      { name: "Site preparation", kind: "Header", offset: "Day 8", duration: "10 working days", category: "Subcontractor" },
      { name: "Base construction", kind: "Task", offset: "Day 18", duration: "8 working days", category: "Equipment" },
      { name: "Surface installation", kind: "Header", offset: "Day 26", duration: "14 working days", category: "Employee" },
      { name: "Inspection and handover", kind: "Header", offset: "Day 40", duration: "8 working days", category: "Project Management" },
    ],
  },
  {
    id: "court-resurfacing",
    name: "Court Resurfacing",
    sourceProject: "Hillside Tennis Club",
    taskCount: 9,
    headerCount: 3,
    workingDays: 12,
    categoryCount: 4,
    updatedLabel: "September 8, 2026",
    weekendRule: "Saturday allowed; Sunday excluded",
    colorCount: 4,
    tasks: [
      { name: "Preparation", kind: "Header", offset: "Day 0", duration: "3 working days", category: "Employee" },
      { name: "Crack repair", kind: "Task", offset: "Day 1", duration: "2 working days", category: "Employee" },
      { name: "Coating system", kind: "Header", offset: "Day 3", duration: "6 working days", category: "Supplier" },
      { name: "Lines and closeout", kind: "Header", offset: "Day 9", duration: "3 working days", category: "Employee" },
    ],
  },
];

export const TEMPLATE_SOURCE_PROJECTS = [
  { id: "miller", name: "Miller Residence", tasks: 18, categories: 6, duration: 34 },
  { id: "westfield", name: "Westfield Recreation Center", tasks: 27, categories: 8, duration: 48 },
  { id: "hillside", name: "Hillside Tennis Club", tasks: 9, categories: 4, duration: 12 },
];

export const TEMPLATE_PROJECT_TYPES = ["Acrylic", "Hardwood", "Modular"];

export function findProjectTemplateUi(id: string) {
  return PROJECT_TEMPLATE_UI_DATA.find(template => template.id === id);
}
