import type { Metadata } from "next";

import IntegrationSetupWorkshop from "@/components/IntegrationSetupWorkshop";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Secure Integration Setup | Dialoggg",
  description: "Private operational setup for Dialoggg integrations.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function IntegrationSetupPage() {
  return <IntegrationSetupWorkshop />;
}
