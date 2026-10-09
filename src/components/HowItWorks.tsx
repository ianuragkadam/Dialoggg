"use client";

import { useId, useState } from "react";

export function HowItWorksHeader({ open, onToggle, controlsId }: { open: boolean; onToggle: () => void; controlsId: string }) {
  return <button type="button" aria-expanded={open} aria-controls={controlsId} onClick={onToggle} className="flex w-full items-center justify-end gap-3 bg-gradient-to-r from-blue-950 to-blue-800 px-4 py-2 text-right text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-inset"><span className="text-lg font-bold">How It Works</span><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10"><svg viewBox="0 0 24 24" className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" /></svg></span></button>;
}

export function HowItWorksPanel({ id, items }: { id: string; items: readonly string[] }) {
  return <div id={id} className="p-4"><div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50 text-amber-950"><h3 className="border-b border-amber-200 px-4 py-3 text-sm font-bold">How it works</h3><ul className="list-disc space-y-2 px-4 py-4 pl-9 text-sm leading-6">{items.map(item => <li key={item}>{item}</li>)}</ul></div></div>;
}

export default function HowItWorks({ items }: { items: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  return <section className="overflow-hidden rounded-xl border border-blue-200 bg-white shadow-sm" aria-label="How It Works"><HowItWorksHeader open={open} onToggle={() => setOpen(value => !value)} controlsId={contentId} />{open && <HowItWorksPanel id={contentId} items={items} />}</section>;
}
