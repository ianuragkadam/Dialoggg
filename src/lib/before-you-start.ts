export const PRIMER_SUBJECT = "Before you start: 5 things that make Dialoggg click";

export const PRIMER_INTRO = "Welcome to Dialoggg. Before you set anything up, take two minutes for these five ideas. They'll save you a lot of head-scratching.";

export const PRIMER_IDEAS = [
  { title: "Everything starts with a project.", body: "A project is one job. Each one gets a Project Plan, a timeline of bars showing what happens and when." },
  { title: "Tasks are work. Events are everything else.", body: "Tasks live on a project's plan (pour footings, install fence). Events are one-off items like meetings or inspections, and they go on the Master Calendar." },
  { title: "Users are people who log in.", body: "Their role decides what they can see and change:", bullets: ["Owner runs the account and can change anything", "Admin can edit any project's schedule", "Employee can see the schedule but can't change it", "Client sees only their own projects"] },
  { title: "Resources are whoever, or whatever, does the work.", body: "That includes your team, subcontractors, suppliers, and equipment. Resources are what you assign to tasks. A resource doesn't need a login." },
  { title: "One person can be both, and that includes you.", body: "Being the Owner gives you control of the account. It doesn't put you on the schedule. If you'll ever be assigned to a task, add yourself as a Team resource too. Your login is your key to the office. Your resource is your name on the schedule board. Once you're a resource, your tasks can show up on your phone's calendar." },
] as const;

export const PRIMER_CONNECTION = "You build a project's plan, and Dialoggg fills in the calendars for you. Each project calendar, the Master Calendar of all jobs, and each person's schedule update from that plan.";
export const PRIMER_CLOSING = "That's it. You're ready to set up your first job.";

export function primerPlainText(helpUrl: string) {
  return [PRIMER_INTRO, ...PRIMER_IDEAS.map((idea, index) => `${index + 1}. ${idea.title} ${idea.body}${"bullets" in idea ? `\n${idea.bullets.map(bullet => `• ${bullet}`).join("\n")}` : ""}`), `How it all connects: ${PRIMER_CONNECTION}`, PRIMER_CLOSING, `Get started: ${helpUrl}`, "Scott Grote\nFounder, Dialoggg"].join("\n\n");
}
