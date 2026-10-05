import type { Metadata } from "next";
import { notFound } from "next/navigation";

import CompanyEditPrototype from "@/components/CompanyEditPrototype";
import ModuleRestricted from "@/components/ModuleRestricted";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth";
import { getCompanyOperationalMetadata, supportedTimeZones } from "@/lib/company-administration";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const companyId = Number((await params).id);
  const company = Number.isInteger(companyId) ? getCompanyOperationalMetadata(companyId) : null;
  return { title: company ? `Edit ${company.name} | Dialoggg` : "Company not found | Dialoggg" };
}

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isPlatformAdmin(user)) return <ModuleRestricted title="Platform Administration is restricted" description="Only a Platform Administrator can edit company details." />;
  const companyId = Number((await params).id);
  const company = Number.isInteger(companyId) ? getCompanyOperationalMetadata(companyId) : null;
  if (!company) notFound();
  return <CompanyEditPrototype company={company} timeZones={supportedTimeZones()} />;
}
