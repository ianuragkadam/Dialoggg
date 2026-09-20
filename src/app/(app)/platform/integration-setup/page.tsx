import type { Metadata } from "next";

import IntegrationInvitationAdmin from "@/components/IntegrationInvitationAdmin";
import PlatformGoogleSettings from "@/components/PlatformGoogleSettings";
import PlatformMicrosoftSettings from "@/components/PlatformMicrosoftSettings";
import ModuleRestricted from "@/components/ModuleRestricted";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Integration Setup Access | Dialoggg", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function IntegrationSetupAccessPage() {
  const user = await getCurrentUser();
  if (!isPlatformAdmin(user) || user?.context_type !== "platform") {
    return <ModuleRestricted title="Platform Administration is restricted" description="Only the separate Platform Administrator can issue private integration setup links." />;
  }
  return <main className="mx-auto max-w-5xl space-y-6 p-6">
    <PlatformGoogleSettings />
    <PlatformMicrosoftSettings />
    <IntegrationInvitationAdmin />
  </main>;
}
