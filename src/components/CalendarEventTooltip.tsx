"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export function CalendarTooltipProvider({ children }: { children: ReactNode }) {
  return <Tooltip.Provider delayDuration={300} skipDelayDuration={150}>{children}</Tooltip.Provider>;
}

export default function CalendarEventTooltip({ content, className, children }: { content: string; className?: string; children: ReactNode }) {
  return <Tooltip.Root>
    <Tooltip.Trigger asChild>
      <span tabIndex={0} className={className}>{children}</span>
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content side="top" sideOffset={7} collisionPadding={10} className="z-[120] max-w-[min(22rem,calc(100vw-1.25rem))] whitespace-pre-line break-words rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium leading-5 text-white shadow-xl outline-none data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in data-[state=delayed-open]:zoom-in-95">
        {content}
        <Tooltip.Arrow className="fill-slate-950" />
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>;
}
