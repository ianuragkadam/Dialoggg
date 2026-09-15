import type { Metadata } from "next";

import ModuleRestricted from "@/components/ModuleRestricted";
import ResourcesPrototype from "@/components/ResourcesPrototype";
import { getCurrentUser, isAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Resources | Dialoggg" };

export default async function ResourcesPage() {
  const user = await getCurrentUser();
  if (user?.user_type === "external") return <ModuleRestricted title="Resources are restricted" description="External/Clients cannot view the company Resource directory or Resource contact information." />;
  return <ResourcesPrototype canManage={isAdmin(user)} />;
}
