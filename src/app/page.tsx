import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getCurrentUser } from "@/lib/auth";
import dialogggLogo from "../../Dialoggg-Google-logo.png";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect(user.user_type === "super_admin" ? "/platform/companies" : "/projects");

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-3 text-2xl font-bold tracking-tight text-blue-700"><Image src={dialogggLogo} alt="Dialoggg logo" width={42} height={42} priority className="rounded-lg" />Dialoggg</Link>
        <Link href="/login" className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">Sign in</Link>
      </header>
      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <p className="mb-4 font-semibold uppercase tracking-[0.2em] text-blue-700">Project operations, simplified</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">Plan work. Coordinate teams. Deliver with confidence.</h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600">Dialoggg is a project scheduling and operations platform for contractors and service businesses. Teams can manage projects, tasks, people, resources, schedules, and connected calendars in one place.</p>
        <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-600">When you choose to connect Google Calendar, Dialoggg requests permission to manage calendar events so your project schedule can stay in sync. You can disconnect the integration at any time.</p>
        <div className="mt-10"><Link href="/login" className="rounded-lg bg-blue-700 px-6 py-3 font-semibold text-white hover:bg-blue-800">Access Dialoggg</Link></div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-20 md:grid-cols-3">
        {[["Projects", "Organize project details, milestones, and delivery work."], ["Schedules", "Plan work across teams, resources, and connected calendars."], ["Collaboration", "Give internal teams and clients the right access to information."]].map(([title, copy]) => <article key={title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-3 leading-7 text-slate-600">{copy}</p></article>)}
      </section>
      <footer className="border-t border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-3 px-6 py-6 text-sm text-slate-600"><span>© {new Date().getFullYear()} Dialoggg</span><Link href="/privacy-policy" className="hover:text-blue-700">Privacy Policy</Link><Link href="/terms-of-service" className="hover:text-blue-700">Terms of Service</Link><a href="mailto:scottgrote@me.com" className="hover:text-blue-700">Contact support</a></div></footer>
    </main>
  );
}
