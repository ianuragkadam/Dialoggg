import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ModuleRestricted from "@/components/ModuleRestricted";
import UserProjectAccessPrototype from "@/components/UserProjectAccessPrototype";
import { getCurrentActor } from "@/lib/auth";
import { getCompanyUser } from "@/lib/user-management";

export const metadata: Metadata = { title: "Project access | Dialoggg" };

export default async function UserProjectAccessPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentActor();
  if (!actor || actor.contextType !== "company" || !actor.companyId || !["owner", "admin"].includes(actor.companyRole ?? "")) return <ModuleRestricted title="Project access is restricted" description="Only an Owner or Admin can change a company User's Project assignments." />;
  const membershipId = Number((await params).id);
  const user = Number.isInteger(membershipId) ? getCompanyUser(actor, membershipId) : null;
  if (!user) notFound();
  if (!user.permissions.canAssignProjects) return <ModuleRestricted title="Project access is restricted" description="Your Role cannot change this membership's Project assignments." />;
  return <UserProjectAccessPrototype sourceUser={user} />;
}
