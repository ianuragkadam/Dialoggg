"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { RequirementOption } from "@/lib/requirements-questionnaire";
import {
  getRequirementsWorkshop,
  type RequirementsWorkshopKind,
} from "@/lib/requirements-workshops";

type LocalResponse = {
  answerId: string | null;
  comment: string;
  updatedAt?: string;
};

type FormStatus = "in_progress" | "completed";
type SaveState = "idle" | "saving" | "saved" | "error";

export default function RequirementsQuestionnaire({
  token,
  kind = "initial",
}: {
  token: string;
  kind?: RequirementsWorkshopKind;
}) {
  const workshop = getRequirementsWorkshop(kind);
  const [responses, setResponses] = useState<Record<string, LocalResponse>>({});
  const responsesRef = useRef<Record<string, LocalResponse>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [activeSection, setActiveSection] = useState(0);
  const [generalComment, setGeneralComment] = useState("");
  const generalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [formStatus, setFormStatus] = useState<FormStatus>("in_progress");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const section = workshop.sections[activeSection];
  const answered = useMemo(
    () => workshop.questions.filter(question => responses[question.id]?.answerId).length,
    [responses, workshop.questions],
  );
  const percent = Math.round((answered / workshop.questions.length) * 100);
  const sectionAnswered = section.questions.filter(question => responses[question.id]?.answerId).length;

  useEffect(() => {
    let alive = true;
    fetch(`/api/requirements/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 404 ? "NOT_FOUND" : "LOAD_FAILED");
        return response.json();
      })
      .then(snapshot => {
        if (!alive) return;
        const loaded: Record<string, LocalResponse> = {};
        for (const item of snapshot.responses || []) {
          loaded[item.question_id] = {
            answerId: item.answer_id,
            comment: item.comment || "",
            updatedAt: item.updated_at,
          };
        }
        responsesRef.current = loaded;
        setResponses(loaded);
        setGeneralComment(snapshot.state?.general_comment || "");
        setFormStatus(snapshot.state?.status === "completed" ? "completed" : "in_progress");
        setLastSaved(snapshot.state?.updated_at || null);

        const firstIncomplete = workshop.sections.findIndex(candidate =>
          candidate.questions.some(question => !loaded[question.id]?.answerId),
        );
        if (firstIncomplete >= 0) setActiveSection(firstIncomplete);
      })
      .catch(() => {
        if (!alive) return;
        setNotFound(true);
      })
      .finally(() => { if (alive) setLoading(false); });

    return () => {
      alive = false;
      for (const timer of Object.values(timersRef.current)) clearTimeout(timer);
      if (generalTimerRef.current) clearTimeout(generalTimerRef.current);
    };
  }, [token, workshop.sections]);

  function updateLocal(questionId: string, patch: Partial<LocalResponse>): LocalResponse {
    const current = responsesRef.current[questionId] || { answerId: null, comment: "" };
    const next = { ...current, ...patch };
    const all = { ...responsesRef.current, [questionId]: next };
    responsesRef.current = all;
    setResponses(all);
    setFormStatus("in_progress");
    return next;
  }

  async function saveQuestion(questionId: string, value: LocalResponse) {
    setSaveState("saving");
    try {
      const response = await fetch(`/api/requirements/${encodeURIComponent(token)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionId,
          answerId: value.answerId,
          comment: value.comment,
        }),
      });
      if (!response.ok) throw new Error("SAVE_FAILED");
      const result = await response.json();
      const savedAt = result.response?.updated_at || result.snapshot?.state?.updated_at || new Date().toISOString();
      setLastSaved(savedAt);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  function chooseAnswer(questionId: string, answerId: string) {
    if (timersRef.current[questionId]) clearTimeout(timersRef.current[questionId]);
    const next = updateLocal(questionId, { answerId });
    void saveQuestion(questionId, next);
  }

  function changeComment(questionId: string, comment: string) {
    const next = updateLocal(questionId, { comment });
    if (timersRef.current[questionId]) clearTimeout(timersRef.current[questionId]);
    timersRef.current[questionId] = setTimeout(() => {
      delete timersRef.current[questionId];
      void saveQuestion(questionId, next);
    }, 700);
  }

  function flushComment(questionId: string) {
    if (timersRef.current[questionId]) clearTimeout(timersRef.current[questionId]);
    delete timersRef.current[questionId];
    const current = responsesRef.current[questionId];
    if (current) void saveQuestion(questionId, current);
  }

  async function useRecommendedForSection() {
    const additions: Array<{ questionId: string; value: LocalResponse }> = [];
    let all = { ...responsesRef.current };
    for (const question of section.questions) {
      if (all[question.id]?.answerId) continue;
      const recommended = question.options.find(item => item.recommended);
      if (!recommended) continue;
      const value = {
        answerId: recommended.id,
        comment: all[question.id]?.comment || "",
      };
      all[question.id] = value;
      additions.push({ questionId: question.id, value });
    }
    if (!additions.length) return;
    responsesRef.current = all;
    setResponses(all);
    setFormStatus("in_progress");
    await Promise.all(additions.map(item => saveQuestion(item.questionId, item.value)));
  }

  async function saveGeneral(value: string) {
    setSaveState("saving");
    try {
      const response = await fetch(`/api/requirements/${encodeURIComponent(token)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ generalComment: value }),
      });
      if (!response.ok) throw new Error("SAVE_FAILED");
      const result = await response.json();
      setLastSaved(result.state?.updated_at || new Date().toISOString());
      setSaveState("saved");
      setFormStatus("in_progress");
    } catch {
      setSaveState("error");
    }
  }

  function changeGeneralComment(value: string) {
    setGeneralComment(value);
    setFormStatus("in_progress");
    if (generalTimerRef.current) clearTimeout(generalTimerRef.current);
    generalTimerRef.current = setTimeout(() => {
      generalTimerRef.current = null;
      void saveGeneral(value);
    }, 700);
  }

  async function markComplete() {
    const missing = workshop.questions.length - answered;
    if (missing > 0 && !window.confirm(`${missing} question${missing === 1 ? " is" : "s are"} still unanswered. Mark the workshop complete anyway?`)) {
      return;
    }
    setSaveState("saving");
    try {
      const pendingQuestions = Object.keys(timersRef.current);
      for (const questionId of pendingQuestions) {
        clearTimeout(timersRef.current[questionId]);
        delete timersRef.current[questionId];
      }
      if (generalTimerRef.current) {
        clearTimeout(generalTimerRef.current);
        generalTimerRef.current = null;
      }
      await Promise.all([
        ...pendingQuestions.map(questionId => saveQuestion(questionId, responsesRef.current[questionId])),
        saveGeneral(generalComment),
      ]);
      const response = await fetch(`/api/requirements/${encodeURIComponent(token)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!response.ok) throw new Error("SAVE_FAILED");
      const result = await response.json();
      setFormStatus("completed");
      setLastSaved(result.state?.updated_at || new Date().toISOString());
      setSaveState("saved");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setSaveState("error");
    }
  }

  function goToSection(index: number) {
    setActiveSection(Math.max(0, Math.min(workshop.sections.length - 1, index)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading) return <LoadingScreen />;
  if (notFound) return <UnavailableScreen />;

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 text-lg font-black text-white">D</div>
              <div>
                <div className="font-bold leading-tight text-blue-950">{workshop.workshopTitle}</div>
                <div className="text-xs text-slate-500">{workshop.workshopSubtitle}</div>
              </div>
            </div>
            <SaveIndicator state={saveState} lastSaved={lastSaved} />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-500" style={{ width: `${percent}%` }} />
            </div>
            <div className="whitespace-nowrap text-sm font-semibold text-slate-700">{answered}/{workshop.questions.length} answered</div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <nav className="flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-1 lg:overflow-visible" aria-label="Question sections">
            {workshop.sections.map((item, index) => {
              const complete = item.questions.every(question => responses[question.id]?.answerId);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goToSection(index)}
                  className={`flex min-w-52 items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition lg:min-w-0 lg:w-full ${
                    activeSection === index
                      ? "bg-blue-700 font-semibold text-white shadow-sm"
                      : "bg-white text-slate-700 hover:bg-blue-50"
                  }`}
                >
                  <span>{item.title}</span>
                  <span className={`text-xs ${activeSection === index ? "text-blue-100" : complete ? "text-emerald-600" : "text-slate-400"}`}>
                    {complete ? "✓" : `${item.questions.filter(question => responses[question.id]?.answerId).length}/${item.questions.length}`}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0">
          {formStatus === "completed" && (
            <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <div className="font-bold">Workshop marked complete</div>
              <p className="mt-1 text-sm">Thank you. You can still change an answer; the workshop will return to In progress automatically.</p>
            </div>
          )}

          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-blue-700">Section {activeSection + 1} of {workshop.sections.length}</div>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{section.title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{section.intro}</p>
            </div>
            {sectionAnswered < section.questions.length && (
              <button
                type="button"
                onClick={() => void useRecommendedForSection()}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100"
              >
                Use recommended for unanswered
              </button>
            )}
          </div>

          <div className="space-y-5">
            {section.questions.map(question => {
              const response = responses[question.id] || { answerId: null, comment: "" };
              return (
                <article key={question.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
                    <div className="flex gap-3">
                      <div className="flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{workshop.displayNumberById.get(question.id)}</div>
                      <div>
                        <h2 className="font-bold leading-6 text-slate-950">{question.prompt}</h2>
                        <p className="mt-1 text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-700">Why we are asking: </span>{question.context}</p>
                        {question.example && (
                          <div className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2.5 text-sm leading-6 text-cyan-950">
                            <span className="font-bold">Simple example: </span>{question.example}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 p-4 sm:p-6" role="radiogroup" aria-label={question.prompt}>
                    {question.options.map(item => (
                      <AnswerOption
                        key={item.id}
                        option={item}
                        selected={response.answerId === item.id}
                        onSelect={() => chooseAnswer(question.id, item.id)}
                      />
                    ))}
                    <div className="pt-3">
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500" htmlFor={`${question.id}-comment`}>
                        Optional comment
                      </label>
                      <textarea
                        id={`${question.id}-comment`}
                        value={response.comment}
                        onChange={event => changeComment(question.id, event.target.value)}
                        onBlur={() => flushComment(question.id)}
                        rows={2}
                        maxLength={4000}
                        placeholder="Add an example, concern, or different idea…"
                        className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {activeSection === workshop.sections.length - 1 && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="font-bold text-slate-950">Anything else we should know?</h2>
              <p className="mt-1 text-sm text-slate-500">Use this space for an overall note that does not belong to one question.</p>
              <textarea
                value={generalComment}
                onChange={event => changeGeneralComment(event.target.value)}
                onBlur={() => {
                  if (generalTimerRef.current) clearTimeout(generalTimerRef.current);
                  generalTimerRef.current = null;
                  void saveGeneral(generalComment);
                }}
                rows={5}
                maxLength={8000}
                className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                placeholder="Final thoughts, examples, or priorities…"
              />
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 p-4 text-white sm:p-5">
            <button
              type="button"
              disabled={activeSection === 0}
              onClick={() => goToSection(activeSection - 1)}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            >
              ← Previous
            </button>
            <div className="text-center text-xs text-slate-300">
              {sectionAnswered === section.questions.length ? "Section complete ✓" : `${section.questions.length - sectionAnswered} left in this section`}
            </div>
            {activeSection < workshop.sections.length - 1 ? (
              <button
                type="button"
                onClick={() => goToSection(activeSection + 1)}
                className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:bg-blue-50"
              >
                Next section →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void markComplete()}
                className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-300"
              >
                Mark workshop complete
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function AnswerOption({ option, selected, onSelect }: { option: RequirementOption; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      role="radio"
      aria-checked={selected}
      className={`w-full rounded-xl border p-3 text-left transition sm:p-4 ${
        selected
          ? "border-blue-600 bg-blue-50 ring-2 ring-blue-100"
          : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${selected ? "border-blue-600 bg-blue-600" : "border-slate-300"}`}>
          {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{option.label}</span>
            {option.recommended && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">Recommended</span>}
          </span>
          <span className="mt-1 block text-sm leading-5 text-slate-500">{option.detail}</span>
        </span>
      </div>
    </button>
  );
}

function SaveIndicator({ state, lastSaved }: { state: SaveState; lastSaved: string | null }) {
  const label = state === "saving"
    ? "Saving…"
    : state === "error"
      ? "Save failed—try again"
      : state === "saved"
        ? "Saved automatically"
        : lastSaved
          ? "All answers saved"
          : "Autosave ready";
  return (
    <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
      state === "error" ? "bg-red-50 text-red-700" : state === "saving" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
    }`} title={lastSaved ? `Last saved ${new Date(lastSaved).toLocaleString()}` : undefined}>
      <span className={`h-2 w-2 rounded-full ${state === "error" ? "bg-red-500" : state === "saving" ? "animate-pulse bg-amber-500" : "bg-emerald-500"}`} />
      {label}
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-700" />
        <p className="mt-4 text-sm font-semibold text-slate-600">Opening your requirements workshop…</p>
      </div>
    </main>
  );
}

function UnavailableScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="text-4xl">🔒</div>
        <h1 className="mt-4 text-xl font-bold text-slate-950">This questionnaire link is unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Please use the private link supplied by the Dialoggg team.</p>
      </div>
    </main>
  );
}
