import type { Metadata } from "next";
import { notFound } from "next/navigation";

import RequirementsResults from "@/components/RequirementsResults";
import { isRequirementsReviewToken } from "@/lib/requirements-access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dialoggg Requirements Responses",
  description: "Private read-only responses for the Dialoggg requirements questionnaire.",
  robots: { index: false, follow: false },
};

export default async function RequirementsReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isRequirementsReviewToken(token)) notFound();
  return <RequirementsResults token={token} />;
}
