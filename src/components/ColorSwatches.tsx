"use client";

type ColorSwatchesProps = {
  label: string;
  colors: readonly string[];
  value: string;
  onChange: (color: string) => void;
};

export default function ColorSwatches({ label, colors, value, onChange }: ColorSwatchesProps) {
  return (
    <div role="group" aria-label={`${label} options`} className="flex flex-wrap items-center gap-3 py-1">
      {colors.map(color => {
        const selected = value.toLowerCase() === color.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            aria-label={`${label} ${color}`}
            aria-pressed={selected}
            title={`${label}: ${color}${selected ? " (selected)" : ""}`}
            onClick={() => onChange(color)}
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-white outline-none transition-transform hover:scale-110 focus-visible:ring-4 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            style={{
              backgroundColor: color,
              boxShadow: selected ? "0 0 0 2px #fff, 0 0 0 5px #0f172a" : "0 1px 3px rgb(15 23 42 / 35%)",
              transform: selected ? "scale(1.08)" : undefined,
            }}
          >
            {selected && (
              <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-slate-900 bg-white text-slate-950 shadow">
                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m3.5 8 3 3 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
