import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import db from "@/db";
import path from "node:path";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const company = user.context_type === "company" && user.company_id
    ? db.prepare("SELECT name, logo_path FROM company WHERE id = ?").get(user.company_id) as { name: string; logo_path: string | null } | undefined
    : undefined;
  const companyLogoUrl = company?.logo_path
    ? `/api/v1/company/logo?v=${encodeURIComponent(path.basename(company.logo_path))}`
    : null;
  return <AppShell user={user as any} companyName={company?.name ?? null} companyLogoUrl={companyLogoUrl}>{children}</AppShell>;
}
