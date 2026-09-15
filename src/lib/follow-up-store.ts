import "server-only";

import db from "@/db";
import {
  FOLLOW_UP_DISPLAY_NUMBER_BY_ID,
  FOLLOW_UP_FORM_KEY,
  FOLLOW_UP_QUESTION_BY_ID,
  FOLLOW_UP_QUESTIONS,
  FOLLOW_UP_SECTIONS,
} from "@/lib/follow-up-questionnaire";

import type {
  RequirementsFormState,
  StoredRequirementResponse,
} from "@/lib/requirements-store";

function ensureFollowUpForm(): RequirementsFormState {
  db.prepare(`
    INSERT INTO requirements_form_state (form_key)
    VALUES (?)
    ON CONFLICT(form_key) DO NOTHING
  `).run(FOLLOW_UP_FORM_KEY);

  return db.prepare(
    "SELECT * FROM requirements_form_state WHERE form_key = ?",
  ).get(FOLLOW_UP_FORM_KEY) as RequirementsFormState;
}

function readFollowUpResponses(): StoredRequirementResponse[] {
  ensureFollowUpForm();
  return db.prepare(`
    SELECT question_id, answer_id, comment, updated_at
    FROM requirements_response
    WHERE form_key = ?
    ORDER BY question_id
  `).all(FOLLOW_UP_FORM_KEY) as StoredRequirementResponse[];
}

export function saveFollowUpResponse(
  questionId: string,
  answerId: string | null,
  comment: string,
): StoredRequirementResponse {
  const currentQuestion = FOLLOW_UP_QUESTION_BY_ID.get(questionId);
  if (!currentQuestion) throw new Error("UNKNOWN_QUESTION");
  if (answerId !== null && !currentQuestion.options.some(item => item.id === answerId)) {
    throw new Error("UNKNOWN_ANSWER");
  }

  ensureFollowUpForm();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`
      INSERT INTO requirements_response (form_key, question_id, answer_id, comment, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(form_key, question_id) DO UPDATE SET
        answer_id = excluded.answer_id,
        comment = excluded.comment,
        updated_at = excluded.updated_at
    `).run(FOLLOW_UP_FORM_KEY, questionId, answerId, comment, now);

    db.prepare(`
      UPDATE requirements_form_state
      SET status = 'in_progress', completed_at = NULL, updated_at = ?
      WHERE form_key = ?
    `).run(now, FOLLOW_UP_FORM_KEY);
  })();

  return {
    question_id: questionId,
    answer_id: answerId,
    comment,
    updated_at: now,
  };
}

export function saveFollowUpGeneralComment(comment: string): RequirementsFormState {
  ensureFollowUpForm();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE requirements_form_state
    SET general_comment = ?, status = 'in_progress', completed_at = NULL, updated_at = ?
    WHERE form_key = ?
  `).run(comment, now, FOLLOW_UP_FORM_KEY);
  return ensureFollowUpForm();
}

export function setFollowUpFormStatus(status: "in_progress" | "completed"): RequirementsFormState {
  ensureFollowUpForm();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE requirements_form_state
    SET status = ?, completed_at = ?, updated_at = ?
    WHERE form_key = ?
  `).run(status, status === "completed" ? now : null, now, FOLLOW_UP_FORM_KEY);
  return ensureFollowUpForm();
}

export function followUpSnapshot() {
  const state = ensureFollowUpForm();
  const responses = readFollowUpResponses();
  const answered = responses.filter(response => response.answer_id !== null).length;
  return {
    state,
    responses,
    progress: {
      answered,
      total: FOLLOW_UP_QUESTIONS.length,
      percent: Math.round((answered / FOLLOW_UP_QUESTIONS.length) * 100),
    },
  };
}

function cleanMarkdown(value: string): string {
  return value.replace(/\r?\n/g, "  \n").trim();
}

export function buildFollowUpMarkdown(): string {
  const snapshot = followUpSnapshot();
  const responseByQuestion = new Map(snapshot.responses.map(response => [response.question_id, response]));
  const lines: string[] = [
    "# Dialoggg Reboot Follow-up Responses",
    "",
    `**Status:** ${snapshot.state.status === "completed" ? "Completed" : "In progress"}`,
    `**Answered:** ${snapshot.progress.answered} of ${snapshot.progress.total}`,
    `**Last saved:** ${snapshot.state.updated_at}`,
    "",
  ];

  for (const section of FOLLOW_UP_SECTIONS) {
    lines.push(`## ${section.title}`, "");
    for (const item of section.questions) {
      const response = responseByQuestion.get(item.id);
      const selected = item.options.find(option => option.id === response?.answer_id);
      lines.push(`### ${FOLLOW_UP_DISPLAY_NUMBER_BY_ID.get(item.id)}. ${item.prompt}`, "");
      lines.push(`**Why we asked:** ${item.context}`);
      if (item.example) lines.push(`**Example:** ${item.example}`);
      lines.push(`**Answer:** ${selected?.label ?? "Not answered"}`);
      if (selected?.detail) lines.push(`**Meaning:** ${selected.detail}`);
      if (response?.comment.trim()) lines.push(`**Comment:** ${cleanMarkdown(response.comment)}`);
      lines.push("");
    }
  }

  lines.push("## Overall comments", "", cleanMarkdown(snapshot.state.general_comment) || "No overall comments.", "");
  return lines.join("\n");
}
