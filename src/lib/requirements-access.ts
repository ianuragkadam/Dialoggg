import "server-only";

import { timingSafeEqual } from "node:crypto";

import type { RequirementsWorkshopKind } from "@/lib/requirements-workshops";

function tokenMatches(actual: string, expected: string | undefined): boolean {
  if (!expected || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function isQuestionnaireToken(token: string): boolean {
  return tokenMatches(token, process.env.REQUIREMENTS_FORM_TOKEN);
}

export function isRequirementsReviewToken(token: string): boolean {
  return tokenMatches(token, process.env.REQUIREMENTS_REVIEW_TOKEN);
}

export function questionnaireKindForToken(token: string): RequirementsWorkshopKind | null {
  if (isQuestionnaireToken(token)) return "initial";
  if (tokenMatches(token, process.env.FOLLOW_UP_REQUIREMENTS_FORM_TOKEN)) return "follow_up";
  return null;
}

export function reviewKindForToken(token: string): RequirementsWorkshopKind | null {
  if (isRequirementsReviewToken(token)) return "initial";
  if (tokenMatches(token, process.env.FOLLOW_UP_REQUIREMENTS_REVIEW_TOKEN)) return "follow_up";
  return null;
}
