"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "@/lib/client-fetch";
import { ADD_PROJECT_GUIDE, PROJECT_DIRECTORY_GUIDE, PROJECT_PLAN_HOW_IT_WORKS, RESOURCE_DIRECTORY_GUIDE, USERS_GUIDE } from "@/lib/how-it-works-guides";
import { PRIMER_INTRO, PRIMER_IDEAS, PRIMER_CONNECTION, PRIMER_CLOSING } from "@/lib/before-you-start";

type Role = "owner" | "admin" | "employee" | "external" | "platform_administrator";
type Step = { key: string; title: string; detail: string; href: string; auto?: boolean; minutes?: number; bullets?: string[] };
const ADMIN_REQUIRED: Step[] = [
  { key: "types", title: "Project Types", detail: "Add labels for the kinds of jobs you do, like Acrylic or Modular.", href: "/settings/project-types", auto: true, minutes: 2, bullets: ["Click + Add Project Type and type a unique name.", "Use Project Types to filter All Projects and the Master Calendar.", "You can rename a type later; projects using it update automatically."] },
  { key: "team", title: "Invite your team", detail: "Add the people who will log in. Mark schedulable teammates as Resources too.", href: "/users", auto: true, minutes: 4, bullets: ["On Users, click Invite User, enter their email, and choose a role.", "Owners and Admins manage schedules; Employees can view company work.", "Choose Also add as a Resource for teammates you will assign to Tasks."] },
  { key: "resources", title: "Add other resources", detail: "Add the equipment, subcontractors, and suppliers you schedule on jobs.", href: "/resources", auto: true, minutes: 2, bullets: ["Choose + Add Resource and select a category.", "Resources represent scheduling capacity; they do not log in.", "Categories help filter the Resource Calendar."] },
  { key: "project", title: "Add your first project", detail: "Start a real job you’re working on now.", href: "/projects/new", auto: true, minutes: 4, bullets: ["On All Projects, click + Add Project.", "Choose a Project Type and Calendar Color.", "Review the project details before saving."] },
  { key: "plan", title: "Build its plan", detail: "Add tasks, set dates, link dependencies, and assign who’s doing what.", href: "/projects", auto: true, minutes: 8, bullets: ["Click + Add Task for each step of the job.", "Drag task bars to change dates or duration.", "Link tasks and assign Resources from the Project Plan."] },
  { key: "calendars", title: "Look at your calendars", detail: "This is the payoff. Your job is already on every calendar.", href: "/calendar", minutes: 1, bullets: ["Master Calendar shows this job alongside other active jobs.", "Resource Calendar shows who and what is working each day.", "Changes in the Project Plan update both calendars automatically."] },
];
const ADMIN_EXTRA: Step[] = [
  { key: "logo", title: "Add your company logo", detail: "Personalize the workspace header.", href: "/account" },
  { key: "template", title: "Save a reusable Template", detail: "Turn a repeatable Project Plan into a starting point for future jobs.", href: "/templates", auto: true },
  { key: "client", title: "Invite a Client", detail: "Give a Client access to their assigned Project view.", href: "/users", auto: true },
  { key: "phone", title: "Put your calendar on your phone", detail: "Subscribe to a calendar feed from your account or a calendar page.", href: "/account" },
  { key: "microsoft", title: "Connect Microsoft Storage", detail: "Configure a company OneDrive or SharePoint connection.", href: "/settings/microsoft-storage", auto: true },
];
const EMPLOYEE_STEPS: Step[] = [
  { key: "my-projects", title: "Find your jobs", detail: "Open My Projects to see the jobs assigned to you.", href: "/projects/mine", minutes: 1, bullets: ["Choose Open to go into a project.", "All Projects shows the company list; My Projects keeps it to yours."] },
  { key: "employee-plan", title: "Read a Project Plan", detail: "Each bar is a Task. Its length shows how long it takes.", href: "/projects/mine", minutes: 2, bullets: ["Use the arrow to expand or collapse a Header Task.", "Resources shows assignments; Done shows progress.", "Employees can view work but cannot change it."] },
  { key: "employee-calendar", title: "See where you’re scheduled", detail: "Resource Calendar shows who is working where, day by day.", href: "/resources/schedule", minutes: 1, bullets: ["Switch between Timeline and Calendar views.", "Hover over an item to see its Task, Project, and dates."] },
  { key: "employee-phone", title: "Put your schedule on your phone", detail: "See your work next to everything else in your calendar app.", href: "/account", minutes: 1, bullets: ["Choose Calendar subscription and follow the steps.", "It is one-way; changes can take a few hours to appear."] },
];
const CLIENT_STEPS: Step[] = [
  { key: "client-project", title: "Open your project", detail: "Your project is the one you were invited to. Open it to see the details.", href: "/projects/mine", minutes: 1, bullets: ["You can view the project but cannot make changes."] },
  { key: "client-calendar", title: "Check the schedule", detail: "Project Calendar shows every Task on your job.", href: "/projects/mine", minutes: 1, bullets: ["Switch between month, week, and day views.", "Click a Task to see its details."] },
  { key: "client-phone", title: "Put it on your phone", detail: "Add your job’s schedule to the calendar app you already use.", href: "/account", minutes: 1, bullets: ["Choose Calendar subscription and follow the steps.", "New changes can take several hours to appear."] },
];

