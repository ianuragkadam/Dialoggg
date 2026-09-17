import type { Metadata } from "next";

import CompanyCreatePrototype from "@/components/CompanyCreatePrototype";
import ModuleRestricted from "@/components/ModuleRestricted";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth";
import { supportedTimeZones } from "@/lib/company-administration";

export const metadata: Metadata = { title: "Add Company | Dialoggg" };

export default async function AddCompanyPage() {
  const user = await getCurrentUser();
  if (!isPlatformAdmin(user)) return <ModuleRestricted title="Platform Administration is restricted" description="Only the separate Platform Administrator can add a company and invite its first Owner." />;
  return <CompanyCreatePrototype timeZones={supportedTimeZones()} />;
}
