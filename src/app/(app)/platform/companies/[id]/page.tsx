import type { Metadata } from "next";
import { notFound } from "next/navigation";

import CompanyDetailPrototype from "@/components/CompanyDetailPrototype";
import ModuleRestricted from "@/components/ModuleRestricted";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth";
import { getCompanyOperationalMetadata, listCompanyActivity } from "@/lib/company-administration";
import { toCompanyAdminUiItem } from "@/lib/company-admin-ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!isPlatformAdmin(user)) return { title: "Company | Dialoggg" };
  const companyId = Number((await params).id);
  const company = Number.isInteger(companyId) ? getCompanyOperationalMetadata(companyId) : null;
  return { title: company ? `${company.name} | Dialoggg` : "Company not found | Dialoggg" };
}

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isPlatformAdmin(user)) return <ModuleRestricted title="Platform Administration is restricted" description="Only the separate Platform Administrator can view company operational metadata." />;
  const companyId = Number((await params).id);
  const company = Number.isInteger(companyId) ? getCompanyOperationalMetadata(companyId) : null;
  if (!company) notFound();
  return <CompanyDetailPrototype company={toCompanyAdminUiItem(company)} activity={listCompanyActivity(companyId)} />;
}
