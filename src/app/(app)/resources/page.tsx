import type { Metadata } from "next";

import ModuleRestricted from "@/components/ModuleRestricted";
import ResourcesPrototype from "@/components/ResourcesPrototype";
import { getCurrentActor } from "@/lib/auth";
import { listResources } from "@/lib/resources";

export const metadata: Metadata = { title: "Resources | Dialoggg" };

export default async function ResourcesPage() {
  const actor = await getCurrentActor();
  if (!actor || actor.contextType !== "company" || !actor.companyId || actor.companyRole === "external") return <ModuleRestricted title="Resources are restricted" description="External/Clients cannot view the company Resource directory or Resource contact information." />;
  return <ResourcesPrototype initialResources={listResources(actor.companyId)} canManage={actor.companyRole === "owner" || actor.companyRole === "admin"} />;
}
