import { NextRequest, NextResponse } from "next/server";

import { isQuestionnaireToken } from "@/lib/requirements-access";
import {
  requirementsSnapshot,
  saveRequirementResponse,
  saveRequirementsGeneralComment,
  setRequirementsFormStatus,
} from "@/lib/requirements-store";

const NO_STORE = { "cache-control": "no-store, max-age=0" };

function notFound() {
  return NextResponse.json({ error: "Questionnaire not found" }, { status: 404, headers: NO_STORE });
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isQuestionnaireToken(token)) return notFound();
  return NextResponse.json(requirementsSnapshot(), { headers: NO_STORE });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isQuestionnaireToken(token)) return notFound();

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
      const response = saveRequirementResponse(body.questionId, answerId, comment);
      return NextResponse.json({ ok: true, response, snapshot: requirementsSnapshot() }, { headers: NO_STORE });
    }

    if (typeof body.generalComment === "string") {
      const state = saveRequirementsGeneralComment(body.generalComment.trim().slice(0, 8000));
      return NextResponse.json({ ok: true, state, snapshot: requirementsSnapshot() }, { headers: NO_STORE });
    }

    if (body.status === "completed" || body.status === "in_progress") {
      const state = setRequirementsFormStatus(body.status);
      return NextResponse.json({ ok: true, state, snapshot: requirementsSnapshot() }, { headers: NO_STORE });
    }
  } catch (error) {
    if (error instanceof Error && (error.message === "UNKNOWN_QUESTION" || error.message === "UNKNOWN_ANSWER")) {
      return NextResponse.json({ error: "Unknown question or answer" }, { status: 400, headers: NO_STORE });
    }
    throw error;
  }

  return NextResponse.json({ error: "Nothing to save" }, { status: 400, headers: NO_STORE });
}

