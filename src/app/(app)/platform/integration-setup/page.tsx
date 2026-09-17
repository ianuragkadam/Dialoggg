import type { Metadata } from "next";

import db from "@/db";
import IntegrationInvitationAdmin from "@/components/IntegrationInvitationAdmin";
import ModuleRestricted from "@/components/ModuleRestricted";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Integration Setup Access | Dialoggg", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function IntegrationSetupAccessPage() {
  const user = await getCurrentUser();
  if (!isPlatformAdmin(user) || user?.context_type !== "platform") {
    return <ModuleRestricted title="Platform Administration is restricted" description="Only the separate Platform Administrator can issue private integration setup links." />;
  }
  const companies = db.prepare(`SELECT id, name FROM company WHERE lower(status) = 'active' ORDER BY lower(name), id`).all() as Array<{ id: number; name: string }>;
  return <IntegrationInvitationAdmin companies={companies} />;
}