const FAQS = [
  ["How do I create a Project?", "Choose Projects, then Add Project. Enter a Project Name, Project Type, and Start Date. After saving, open Project Plan to add and schedule Tasks.", "/projects/new", ["owner", "admin"]],
  ["How do I add Tasks and durations?", "Open the Project Plan tab and choose Add Task. Give the Task a name, start date, and duration. You can edit the Task later; linked Tasks recalculate when their predecessor moves.", "/projects", ["owner", "admin"]],
  ["How do I assign a Resource?", "Add a Resource from the Resources page, then assign it to a Task in the Project Plan. A Resource can represent a person, supplier, crew, or equipment.", "/resources", ["owner", "admin"]],
  ["How do I invite an Employee or Client?", "Open Users and choose Invite User. Select the role and the Projects the person should access. A Client only sees the assigned external Project view.", "/users", ["owner", "admin"]],
  ["How do I see only jobs assigned to me?", "Choose My Projects in the navigation. It lists Projects assigned to your account.", "/projects/mine", ["owner", "admin", "employee", "external"]],
  ["How do I schedule a meeting or site visit?", "Open the relevant Project Calendar and add an Event. Events are shown on calendars alongside scheduled work.", "/calendar", ["owner", "admin", "employee"]],
  ["How do I find a scheduling conflict?", "Use Resource Calendar to review assignments across Projects and spot overlaps. Open an assignment to review its Project and timing.", "/resources/schedule", ["owner", "admin", "employee"]],
  ["How do I connect Microsoft folders?", "An Owner or Admin configures Microsoft Storage in Settings. To open Common and Private folders without Microsoft sign-in, the company Microsoft 365 admin must allow Anyone with the link sharing in SharePoint admin center → Policies → Sharing → OneDrive. Private folders remain visible only to Dialoggg Owners and Admins, but their links should be treated as confidential.", "/settings/microsoft-storage", ["owner", "admin"]],
  ["Can a Resource log in?", "A Resource record is scheduling capacity, not a login. If a person needs access, invite them as a User and optionally link their User account to a Resource.", "/resources", ["owner", "admin"]],
  ["How do I get a calendar on my phone?", "Open Account or a calendar page and use its subscription option. Your phone's calendar app may take a short time to refresh subscribed feeds.", "/account", ["owner", "admin", "employee", "external"]],
].map(([question, answer, href, roles]) => ({ question: question as string, answer: answer as string, href: href as string, roles: roles as string[] }));

const PAGE_GUIDES = [
  { title: "Projects", body: "Search, create, and open company Projects.", href: "/projects", items: PROJECT_DIRECTORY_GUIDE },
  { title: "Add Project", body: "Create a job and review its details before saving.", href: "/projects/new", items: ADD_PROJECT_GUIDE },
  { title: "Project Plan", body: "Manage Tasks and dependencies in the live Gantt schedule.", href: "/projects", items: PROJECT_PLAN_HOW_IT_WORKS },
  { title: "Project Calendar", body: "See one Project's scheduled Tasks and Events in a familiar calendar view. Use it to coordinate meetings and job dates.", href: "/calendar" },
  { title: "Resource Calendar", body: "See Resource assignments across Projects to understand availability and spot overlaps.", href: "/resources/schedule" },
  { title: "Master Calendar", body: "Review Tasks and Events across your company's Projects in one place.", href: "/calendar" },
  { title: "Resources", body: "Maintain the company's directory of people, crews, suppliers, and equipment.", href: "/resources", items: RESOURCE_DIRECTORY_GUIDE },
  { title: "Users", body: "Invite and manage company logins. Role and Project assignments control what each person can see and do.", href: "/users", items: USERS_GUIDE },
  { title: "Project Types", body: "Maintain the types used to classify Projects. Existing Project types remain attached to their records.", href: "/settings/project-types" },
  { title: "Project Templates", body: "Save and reuse a Task structure to speed up repeatable jobs. Applying a Template creates editable Tasks in a Project Plan.", href: "/templates" },
  { title: "Microsoft Storage", body: "Manage the company's OneDrive or SharePoint connection and Project folder links.", href: "/settings/microsoft-storage" },
];

