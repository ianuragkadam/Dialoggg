import "server-only";

import db from "@/db";
import {
  REQUIREMENTS_FORM_KEY,
  REQUIREMENTS_DISPLAY_NUMBER_BY_ID,
  REQUIREMENTS_QUESTION_BY_ID,
  REQUIREMENTS_QUESTIONS,
  REQUIREMENTS_SECTIONS,
} from "@/lib/requirements-questionnaire";

export type StoredRequirementResponse = {
  question_id: string;
  answer_id: string | null;
  comment: string;
  updated_at: string;
};

export type RequirementsFormState = {
  form_key: string;
  status: "in_progress" | "completed";
  general_comment: string;
  updated_at: string;
  completed_at: string | null;
};

export function ensureRequirementsForm(): RequirementsFormState {
  db.prepare(`
    INSERT INTO requirements_form_state (form_key)
    VALUES (?)
    ON CONFLICT(form_key) DO NOTHING
  `).run(REQUIREMENTS_FORM_KEY);

  return db.prepare(
    "SELECT * FROM requirements_form_state WHERE form_key = ?",
  ).get(REQUIREMENTS_FORM_KEY) as RequirementsFormState;
}

export function readRequirementsResponses(): StoredRequirementResponse[] {
  ensureRequirementsForm();
  return db.prepare(`
    SELECT question_id, answer_id, comment, updated_at
    FROM requirements_response
    WHERE form_key = ?
    ORDER BY question_id
  `).all(REQUIREMENTS_FORM_KEY) as StoredRequirementResponse[];
}

export function saveRequirementResponse(
  questionId: string,
  answerId: string | null,
  comment: string,
): StoredRequirementResponse {
  const question = REQUIREMENTS_QUESTION_BY_ID.get(questionId);
  if (!question) throw new Error("UNKNOWN_QUESTION");
  if (answerId !== null && !question.options.some(item => item.id === answerId)) {
    throw new Error("UNKNOWN_ANSWER");
  }

  ensureRequirementsForm();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`
      INSERT INTO requirements_response (form_key, question_id, answer_id, comment, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(form_key, question_id) DO UPDATE SET
        answer_id = excluded.answer_id,
        comment = excluded.comment,
        updated_at = excluded.updated_at
    `).run(REQUIREMENTS_FORM_KEY, questionId, answerId, comment, now);

    db.prepare(`
      UPDATE requirements_form_state
      SET status = 'in_progress', completed_at = NULL, updated_at = ?
      WHERE form_key = ?
    `).run(now, REQUIREMENTS_FORM_KEY);
  })();

  return {
    question_id: questionId,
    answer_id: answerId,
    comment,
    updated_at: now,
  };
}

export function saveRequirementsGeneralComment(comment: string): RequirementsFormState {
  ensureRequirementsForm();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE requirements_form_state
    SET general_comment = ?, status = 'in_progress', completed_at = NULL, updated_at = ?
    WHERE form_key = ?
  `).run(comment, now, REQUIREMENTS_FORM_KEY);
  return ensureRequirementsForm();
}

export function setRequirementsFormStatus(status: "in_progress" | "completed"): RequirementsFormState {
  ensureRequirementsForm();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE requirements_form_state
    SET status = ?, completed_at = ?, updated_at = ?
    WHERE form_key = ?
  `).run(status, status === "completed" ? now : null, now, REQUIREMENTS_FORM_KEY);
  return ensureRequirementsForm();
}

export function requirementsSnapshot() {
  const state = ensureRequirementsForm();
  const responses = readRequirementsResponses();
  const answered = responses.filter(response => response.answer_id !== null).length;
  return {
    state,
    responses,
    progress: {
      answered,
      total: REQUIREMENTS_QUESTIONS.length,
      percent: Math.round((answered / REQUIREMENTS_QUESTIONS.length) * 100),
    },
  };
}

function cleanMarkdown(value: string): string {
  return value.replace(/\r?\n/g, "  \n").trim();
}

export function buildRequirementsMarkdown(): string {
  const snapshot = requirementsSnapshot();
  const responseByQuestion = new Map(snapshot.responses.map(response => [response.question_id, response]));
  const lines: string[] = [
    "# Dialoggg Reboot Requirements Responses",
    "",
    `**Status:** ${snapshot.state.status === "completed" ? "Completed" : "In progress"}`,
    `**Answered:** ${snapshot.progress.answered} of ${snapshot.progress.total}`,
    `**Last saved:** ${snapshot.state.updated_at}`,
    "",
  ];

  for (const section of REQUIREMENTS_SECTIONS) {
    lines.push(`## ${section.title}`, "");
    for (const question of section.questions) {
      const response = responseByQuestion.get(question.id);
      const selected = question.options.find(item => item.id === response?.answer_id);
      lines.push(`### ${REQUIREMENTS_DISPLAY_NUMBER_BY_ID.get(question.id)}. ${question.prompt}`, "");
      lines.push(`**Answer:** ${selected?.label ?? "Not answered"}`);
      if (selected?.detail) lines.push(`**Meaning:** ${selected.detail}`);
      if (response?.comment.trim()) lines.push(`**Comment:** ${cleanMarkdown(response.comment)}`);
      lines.push("");
    }
  }

  lines.push("## Overall comments", "", cleanMarkdown(snapshot.state.general_comment) || "No overall comments.", "");
  return lines.join("\n");
}
