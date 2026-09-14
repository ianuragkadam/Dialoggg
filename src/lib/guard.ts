import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin, type User } from "@/lib/auth";

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