const PERMISSIONS = [
  ["Add projects", "Yes", "Yes", "No", "No"],
  ["Change plans and schedules", "Yes", "Yes", "No", "No"],
  ["See every project and schedule", "Yes", "Yes", "Yes", "Only theirs"],
  ["Approve a double booking", "Yes", "Yes", "No", "No"],
  ["Invite Admins, Employees, and clients", "Yes", "Yes", "No", "No"],
  ["Invite Owners", "Yes", "No", "No", "No"],
  ["Add, rename, and delete Project Types", "Yes", "Yes", "No", "No"],
  ["Manage company logo and subscription", "Yes", "No", "No", "No"],
].map(([area, owner, admin, employee, client]) => ({ area, owner, admin, employee, client }));

const permissionTextColor = (value: string) => value === "Yes" ? "text-[#A9CF38]" : value === "Only theirs" ? "text-[#F59E0B]" : "text-[#929CCC]";

const GLOSSARY = [
  ["Projects", "Project Type", "Your own label for a kind of job, like Acrylic or Modular. Use it to filter lists and calendars."],
  ["Projects", "My Projects", "The page that lists only the jobs you’re assigned to. All Projects shows every job in the company."],
  ["Projects", "Assigned projects", "The jobs checked for a person under Project assignments on the Users page. They show on that person’s My Projects page, and they’re the jobs that person gets notifications for."],
  ["Projects", "Archived", "A finished job. It comes off your calendars but stays on record."],
  ["The Project Plan", "Gantt chart", "The bar chart in the Project Plan. Each row is a task, and each bar shows when it starts and how long it runs."],
  ["The Project Plan", "Task", "A piece of work on a job’s Project Plan, like Install Court Base. Task dates are changed only in the Project Plan."],
  ["The Project Plan", "Header", "A task with other tasks under it. Its bar stretches to cover everything inside it."],
  ["The Project Plan", "Task progress", "How far along a task is, tracked in the Done column of the Project Plan."],
  ["The Project Plan", "Template", "A saved task list you can reuse to build a new job’s plan in seconds."],
  ["The Project Plan", "Template library", "The Project Templates page. Every template your company has saved, in one place."],
  ["Linking tasks", "Finish to Start", "The next task starts when this one finishes. The most common link."],
  ["Linking tasks", "Start to Start", "Both tasks start together."],
  ["Linking tasks", "Finish to Finish", "Both tasks finish together."],
  ["Linking tasks", "Start to Finish", "The next task can’t finish until this one starts. Rarely needed."],
  ["People and resources", "User", "Someone who logs in to Dialoggg."],
  ["People and resources", "Resource", "Anything you schedule on a job: an employee, subcontractor, supplier, or piece of equipment. Resources don’t log in."],
  ["People and resources", "Resource categories", "The groups resources are sorted into: Team, Subcontractor, Supplier, Equipment, and Other. Use them to show or hide groups on the Resource Calendar."],
  ["People and resources", "Linked user", "A user who is also a resource, so the person who logs in is the same one scheduled on tasks. Linking doesn’t change what they can do or see."],
  ["Calendars and scheduling", "Event", "A meeting, site visit, or anything else that isn’t part of a job’s plan. Add events on the Master Calendar."],
  ["Calendars and scheduling", "Resource overlap", "When one resource is booked for two things at the same time, like a crew on two jobs the same day."],
  ["Calendars and scheduling", "Schedule conflict", "The warning you get when a change would create a resource overlap. An Owner or Admin has to approve it. The Schedule conflicts box on Resources counts them."],
  ["Calendars and scheduling", "Calendar subscription", "A private link that puts your Dialoggg schedule in Google, Apple, or Outlook calendar. It’s one-way, and new changes can take several hours to show up."],
].map(([group, term, definition]) => ({ group, term, definition }));

const SECTIONS = [["start", "Get Started", "oec"], ["answers", "How do I…?", "oec"], ["guides", "Page guides", "oec"], ["roles", "Roles and permissions", "o"], ["words", "Words we use", "oe"], ["support", "Contact support", "oec"]];

