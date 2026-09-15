import type { Metadata } from "next";

import CompaniesPrototype from "@/components/CompaniesPrototype";
import ModuleRestricted from "@/components/ModuleRestricted";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Companies | Dialoggg" };

export default async function CompaniesPage() {
  const user = await getCurrentUser();
  if (!isPlatformAdmin(user)) return <ModuleRestricted title="Platform Administration is restricted" description="Only the separate Platform Administrator can provision or suspend companies." />;
  return <CompaniesPrototype />;
}
