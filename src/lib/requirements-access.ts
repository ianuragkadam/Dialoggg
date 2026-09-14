import "server-only";

import { timingSafeEqual } from "node:crypto";

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

