import type { CompanyRole } from "@/lib/auth";
import type { CompanyUserDto, MembershipStatus, UserProjectDto } from "@/lib/user-management";

export type CompanyRoleUi = CompanyRole;
export type UserStatusUi = MembershipStatus;
export type ProjectAccessUi = UserProjectDto;
export type CompanyUserUi = CompanyUserDto;

export function companyRoleLabel(role: CompanyRoleUi): string {
  if (role === "employee") return "Employee (Internal)";
  if (role === "external") return "External/Client";
  return role === "owner" ? "Owner" : "Admin";
}

export function userStatusLabel(status: UserStatusUi): string {
  if (status === "pending") return "Invitation pending";
  return status === "active" ? "Active" : "Deactivated";
}

export function userDisplayName(user: Pick<CompanyUserDto, "firstName" | "lastName">) {
  return `${user.firstName} ${user.lastName}`.trim();
}

export function userLastActiveLabel(user: CompanyUserDto) {
  if (user.isCurrent) return "Now";
  if (!user.lastActiveAt) return user.status === "pending" ? "Not signed in" : "No recent activity";
  const parsed = new Date(`${user.lastActiveAt.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime()) ? user.lastActiveAt : parsed.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}
