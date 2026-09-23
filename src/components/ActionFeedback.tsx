"use client";

export type FeedbackKind = "info" | "success" | "error";

export default function ActionFeedback({ message, kind = "info" }: { message: string; kind?: FeedbackKind }) {
  if (!message) return null;
  const classes = kind === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : kind === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-blue-200 bg-blue-50 text-blue-950";
  return <div role={kind === "error" ? "alert" : "status"} aria-live={kind === "error" ? "assertive" : "polite"} className={`rounded-lg border p-3 text-sm font-semibold ${classes}`}>
    <span aria-hidden="true" className="mr-2">{kind === "success" ? "✓" : kind === "error" ? "!" : "…"}</span>{message}
  </div>;
}
