import type { Metadata } from "next";
import { notFound } from "next/navigation";

import RequirementsResults from "@/components/RequirementsResults";
import { reviewKindForToken } from "@/lib/requirements-access";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const kind = reviewKindForToken(token);
  return {
    title: kind === "follow_up" ? "Dialoggg Follow-up Responses" : "Dialoggg Requirements Responses",
    description: kind === "follow_up"
      ? "Private read-only responses for the Dialoggg follow-up requirements workshop."
      : "Private read-only responses for the Dialoggg requirements questionnaire.",
    robots: { index: false, follow: false },
  };
}

export default async function RequirementsReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const kind = reviewKindForToken(token);
  if (!kind) notFound();
  return <RequirementsResults token={token} kind={kind} />;
}
