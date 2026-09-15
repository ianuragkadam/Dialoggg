import type { Metadata } from "next";
import { notFound } from "next/navigation";

import RequirementsQuestionnaire from "@/components/RequirementsQuestionnaire";
import { questionnaireKindForToken } from "@/lib/requirements-access";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const kind = questionnaireKindForToken(token);
  return {
    title: kind === "follow_up" ? "Dialoggg Follow-up Workshop" : "Dialoggg Requirements Workshop",
    description: kind === "follow_up"
      ? "A private follow-up requirements workshop with simple examples for Dialoggg Reboot."
      : "A private requirements questionnaire for the Dialoggg Reboot.",
    robots: { index: false, follow: false },
  };
}

export default async function RequirementsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const kind = questionnaireKindForToken(token);
  if (!kind) notFound();
  return <RequirementsQuestionnaire token={token} kind={kind} />;
}