export default function HelpCenter({ role, userId }: { role: Role; userId: number | null }) {
  const admin = role === "owner" || role === "admin";
  const employee = role === "employee";
  const [ownerScheduleAnswer, setOwnerScheduleAnswer] = useState<string | null>(null);
  const ownerResourceStep: Step = { key: "owner-resource", title: "Add yourself to the schedule", detail: "Create and link your Team resource if you will be assigned to Tasks.", href: "/resources", minutes: 2, bullets: ["Choose + Add Resource and select Team.", "Link the Resource to your Owner login.", "Your login role remains Owner."] };
  const currentSteps = admin ? role === "owner" && ownerScheduleAnswer === "not_now" ? [ownerResourceStep, ...ADMIN_REQUIRED] : ADMIN_REQUIRED : employee ? EMPLOYEE_STEPS : role === "platform_administrator" ? [] : CLIENT_STEPS;
  const [section, setSection] = useState("start");
  const [primerExpanded, setPrimerExpanded] = useState(true);
  const [search, setSearch] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const [automatic, setAutomatic] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [openStep, setOpenStep] = useState(currentSteps[0]?.key ?? "");
  const [openGuide, setOpenGuide] = useState("Project Plan");
  const [support, setSupport] = useState({ name: "", email: "", company: "", page: "", message: "" });
  const [sent, setSent] = useState(false);
  useEffect(() => {
    if (role !== "owner" || userId === null) return;
    try {
      const saved = window.localStorage.getItem(`dialoggg:help-primer-expanded:v1:${userId}`);
      if (saved !== null) setPrimerExpanded(saved === "true");
    } catch {
      // Keep the default expanded state when browser storage is unavailable.
    }
  }, [role, userId]);
  const togglePrimer = () => {
    const next = !primerExpanded;
    setPrimerExpanded(next);
    if (userId === null) return;
    try {
      window.localStorage.setItem(`dialoggg:help-primer-expanded:v1:${userId}`, String(next));
    } catch {
      // The panel remains usable even when browser storage is unavailable.
    }
  };
  useEffect(() => {
    let active = true;
    void fetch("/api/v1/help/checklist", { cache: "no-store" }).then(response => response.json()).then(payload => {
      if (!active) return;
      setDone(payload?.data?.completions ?? []);
      setOwnerScheduleAnswer(payload?.data?.ownerScheduleAnswer ?? null);
      const detected = payload?.data?.automatic ?? {};
      setAutomatic(detected);
      const checklistSteps = admin ? [...(role === "owner" && payload?.data?.ownerScheduleAnswer === "not_now" ? [ownerResourceStep, ...ADMIN_REQUIRED] : ADMIN_REQUIRED), ...ADMIN_EXTRA] : currentSteps;
      const firstTodo = checklistSteps.find(step => !(payload?.data?.completions ?? []).includes(step.key) && !detected[step.key]);
      setOpenStep(firstTodo?.key ?? "");
      for (const stepKey of Object.keys(detected)) {
        if (detected[stepKey]) void authenticatedFetch("/api/v1/help/checklist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stepKey, completed: true }) });
      }
    }).catch(() => {}).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);
  const visibleFaqs = useMemo(() => FAQS.filter(item => item.roles.includes(role) && `${item.question} ${item.answer}`.toLowerCase().includes(search.trim().toLowerCase())), [role, search]);
  const visibleGuides = useMemo(() => {
    const allowed = role === "external" ? ["Project Calendar"] : role === "employee" ? ["Project Plan", "Project Calendar", "Resource Calendar", "Master Calendar", "My Projects"] : null;
    return PAGE_GUIDES.filter(item => (!allowed || allowed.includes(item.title)) && `${item.title} ${item.body}`.toLowerCase().includes(search.trim().toLowerCase()));
  }, [role, search]);
  const progressSteps = currentSteps;
  const isDone = (key: string) => done.includes(key) || Boolean(automatic[key]);
  const completedCount = progressSteps.filter(step => isDone(step.key)).length;
  const minutesLeft = progressSteps.filter(step => !isDone(step.key)).reduce((total, step) => total + (step.minutes ?? 0), 0);
  const nextStep = currentSteps.find(step => !isDone(step.key)) ?? (admin ? ADMIN_EXTRA.find(step => !isDone(step.key)) : undefined);
  async function toggleStep(step: Step, checked: boolean, personal = false) {
    const prev = done;
    setDone(value => checked ? [...new Set([...value, step.key])] : value.filter(key => key !== step.key));
    const response = await authenticatedFetch("/api/v1/help/checklist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stepKey: step.key, completed: checked }) });
    if (!response.ok) { setDone(prev); setNotice("Could not save progress. Please try again."); return; }
    if (checked) {
      const checklistSteps = admin ? [...currentSteps, ...ADMIN_EXTRA] : currentSteps;
      const updatedDone = new Set([...done, step.key]);
      const currentIndex = checklistSteps.findIndex(item => item.key === step.key);
      const next = checklistSteps.slice(currentIndex + 1).find(item => !updatedDone.has(item.key) && !automatic[item.key])
        ?? checklistSteps.find(item => !updatedDone.has(item.key) && !automatic[item.key]);
      setOpenStep(next?.key ?? "");
    } else setOpenStep(step.key);
    setNotice(`${step.title} marked ${checked ? "complete" : "not complete"}${personal ? " for you" : " for your company"}.`);
    window.setTimeout(() => setNotice(""), 3500);
  }
  const filtered = search.trim().length > 0;
  const visibleSections = SECTIONS.filter(([id, , roles]) => roles.includes(role === "external" ? "c" : role === "employee" ? "e" : "o") && (id !== "roles" || admin));
  const selectedGuide = visibleGuides.find(guide => guide.title === openGuide) ?? visibleGuides[0];

  return <div className="help-center mx-auto max-w-7xl space-y-5 pb-12 text-slate-100" data-section={section}>
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-700 bg-[#14243a] px-4 py-3">
      <label className="flex min-w-[240px] flex-1 items-center gap-3 rounded-lg border border-slate-600 bg-slate-950/45 px-3"><span aria-hidden="true" className="text-slate-400">⌕</span><span className="sr-only">Search help</span><input type="search" value={search} onChange={event => { setSearch(event.target.value); setSection("answers"); }} placeholder="Search in plain words, like “double booked” or “invite”" className="min-h-10 w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-400" /></label>
      <p className="ml-auto text-sm text-slate-400">Signed in as <span className="ml-2 rounded-full border border-slate-600 px-3 py-1 font-medium text-white">{role === "external" ? "Client" : role === "platform_administrator" ? "Platform Admin" : role === "employee" ? "Employee" : role === "owner" ? "Owner" : "Admin"}</span></p>
    </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Help topics" className="h-fit rounded-xl border border-slate-700 bg-[#14243a] p-3 lg:sticky lg:top-4"><p className="px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-slate-400">Help topics</p>{visibleSections.map(([id, label]) => <button key={id} type="button" aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)} className={`flex min-h-10 w-full items-center rounded-lg px-3 text-left text-sm font-medium ${section === id ? "bg-lime-300/15 text-lime-200" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}><span className="mr-3 font-mono text-xs text-amber-400">{String(visibleSections.findIndex(item => item[0] === id) + 1).padStart(2, "0")}</span>{id === "start" && role === "owner" && completedCount === progressSteps.length ? "Setup guide" : label}</button>)}</nav>
      <div className="min-w-0 space-y-8">
        {notice && <div role="status" className="rounded-lg border border-lime-500/40 bg-lime-300/10 px-4 py-3 text-sm text-lime-100">{notice}</div>}

        {section === "start" && <section id="start" className="rounded-xl border border-slate-700 bg-[#14243a] p-5 sm:p-7">
          {role === "owner" && <div className="mb-6 rounded-xl border border-lime-300/40 bg-slate-950/35 p-5" aria-label="Before You Start"><button type="button" onClick={togglePrimer} aria-expanded={primerExpanded} aria-controls="before-you-start-content" className="flex min-h-9 w-full items-center justify-between gap-3 text-left"><span className="text-xl font-bold text-lime-200">Before You Start</span><svg aria-hidden="true" className={`h-5 w-5 shrink-0 text-lime-200 transition-transform ${primerExpanded ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="none"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>{primerExpanded && <div id="before-you-start-content"><p className="mt-2 text-sm leading-6 text-slate-200">{PRIMER_INTRO}</p><ol className="ml-5 mt-4 list-decimal space-y-3">{PRIMER_IDEAS.map(idea => <li key={idea.title} className="pl-1 text-sm leading-6 text-slate-200"><strong className="text-white">{idea.title}</strong> {idea.body}{"bullets" in idea && <ul className="ml-5 mt-1 list-disc">{idea.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}</ul>}</li>)}</ol><p className="mt-4 text-sm leading-6 text-slate-200"><strong className="text-white">How it all connects:</strong> {PRIMER_CONNECTION}</p><p className="mt-2 text-sm text-slate-200">{PRIMER_CLOSING}</p><a href="#get-started-checklist" className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-lime-400 px-4 font-bold text-slate-950">Get started</a><p className="mt-4 text-xs text-slate-400">Scott Grote · Founder, Dialoggg</p></div>}</div>}
          <SectionHeading eyebrow={role === "platform_administrator" ? "Platform guide" : admin ? "Start here" : employee ? "Start here" : "Welcome"} title={admin ? completedCount === progressSteps.length ? "Your first job is on the calendar" : "20 minutes to your first job" : employee ? "5 minutes to find your way around" : role === "platform_administrator" ? "Help for platform administration" : "3 minutes to see your job"} description={admin ? completedCount === progressSteps.length ? "This checklist now lives under Setup guide in the menu. Pick up the Level up steps whenever you’re ready." : "Six steps, in order. Each one takes you to the right page, and Dialoggg remembers where you left off." : employee ? "Four quick stops so you know where your work is and how to read the schedule." : role === "platform_administrator" ? "Browse the page guides and contact support for company-level workflows." : "You can see your project’s schedule any time. You can’t change anything, so click around freely."} />
          {progressSteps.length > 0 && <div id="get-started-checklist" className="mt-5 rounded-lg border border-slate-700 bg-slate-950/35 p-4"><div className="flex justify-between gap-3 text-sm"><strong>{completedCount} of {progressSteps.length} done</strong><span className="font-mono text-xs text-slate-400">{loading ? "Checking…" : minutesLeft ? `About ${minutesLeft} min left` : "All done"}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-700"><div className="h-full rounded-full bg-lime-400 transition-all" style={{ width: `${completedCount / progressSteps.length * 100}%` }} /></div></div>}
          {currentSteps.length > 0 && <div className="mt-5"><div className="mb-3 flex items-baseline justify-between gap-3 px-1"><h3 className="text-lg font-semibold">{admin ? "Get running" : "Your quick tour"}</h3><span className="font-mono text-xs text-amber-300">{admin ? "about 20 min" : employee ? "about 5 min" : "about 3 min"}</span></div><ol className="space-y-2">{currentSteps.map((step, index) => <ChecklistStep key={step.key} step={step} index={index + 1} done={isDone(step.key)} auto={step.auto} locked={Boolean(automatic[step.key])} open={openStep === step.key} isNext={nextStep?.key === step.key} onExpand={() => setOpenStep(openStep === step.key ? "" : step.key)} onToggle={checked => void toggleStep(step, checked)} />)}</ol></div>}
          {admin && <details className="mt-4 rounded-lg border border-slate-700 bg-slate-950/25"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-200">Level up <span className="ml-2 text-xs font-normal text-slate-400">whenever you’re ready</span></summary><ol className="space-y-2 border-t border-slate-700 p-3">{ADMIN_EXTRA.map((step, index) => <ChecklistStep key={step.key} step={step} index={index + 7} done={isDone(step.key)} auto={step.auto} locked={Boolean(automatic[step.key])} open={openStep === step.key} isNext={nextStep?.key === step.key} onExpand={() => setOpenStep(openStep === step.key ? "" : step.key)} onToggle={checked => void toggleStep(step, checked, true)} />)}</ol></details>}
          {admin && <div className="mt-5 rounded-lg border border-amber-300/20 bg-amber-300/5 p-4"><p className="text-sm font-bold text-amber-100">What’s required to get started?</p><p className="mt-1 text-sm leading-6 text-slate-300">Create a Project Type, add at least one Resource, create a Project, then add Tasks to its Project Plan. Invite your team and add an Event when they’re ready.</p></div>}
        </section>}

        {section === "answers" && <section id="answers" className="rounded-xl border border-slate-700 bg-[#14243a] p-5 sm:p-7"><SectionHeading eyebrow="Quick answers" title="How do I…?" description="Short answers to the things people actually ask. Each one takes you straight to the page." />{visibleFaqs.length ? <div className="mt-5 grid gap-3 md:grid-cols-2">{visibleFaqs.map(item => <article key={item.question} className="rounded-lg border border-slate-700 bg-slate-950/25 p-4"><h3 className="font-semibold text-white">{item.question}</h3><p className="mt-2 text-sm leading-6 text-slate-300">{item.answer}</p><Link href={item.href} className="mt-3 inline-flex min-h-9 items-center text-sm font-bold text-lime-300 hover:text-lime-200">Take me there <span aria-hidden="true" className="ml-2">→</span></Link></article>)}</div> : <p className="mt-5 rounded-lg border border-slate-700 p-5 text-sm text-slate-300">No answers match “{search}”. Try a plainer word, like invite or move, or go to Contact support.</p>}</section>}

        {section === "guides" && <section id="guides" className="rounded-xl border border-slate-700 bg-[#14243a] p-5 sm:p-7"><SectionHeading eyebrow="Learn while doing" title="Page guides" description="The same “How It Works” notes you see on each page, all in one place." /><div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Pages">{visibleGuides.map(guide => <button key={guide.title} type="button" role="tab" aria-selected={selectedGuide?.title === guide.title} onClick={() => setOpenGuide(guide.title)} className={`min-h-10 rounded-lg border px-4 text-sm font-medium ${selectedGuide?.title === guide.title ? "border-lime-300 bg-lime-300 text-slate-950" : "border-slate-600 text-white hover:bg-white/5"}`}>{guide.title}</button>)}</div>{selectedGuide ? <div key={selectedGuide.title} role="tabpanel" className="mt-4 rounded-lg border border-slate-700 bg-slate-950/25 p-5"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">How It Works</h3><span className="text-sm text-slate-400">{selectedGuide.title}</span></div><p className="mt-2 text-sm leading-6 text-slate-300">{selectedGuide.body}</p>{selectedGuide.items && <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">{selectedGuide.items.map(item => <li key={item}>{item}</li>)}</ul>}<Link href={selectedGuide.href} className="mt-4 inline-flex min-h-10 items-center rounded-md bg-lime-400 px-4 text-sm font-bold text-slate-950 hover:bg-lime-300">Open {selectedGuide.title} <span aria-hidden="true" className="ml-2">→</span></Link></div> : <p className="mt-4 text-sm text-slate-300">No page guides match that search.</p>}</section>}

        {section === "roles" && admin && <section id="roles" className="rounded-xl border border-slate-700 bg-[#14243a] p-5 sm:p-7"><SectionHeading eyebrow="Access at a glance" title="Roles and permissions" description="Everyone in Dialoggg has one of four roles. Owners and Admins set it when they invite someone." /><div className="mt-5 overflow-x-auto rounded-lg border border-slate-700"><table className="w-full min-w-[640px] border-collapse text-left text-sm"><thead className="bg-slate-950/50 text-xs uppercase tracking-wide"><tr>{["What they can do", "Owner", "Admin", "Employee", "External / Client"].map((value, index) => <th key={value} className={`px-4 py-3 ${index === 0 ? "text-[#AEB9DC]" : "text-white"}`}>{value}</th>)}</tr></thead><tbody>{PERMISSIONS.map(row => <tr key={row.area} className="border-t border-slate-700"><th scope="row" className="px-4 py-3 font-semibold text-white">{row.area}</th>{(["owner", "admin", "employee", "client"] as const).map(roleName => <td key={roleName} className={`px-4 py-3 text-center font-semibold ${permissionTextColor(row[roleName])}`}>{row[roleName]}</td>)}</tr>)}</tbody></table></div></section>}

        {section === "words" && <section id="words" className="rounded-xl border border-slate-700 bg-[#14243a] p-5 sm:p-7"><SectionHeading eyebrow="Shared language" title="Words we use" description="A few words mean something specific in Dialoggg." /><div className="mt-5 space-y-3">{["Projects", "The Project Plan", "Linking tasks", "People and resources", "Calendars and scheduling"].map((group, index) => <details key={group} open={index === 0} className="rounded-lg border border-slate-700 bg-slate-950/25"><summary className="cursor-pointer px-4 py-3 font-semibold text-white">{group}</summary><dl className="grid gap-x-6 gap-y-4 border-t border-slate-700 p-4 sm:grid-cols-2">{GLOSSARY.filter(item => item.group === group).map(item => <div key={item.term}><dt className="text-sm font-bold text-white">{item.term}</dt><dd className="mt-1 text-sm leading-5 text-slate-300">{item.definition}</dd></div>)}</dl></details>)}</div></section>}

        <section id="support" className="scroll-mt-5 rounded-xl border border-lime-300/25 bg-gradient-to-br from-[#172b3c] to-[#14243a] p-5 sm:p-7"><SectionHeading eyebrow="A person can help" title="Contact support" description="Tell us what you were trying to do and where you got stuck. We aim to respond within 24 hours." /><form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const body = [`Name: ${support.name}`, `Email: ${support.email}`, `Company: ${support.company}`, `Page: ${support.page}`, "", support.message].join("\n"); window.location.href = `mailto:help@dialoggg.com?subject=${encodeURIComponent("Dialoggg support request")}&body=${encodeURIComponent(body)}`; setSent(true); }}><label className="text-sm font-semibold text-slate-200">Your name<input required value={support.name} onChange={event => setSupport({ ...support, name: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950/40 px-3 text-white" /></label><label className="text-sm font-semibold text-slate-200">Email<input required type="email" value={support.email} onChange={event => setSupport({ ...support, email: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950/40 px-3 text-white" /></label><label className="text-sm font-semibold text-slate-200">Company (optional)<input value={support.company} onChange={event => setSupport({ ...support, company: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950/40 px-3 text-white" /></label><label className="text-sm font-semibold text-slate-200">Which page are you on?<input value={support.page} onChange={event => setSupport({ ...support, page: event.target.value })} placeholder="Example: Project Plan" className="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950/40 px-3 text-white placeholder:text-slate-500" /></label><label className="text-sm font-semibold text-slate-200 sm:col-span-2">What can we help with?<textarea required rows={4} value={support.message} onChange={event => setSupport({ ...support, message: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950/40 p-3 text-white" /></label><div className="flex flex-wrap items-center gap-3 sm:col-span-2"><button className="min-h-11 rounded-lg bg-lime-400 px-5 font-bold text-slate-950 hover:bg-lime-300">Email support</button><span className="text-sm text-slate-400">Or write to <a className="font-semibold text-lime-200 underline" href="mailto:help@dialoggg.com">help@dialoggg.com</a></span>{sent && <span role="status" className="text-sm text-lime-200">Your email app should open with the request ready to send.</span>}</div></form></section>
      </div>
    </div>
  </div>;
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header><p className="font-mono text-[11px] uppercase tracking-[.2em] text-amber-300">{eyebrow}</p><h2 className="mt-2 text-2xl font-bold tracking-tight text-white">{title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{description}</p></header>;
}

function ChecklistStep({ step, index, done, auto, locked, open, isNext, onExpand, onToggle }: { step: Step; index: number; done: boolean; auto?: boolean; locked?: boolean; open: boolean; isNext: boolean; onExpand: () => void; onToggle: (checked: boolean) => void }) {
  return <li className={`rounded-lg border p-3 sm:p-4 ${open ? "border-lime-400/60 bg-slate-950/20" : done ? "border-lime-400/30 bg-lime-300/5" : "border-slate-700 bg-slate-950/20"}`}>
    <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
      <div className="flex items-center gap-3 sm:pt-1">
        <input type="checkbox" checked={done} disabled={locked} title={locked && auto ? "Automatically checked from company data" : undefined} onChange={event => onToggle(event.target.checked)} aria-label={`Mark ${step.title} ${done ? "incomplete" : "complete"}`} className="h-5 w-5 accent-lime-400 disabled:cursor-not-allowed disabled:opacity-70" />
        <span className={`font-mono text-xs ${done ? "text-lime-200" : "text-amber-300"}`}>{String(index).padStart(2, "0")}</span>
      </div>
      <div className="min-w-0">
        <button type="button" onClick={onExpand} aria-expanded={open} className="flex min-h-8 flex-wrap items-center gap-2 text-left">
          <span className={`font-semibold ${done ? "text-lime-100" : "text-white"}`}>{step.title}</span>
          {step.minutes && <span className="rounded-full border border-amber-400/40 px-2 py-0.5 font-mono text-[10px] text-amber-200">{step.minutes} min</span>}
          {isNext && <span className="rounded bg-lime-300 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-slate-950">Up next</span>}
          <span className="ml-auto text-lg leading-none text-amber-300" aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
        <p className="mt-1 text-sm leading-5 text-slate-300">{step.detail}</p>
        {open && step.bullets && <ul className="mt-3 list-disc space-y-2 rounded-lg border border-slate-700 bg-slate-950/50 px-4 py-3 pl-8 text-sm leading-5 text-slate-200">{step.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}</ul>}
      </div>
      <Link href={step.href} className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-600 px-3 text-sm font-bold text-lime-200 hover:border-lime-300 hover:bg-lime-300/5">Take me there <span className="ml-2" aria-hidden="true">→</span></Link>
    </div>
  </li>;
}
