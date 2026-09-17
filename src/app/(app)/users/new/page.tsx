import type { Metadata } from "next";

import ModuleRestricted from "@/components/ModuleRestricted";
import UserInvitePrototype from "@/components/UserInvitePrototype";
import { getCurrentActor } from "@/lib/auth";
import { listAssignableProjects } from "@/lib/user-management";

export const metadata: Metadata = { title: "Invite User | Dialoggg" };

export default async function InviteUserPage() {
  const actor = await getCurrentActor();
  if (!actor || actor.contextType !== "company" || !actor.companyId || !["owner", "admin"].includes(actor.companyRole ?? "")) return <ModuleRestricted title="User invitations are restricted" description="Only an Owner or Admin can invite company Users." />;
  return <UserInvitePrototype projects={listAssignableProjects(actor.companyId)} canInviteElevated={actor.companyRole === "owner"} />;
}
