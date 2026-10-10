"use client";

import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/client-fetch";

type CalendarApp = "google" | "apple" | "outlook";

const instructions: Record<CalendarApp, { label: string; steps: string[]; note?: string }> = {
  google: {
    label: "Google Calendar",
    steps: [
      "On a computer, open Google Calendar.",
      "On the left, next to Other calendars, click +, then From URL.",
      "Paste the link and click Add calendar.",
    ],
    note: "You can't do this in the Google Calendar phone app. Add it on a computer, and it will show up on your phone too.",
  },
  apple: {
    label: "Apple Calendar",
    steps: [
      "Open Calendar on your Mac.",
      "Choose File, then New Calendar Subscription.",
      "Paste the link and select Subscribe.",
    ],
  },
  outlook: {
    label: "Outlook",
    steps: [
      "Open Outlook Calendar.",
      "Choose Add calendar, then Subscribe from web.",
      "Paste the link, name the calendar, and select Import.",
    ],
  },
};

// Interim standards-based calendar feed. The approved Google Calendar API
// synchronization will be implemented as a separate integration module.
export default function SubscribeButton({
  feedUrlEndpoint,
  label = "📅 Calendar subscription",
  compact = false,
  calendarName = "Master Calendar",
}: {
  feedUrlEndpoint: string;
  label?: string;
  compact?: boolean;
  calendarName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [app, setApp] = useState<CalendarApp>("google");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function openPanel() {
    setOpen(true);
    setError("");
    if (url) return;
    setLoading(true);
    try {
      const response = await fetch(feedUrlEndpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || "The private calendar link could not be loaded.");
      setUrl(data.url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The private calendar link could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("The link could not be copied. Select and copy it instead.");
    }
  }

  async function resetLink() {
    if (!window.confirm("Resetting this link will stop the existing calendar subscription from updating. Continue?")) return;
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch(feedUrlEndpoint, { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || "The private calendar link could not be reset.");
      setUrl(data.url);
      setCopied(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The private calendar link could not be reset.");
    } finally {
      setLoading(false);
    }
  }

  const selectedInstructions = instructions[app];

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className={compact
          ? "text-xs text-blue-700 hover:underline font-semibold"
          : "text-sm bg-white border border-blue-600 text-blue-700 px-3 py-1.5 rounded font-semibold hover:bg-blue-50"}
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#050914]/80 p-4 backdrop-blur-[2px]" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="calendar-subscription-title" className="w-full max-w-xl overflow-hidden rounded-xl border border-[#26354d] bg-[#17243a] text-[#e6ebf2] shadow-2xl">
            <header className="flex items-center justify-between gap-4 border-b border-[#26354d] bg-[#0c1422] px-5 py-4">
              <h2 id="calendar-subscription-title" className="text-lg font-bold">Add the {calendarName} to your calendar app</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 text-xl leading-none text-[#aab8ca] hover:bg-[#26354d] hover:text-white">×</button>
            </header>

            <div className="space-y-4 px-5 py-4 text-sm">
              <p className="leading-5 text-[#c1ccda]">See your Dialoggg schedule in Google Calendar, Apple Calendar, or Outlook. It stays up to date on its own.</p>

              <section aria-labelledby="copy-calendar-link" className="space-y-2">
                <h3 id="copy-calendar-link" className="flex items-center gap-2 font-bold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#d1850b] text-xs text-[#111827]">1</span>Copy your private link</h3>
                <div className="ml-8 flex gap-2">
                  <input readOnly aria-label="Private calendar link" value={loading && !url ? "Loading your private link…" : url} className="min-w-0 flex-1 rounded-md border border-[#8393ab] bg-[#0c1422] px-3 py-2 text-xs text-[#e6ebf2]" />
                  <button type="button" onClick={copy} disabled={!url || loading} className="shrink-0 rounded-md bg-[#d1850b] px-4 py-2 font-bold text-[#111827] hover:bg-[#b87308] disabled:cursor-not-allowed disabled:opacity-50">{copied ? "Copied!" : "Copy"}</button>
                </div>
                <p className="ml-8 text-xs leading-5 text-[#d9b36f]"><span aria-hidden="true">🔒</span> This link is just for you. Anyone who has it can see this schedule, so don&apos;t share it. <button type="button" onClick={resetLink} disabled={loading} className="underline decoration-dotted underline-offset-2 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">Reset link</button></p>
              </section>

              <section aria-labelledby="add-calendar-app" className="space-y-2">
                <h3 id="add-calendar-app" className="flex items-center gap-2 font-bold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#d1850b] text-xs text-[#111827]">2</span>Add it to your calendar app</h3>
                <div className="ml-8">
                  <div role="tablist" aria-label="Calendar app" className="flex flex-wrap gap-1.5">
                    {(Object.keys(instructions) as CalendarApp[]).map(key => (
                      <button key={key} type="button" role="tab" aria-selected={app === key} onClick={() => setApp(key)} className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${app === key ? "border-[#d1850b] bg-[#1d2b43] text-[#e6ebf2]" : "border-[#26354d] bg-[#0c1422] text-[#9aa9be] hover:border-[#8393ab] hover:text-[#e6ebf2]"}`}>
                        {instructions[key].label}
                      </button>
                    ))}
                  </div>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-[#c1ccda]">
                    {selectedInstructions.steps.map(step => <li key={step}>{step}</li>)}
                  </ol>
                  {selectedInstructions.note && <p className="mt-2 text-xs leading-4 text-[#9aa9be]">{selectedInstructions.note}</p>}
                </div>
              </section>

              <div className="rounded-md border border-[#26354d] bg-[#0c1422] px-3 py-2.5 text-xs leading-5 text-[#c1ccda]">
                <strong className="text-[#e6ebf2]">View only.</strong> Make all changes in Dialoggg. Google decides when to check for updates, so new changes can take several hours to appear.
              </div>
              {error && <p role="alert" className="text-xs font-semibold text-red-300">{error}</p>}
            </div>

            <footer className="flex justify-end border-t border-[#26354d] bg-[#0c1422] px-5 py-3">
              <button type="button" onClick={() => setOpen(false)} className="rounded-md bg-[#d1850b] px-5 py-2 font-bold text-[#111827] hover:bg-[#b87308]">Done</button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
