"use client";

import { useEffect, useRef } from "react";

type TimedNoticeProps = {
  message: string;
  onDismiss: () => void;
  tone?: "success" | "error" | "info";
  duration?: number;
};

export default function TimedNotice({ message, onDismiss, tone = "success", duration = 6000 }: TimedNoticeProps) {
  const dismissRef = useRef(onDismiss);

  useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);
  useEffect(() => {
    if (!message || duration <= 0) return;
    const timer = window.setTimeout(() => dismissRef.current(), duration);
    return () => window.clearTimeout(timer);
  }, [duration, message]);

  if (!message) return null;
  const toneClass = tone === "error"
    ? "border-red-200 bg-red-50 text-red-900"
    : tone === "info"
      ? "border-blue-200 bg-blue-50 text-blue-950"
      : "border-emerald-200 bg-emerald-50 text-emerald-950";

  return <div role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"} className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-sm font-semibold shadow-sm ${toneClass}`}>
    <span className="min-w-0 flex-1 leading-5">{message}</span>
    <button type="button" onClick={onDismiss} aria-label="Dismiss notification" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-current">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="block h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
    </button>
  </div>;
}
