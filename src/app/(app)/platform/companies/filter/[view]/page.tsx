import type { Metadata } from "next";

import CompaniesPrototype from "@/components/CompaniesPrototype";
import ModuleRestricted from "@/components/ModuleRestricted";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth";
import { listCompanyOperationalMetadata } from "@/lib/company-administration";
import { toCompanyAdminUiItem } from "@/lib/company-admin-ui";

export const metadata: Metadata = { title: "Company List | Dialoggg" };

const views = new Set(["all", "active", "suspended", "projects"]);

export default async function FilteredCompaniesPage({ params }: { params: Promise<{ view: string }> }) {
  const user = await getCurrentUser();
  if (!isPlatformAdmin(user)) return <ModuleRestricted title="Platform Administration is restricted" description="Only the separate Platform Administrator can view company lists." />;
  const { view } = await params;
  const initialView = views.has(view) ? view as "all" | "active" | "suspended" | "projects" : "all";
  const companies = listCompanyOperationalMetadata().map(toCompanyAdminUiItem);
  return <CompaniesPrototype initialItems={companies} initialView={initialView} />;
}
