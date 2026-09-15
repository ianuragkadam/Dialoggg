import Link from "next/link";

export default function ModuleRestricted({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl">🔒</div>
      <h1 className="mt-4 text-2xl font-bold text-slate-950">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description} No settings or Project data have been changed.</p>
      <Link href="/projects" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">Back to All Projects</Link>
    </div>
  );
}
