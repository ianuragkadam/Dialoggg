import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ModuleRestricted from "@/components/ModuleRestricted";
import UserProjectAccessPrototype from "@/components/UserProjectAccessPrototype";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { findCompanyUserUi } from "@/lib/users-access-ui";

export const metadata: Metadata = { title: "Project access | Dialoggg" };

export default async function UserProjectAccessPage({ params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!isAdmin(currentUser)) return <ModuleRestricted title="Project access is restricted" description="Only an Owner or Admin can change a company User's Project assignments." />;
  const user = findCompanyUserUi((await params).id);
  if (!user) notFound();
  return <UserProjectAccessPrototype sourceUser={user} />;
}
