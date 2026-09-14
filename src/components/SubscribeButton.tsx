"use client";

import { useState } from "react";

// Interim standards-based calendar feed. The approved Google Calendar API
// synchronization will be implemented as a separate integration module.
export default function SubscribeButton({
  feedUrlEndpoint, label = "📅 Calendar subscription", compact = false,
}: { feedUrlEndpoint: string; label?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  async function openPanel() {
    if (!url) {
      const j = await fetch(feedUrlEndpoint).then(r => r.json());
      setUrl(j.url || "");
    }
    setOpen(true);
  }

  function copy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <button
        onClick={openPanel}
        className={compact
          ? "text-xs text-blue-700 hover:underline font-semibold"
          : "text-sm bg-white border border-blue-600 text-blue-700 px-3 py-1.5 rounded font-semibold hover:bg-blue-50"}
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b bg-blue-800 text-white rounded-t-lg">
              <h3 className="font-semibold">Subscribe to this calendar</h3>
              <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <p>Copy this private link:</p>
              <div className="flex gap-2">
                <input readOnly value={url} className="flex-1 px-3 py-2 border rounded bg-gray-50 text-xs" />
                <button onClick={copy} className="bg-blue-700 text-white px-3 py-2 rounded font-semibold hover:bg-blue-800">
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <ol className="list-decimal ml-5 space-y-1 text-gray-700">
                <li>Open a calendar application that supports subscriptions by URL.</li>
                <li>On the left, next to <b>Other calendars</b>, click <b>+</b>, then <b>From URL</b>.</li>
                <li>Paste the link above and click <b>Add calendar</b>.</li>
                <li>Your tasks will appear in Google Calendar.</li>
              </ol>
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-amber-900 text-xs">
                <b>Good to know:</b> this is an interim, read-only calendar feed—not the final Google Calendar API synchronization.
                Editing remains in Dialoggg, and the calendar application controls how often it refreshes the feed.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
