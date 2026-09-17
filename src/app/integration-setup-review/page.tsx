import type { Metadata } from "next";

import IntegrationSetupWorkshop from "@/components/IntegrationSetupWorkshop";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Integration Setup Review | Dialoggg",
  description: "Private read-only integration setup status.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function IntegrationSetupReviewPage() {
  return <IntegrationSetupWorkshop review />;
}
