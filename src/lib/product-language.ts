export const PRODUCT_NAME = "Dialoggg";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Platform Administrator",
  owner: "Owner",
  admin: "Admin",
  employee: "Employee (Internal)",
  internal: "Employee (Internal)",
  viewer: "Employee (Internal)",
  external: "External/Client",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "Unknown";
  return ROLE_LABELS[role] || role.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return status.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
