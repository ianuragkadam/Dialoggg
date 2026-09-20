import { NextRequest, NextResponse } from "next/server";

import {
  followUpSnapshot,
  saveFollowUpGeneralComment,
  saveFollowUpResponse,
  setFollowUpFormStatus,
} from "@/lib/follow-up-store";
import { questionnaireKindForToken } from "@/lib/requirements-access";
import {
  requirementsSnapshot,
  saveRequirementResponse,
  saveRequirementsGeneralComment,
  setRequirementsFormStatus,
} from "@/lib/requirements-store";
import { validateRequestOrigin } from "@/lib/request-security";

const NO_STORE = { "cache-control": "no-store, max-age=0" };

function notFound() {
  return NextResponse.json({ error: "Questionnaire not found" }, { status: 404, headers: NO_STORE });
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const kind = questionnaireKindForToken(token);
  if (!kind) return notFound();
  return NextResponse.json(kind === "follow_up" ? followUpSnapshot() : requirementsSnapshot(), { headers: NO_STORE });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!validateRequestOrigin(req)) return NextResponse.json({ error: "Request rejected" }, { status: 403, headers: NO_STORE });
  const { token } = await params;
  const kind = questionnaireKindForToken(token);
  if (!kind) return notFound();

  const snapshot = kind === "follow_up" ? followUpSnapshot : requirementsSnapshot;
  const saveResponse = kind === "follow_up" ? saveFollowUpResponse : saveRequirementResponse;
  const saveGeneralComment = kind === "follow_up" ? saveFollowUpGeneralComment : saveRequirementsGeneralComment;
  const setFormStatus = kind === "follow_up" ? setFollowUpFormStatus : setRequirementsFormStatus;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: NO_STORE });
  }

  try {
    if (typeof body.questionId === "string") {
      const answerId = body.answerId === null || body.answerId === undefined
        ? null
        : String(body.answerId);
      const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 4000) : "";
      const response = saveResponse(body.questionId, answerId, comment);
      return NextResponse.json({ ok: true, response, snapshot: snapshot() }, { headers: NO_STORE });
    }

    if (typeof body.generalComment === "string") {
      const state = saveGeneralComment(body.generalComment.trim().slice(0, 8000));
      return NextResponse.json({ ok: true, state, snapshot: snapshot() }, { headers: NO_STORE });
    }

    if (body.status === "completed" || body.status === "in_progress") {
      const state = setFormStatus(body.status);
      return NextResponse.json({ ok: true, state, snapshot: snapshot() }, { headers: NO_STORE });
    }
  } catch (error) {
    if (error instanceof Error && (error.message === "UNKNOWN_QUESTION" || error.message === "UNKNOWN_ANSWER")) {
      return NextResponse.json({ error: "Unknown question or answer" }, { status: 400, headers: NO_STORE });
    }
    throw error;
  }

  return NextResponse.json({ error: "Nothing to save" }, { status: 400, headers: NO_STORE });
}
