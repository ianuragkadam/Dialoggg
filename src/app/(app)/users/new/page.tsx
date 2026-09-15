import type { Metadata } from "next";

import ModuleRestricted from "@/components/ModuleRestricted";
import UserInvitePrototype from "@/components/UserInvitePrototype";
import { getCurrentUser, isAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Invite User | Dialoggg" };

export default async function InviteUserPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return <ModuleRestricted title="User invitations are restricted" description="Only an Owner or Admin can invite company Users." />;
  return <UserInvitePrototype />;
}
