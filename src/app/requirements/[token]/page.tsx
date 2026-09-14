import type { Metadata } from "next";
import { notFound } from "next/navigation";

import RequirementsQuestionnaire from "@/components/RequirementsQuestionnaire";
import { isQuestionnaireToken } from "@/lib/requirements-access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dialoggg Requirements Workshop",
  description: "A private requirements questionnaire for the Dialoggg Reboot.",
  robots: { index: false, follow: false },
};

export default async function RequirementsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isQuestionnaireToken(token)) notFound();
  return <RequirementsQuestionnaire token={token} />;
}
