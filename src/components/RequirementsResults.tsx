"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getRequirementsWorkshop,
  type RequirementsWorkshopKind,
} from "@/lib/requirements-workshops";

type StoredResponse = {
  question_id: string;
  answer_id: string | null;
  comment: string;
  updated_at: string;
};

type Snapshot = {
  state: {
    status: "in_progress" | "completed";
    general_comment: string;
    updated_at: string;
    completed_at: string | null;
  };
  responses: StoredResponse[];
  progress: { answered: number; total: number; percent: number };
};

type Filter = "all" | "answered" | "unanswered" | "comments";

export default function RequirementsResults({
  token,
  kind = "initial",
}: {
  token: string;
  kind?: RequirementsWorkshopKind;
}) {
  const workshop = getRequirementsWorkshop(kind);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const endpoint = `/api/requirements-review/${encodeURIComponent(token)}`;
  const load = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error("LOAD_FAILED");
      setSnapshot(await response.json());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [load]);

  const responseByQuestion = useMemo(
    () => new Map((snapshot?.responses || []).map(response => [response.question_id, response])),
    [snapshot],
  );

  if (loading) return <ResultsLoading />;
  if (error || !snapshot) return <ResultsUnavailable />;

  const visible = (questionId: string) => {
    const response = responseByQuestion.get(questionId);
    if (filter === "answered") return !!response?.answer_id;
    if (filter === "unanswered") return !response?.answer_id;
    if (filter === "comments") return !!response?.comment.trim();
    return true;
  };

  const commented = snapshot.responses.filter(response => response.comment.trim()).length;

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">Private review</div>
              <h1 className="mt-2 text-3xl font-black tracking-tight">{workshop.reviewTitle}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{workshop.reviewSubtitle}</p>
            </div>
            <div className={`rounded-full px-3 py-1.5 text-sm font-bold ${snapshot.state.status === "completed" ? "bg-emerald-400 text-emerald-950" : "bg-amber-300 text-amber-950"}`}>
              {snapshot.state.status === "completed" ? "Completed" : "In progress"}
            </div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <Metric label="Answered" value={`${snapshot.progress.answered} / ${snapshot.progress.total}`} />
            <Metric label="Progress" value={`${snapshot.progress.percent}%`} />
            <Metric label="Comments" value={String(commented)} />
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all" style={{ width: `${snapshot.progress.percent}%` }} />
          </div>
          <div className="mt-3 text-xs text-slate-400">Last saved {new Date(snapshot.state.updated_at).toLocaleString()}</div>
        </div>
      </header>

      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap gap-2">
            <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>All</FilterButton>
            <FilterButton active={filter === "answered"} onClick={() => setFilter("answered")}>Answered</FilterButton>
            <FilterButton active={filter === "unanswered"} onClick={() => setFilter("unanswered")}>Needs answer</FilterButton>
            <FilterButton active={filter === "comments"} onClick={() => setFilter("comments")}>Has comments</FilterButton>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void load()} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Refresh</button>
            <a href={`${endpoint}?format=markdown`} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800">Download Markdown</a>
            <a href={endpoint} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Raw JSON</a>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
        <div className="space-y-8">
          {workshop.sections.map(section => {
            const questions = section.questions.filter(question => visible(question.id));
            if (!questions.length) return null;
            return (
              <section key={section.id}>
                <div className="mb-3">
                  <h2 className="text-xl font-black text-slate-950">{section.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{section.intro}</p>
                </div>
                <div className="space-y-3">
                  {questions.map(question => {
                    const response = responseByQuestion.get(question.id);
                    const selected = question.options.find(item => item.id === response?.answer_id);
                    const recommended = question.options.find(item => item.recommended);
                    const differs = selected && recommended && selected.id !== recommended.id;
                    return (
                      <article key={question.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{workshop.displayNumberById.get(question.id)}</div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-bold leading-6 text-slate-950">{question.prompt}</h3>
                            <p className="mt-1 text-sm leading-6 text-slate-500"><span className="font-semibold text-slate-600">Why we asked: </span>{question.context}</p>
                            {question.example && (
                              <div className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2.5 text-sm leading-6 text-cyan-950">
                                <span className="font-bold">Simple example: </span>{question.example}
                              </div>
                            )}
                            <div className="mt-3 rounded-xl bg-slate-50 p-3">
                              {selected ? (
                                <>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-bold text-blue-800">{selected.label}</span>
                                    {selected.recommended && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">Recommended choice</span>}
                                    {differs && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">Different from recommendation</span>}
                                  </div>
                                  <p className="mt-1 text-sm leading-5 text-slate-600">{selected.detail}</p>
                                </>
                              ) : (
                                <span className="text-sm font-semibold text-slate-400">Not answered yet</span>
                              )}
                            </div>
                            {response?.comment.trim() && (
                              <div className="mt-3 border-l-4 border-cyan-400 pl-3">
                                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Scott's comment</div>
                                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{response.comment}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {(filter === "all" || filter === "comments") && (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">Overall comments</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {snapshot.state.general_comment.trim() || "No overall comments yet."}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-lg px-3 py-2 text-sm font-semibold ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
      {children}
    </button>
  );
}

function ResultsLoading() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-semibold text-slate-600">Loading responses…</main>;
}

function ResultsUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="text-4xl">🔒</div>
        <h1 className="mt-4 text-xl font-bold text-slate-950">Review link unavailable</h1>
        <p className="mt-2 text-sm text-slate-500">Please use the private review link supplied for this workshop.</p>
      </div>
    </main>
  );
}
