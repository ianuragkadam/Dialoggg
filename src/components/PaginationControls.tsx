"use client";

export const DIRECTORY_PAGE_SIZE = 12;

export function pageCount(totalItems: number, pageSize = DIRECTORY_PAGE_SIZE) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function pageItems<T>(items: T[], page: number, pageSize = DIRECTORY_PAGE_SIZE) {
  const safePage = Math.min(Math.max(page, 1), pageCount(items.length, pageSize));
  return items.slice((safePage - 1) * pageSize, safePage * pageSize);
}

export default function PaginationControls({ page, totalItems, onPageChange, pageSize = DIRECTORY_PAGE_SIZE, label = "items" }: {
  page: number;
  totalItems: number;
  onPageChange(page: number): void;
  pageSize?: number;
  label?: string;
}) {
  const pages = pageCount(totalItems, pageSize);
  if (totalItems <= pageSize) return null;
  const safePage = Math.min(Math.max(page, 1), pages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalItems);
  return <nav aria-label={`${label} pagination`} className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
    <p className="text-slate-600">Showing <strong>{start}–{end}</strong> of <strong>{totalItems}</strong> {label}</p>
    <div className="flex items-center gap-2">
      <button type="button" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
      <span aria-current="page" className="px-2 font-semibold text-slate-700">Page {safePage} of {pages}</span>
      <button type="button" disabled={safePage >= pages} onClick={() => onPageChange(safePage + 1)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
    </div>
  </nav>;
}
