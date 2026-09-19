export const RESOURCE_CATEGORIES = ["Employee", "Subcontractor", "Supplier", "Equipment", "Other"] as const;
export type ResourceCategoryUi = typeof RESOURCE_CATEGORIES[number];
export type ResourceStatusUi = "active" | "inactive";

export type ResourceAssignmentUi = {
  id: number;
  kind: "Task" | "Event";
  title: string;
  project: string;
  timing: string;
  conflict: boolean;
};

export type ResourceUserOptionUi = {
  id: number;
  name: string;
  email: string;
};

export type ResourceUi = {
  id: number;
  name: string;
  category: ResourceCategoryUi;
  status: ResourceStatusUi;
  email: string;
  phone: string;
  linkedUser: ResourceUserOptionUi | null;
  assignments: ResourceAssignmentUi[];
  version: number;
};

export type ResourceDirectoryUi = {
  resources: ResourceUi[];
  categories: readonly ResourceCategoryUi[];
  availableUsers: ResourceUserOptionUi[];
};
