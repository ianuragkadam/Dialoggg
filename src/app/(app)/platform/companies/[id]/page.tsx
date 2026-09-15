import type { Metadata } from "next";
import { notFound } from "next/navigation";

import CompanyDetailPrototype from "@/components/CompanyDetailPrototype";
import ModuleRestricted from "@/components/ModuleRestricted";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth";
import { findCompanyAdminUi } from "@/lib/company-admin-ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const company = findCompanyAdminUi((await params).id);
  return { title: company ? `${company.name} | Dialoggg` : "Company not found | Dialoggg" };
}

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isPlatformAdmin(user)) return <ModuleRestricted title="Platform Administration is restricted" description="Only the separate Platform Administrator can view company operational metadata." />;
  const company = findCompanyAdminUi((await params).id);
  if (!company) notFound();
  return <CompanyDetailPrototype company={company} />;
}
