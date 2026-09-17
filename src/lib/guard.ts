import { NextResponse } from "next/server";
import { getCurrentActor, getCurrentUser, isAdmin, type Actor, type CompanyRole, type User } from "@/lib/auth";

// Use in any write endpoint:
//   const g = await requireAdmin();
//   if ("error" in g) return g.error;
//   const user = g.user;
export async function requireAdmin(): Promise<{ user: User } | { error: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isAdmin(user)) {
    return { error: NextResponse.json(
      { error: "Read-only access: Employee accounts cannot make changes." }, { status: 403 }) };
  }
  return { user };
}

export async function requireActor(): Promise<{ actor: Actor } | { error: NextResponse }> {
  const actor = await getCurrentActor();
  if (!actor) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { actor };
}

export async function requireCompanyRole(
  roles: readonly CompanyRole[],
): Promise<{ actor: Actor } | { error: NextResponse }> {
  const result = await requireActor();
  if ("error" in result) return result;
  if (result.actor.contextType !== "company" || !result.actor.companyRole || !roles.includes(result.actor.companyRole)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return result;
}

export async function requirePlatformAdministrator(): Promise<{ actor: Actor } | { error: NextResponse }> {
  const result = await requireActor();
  if ("error" in result) return result;
  if (result.actor.contextType !== "platform" || !result.actor.isPlatformAdmin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return result;
}
