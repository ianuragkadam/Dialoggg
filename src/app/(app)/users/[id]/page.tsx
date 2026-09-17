import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ModuleRestricted from "@/components/ModuleRestricted";
import UserDetailPrototype from "@/components/UserDetailPrototype";
import { getCurrentActor } from "@/lib/auth";
import { getCompanyUser } from "@/lib/user-management";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await params;
  return { title: "User | Dialoggg" };
}

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentActor();
  if (!actor || actor.contextType !== "company" || !actor.companyId || !["owner", "admin"].includes(actor.companyRole ?? "")) return <ModuleRestricted title="User management is restricted" description="Only an Owner or Admin can view company User details." />;
  const membershipId = Number((await params).id);
  const user = Number.isInteger(membershipId) ? getCompanyUser(actor, membershipId) : null;
  if (!user) notFound();
  return <UserDetailPrototype sourceUser={user} />;
}
