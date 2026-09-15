import {
  FOLLOW_UP_DISPLAY_NUMBER_BY_ID,
  FOLLOW_UP_FORM_KEY,
  FOLLOW_UP_QUESTION_BY_ID,
  FOLLOW_UP_QUESTIONS,
  FOLLOW_UP_SECTIONS,
} from "@/lib/follow-up-questionnaire";
import {
  REQUIREMENTS_DISPLAY_NUMBER_BY_ID,
  REQUIREMENTS_FORM_KEY,
  REQUIREMENTS_QUESTION_BY_ID,
  REQUIREMENTS_QUESTIONS,
  REQUIREMENTS_SECTIONS,
  type RequirementQuestion,
  type RequirementSection,
} from "@/lib/requirements-questionnaire";

export type RequirementsWorkshopKind = "initial" | "follow_up";

export type RequirementsWorkshopDefinition = {
  kind: RequirementsWorkshopKind;
  formKey: string;
  sections: RequirementSection[];
  questions: RequirementQuestion[];
  questionById: Map<string, RequirementQuestion>;
  displayNumberById: Map<string, number>;
  workshopTitle: string;
  workshopSubtitle: string;
  reviewTitle: string;
  reviewSubtitle: string;
  markdownTitle: string;
  markdownFilename: string;
};

export const REQUIREMENTS_WORKSHOPS: Record<RequirementsWorkshopKind, RequirementsWorkshopDefinition> = {
  initial: {
    kind: "initial",
    formKey: REQUIREMENTS_FORM_KEY,
    sections: REQUIREMENTS_SECTIONS,
    questions: REQUIREMENTS_QUESTIONS,
    questionById: REQUIREMENTS_QUESTION_BY_ID,
    displayNumberById: REQUIREMENTS_DISPLAY_NUMBER_BY_ID,
    workshopTitle: "Dialoggg Requirements Workshop",
    workshopSubtitle: "Choose what feels right. Add a note whenever context will help.",
    reviewTitle: "Dialoggg Requirements Responses",
    reviewSubtitle: "Read-only results. This page refreshes automatically every 15 seconds while Scott works through the questionnaire.",
    markdownTitle: "Dialoggg Reboot Requirements Responses",
    markdownFilename: "dialoggg-requirements-responses.md",
  },
  follow_up: {
    kind: "follow_up",
    formKey: FOLLOW_UP_FORM_KEY,
    sections: FOLLOW_UP_SECTIONS,
    questions: FOLLOW_UP_QUESTIONS,
    questionById: FOLLOW_UP_QUESTION_BY_ID,
    displayNumberById: FOLLOW_UP_DISPLAY_NUMBER_BY_ID,
    workshopTitle: "Dialoggg Follow-up Workshop",
    workshopSubtitle: "These are the final detailed choices. Each question includes a simple example.",
    reviewTitle: "Dialoggg Follow-up Responses",
    reviewSubtitle: "Read-only results for the follow-up workshop. This page refreshes automatically every 15 seconds while Scott answers.",
    markdownTitle: "Dialoggg Reboot Follow-up Responses",
    markdownFilename: "dialoggg-follow-up-responses.md",
  },
};

export function getRequirementsWorkshop(kind: RequirementsWorkshopKind): RequirementsWorkshopDefinition {
  return REQUIREMENTS_WORKSHOPS[kind];
}
