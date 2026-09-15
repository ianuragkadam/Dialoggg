export const REQUIREMENTS_FORM_KEY = "dialoggg-reboot-v1";

export type RequirementOption = {
  id: string;
  label: string;
  detail: string;
  recommended?: boolean;
};

export type RequirementQuestion = {
  id: string;
  number: number;
  prompt: string;
  context: string;
  example?: string;
  options: RequirementOption[];
};

export type RequirementSection = {
  id: string;
  title: string;
  intro: string;
  questions: RequirementQuestion[];
};

const option = (id: string, label: string, detail: string, recommended = false): RequirementOption => ({
  id,
  label,
  detail,
  recommended,
});

export const REQUIREMENTS_SECTIONS: RequirementSection[] = [
  {
    id: "ownership",
    title: "Ownership and companies",
    intro: "First, let us make the account structure and company controls unambiguous.",
    questions: [
      {
        id: "q01",
        number: 1,
        prompt: "How should Scott's platform access differ from a company Owner?",
        context: "A platform administrator may create companies, while a company Owner should normally remain inside one company.",
        options: [
          option("separate", "Separate Platform Administrator", "Scott manages companies through a platform role; each company has its own Owner accounts.", true),
          option("combined", "One combined Owner role", "The same Owner role can manage companies and company data."),
          option("developer", "No platform role", "Company creation remains a developer-managed task."),
        ],
      },
      {
        id: "q02",
        number: 2,
        prompt: "Who should be allowed to create a new company?",
        context: "The current public registration page allows any visitor to create one.",
        options: [
          option("platform_only", "Platform Administrator only", "Scott provisions every company from a private administration screen.", true),
          option("approved_request", "Approved request", "A visitor requests access and Scott approves the company."),
          option("public", "Public self-registration", "Any visitor can immediately create a company."),
        ],
      },
      {
        id: "q03",
        number: 3,
        prompt: "Can one email address participate in more than one company?",
        context: "This affects clients and subcontractors who may work with multiple Dialoggg companies.",
        options: [
          option("membership", "Yes, one login with a company switcher", "A global identity can hold memberships in multiple companies.", true),
          option("separate", "Yes, separate account per company", "The same email may be reused, but each company account is independent."),
          option("single", "No, one company per email", "Every email address is globally limited to one company."),
        ],
      },
      {
        id: "q04",
        number: 4,
        prompt: "Who can create or remove company Owners?",
        context: "The specification allows more than one Owner but does not define the management rule.",
        options: [
          option("platform", "Platform Administrator; protect the last Owner", "Scott can promote or deactivate Owners, and the last active Owner cannot be removed.", true),
          option("owners", "Any Owner; protect the last Owner", "Owners manage other Owners within their company."),
          option("fixed", "One permanent Owner", "The first Owner cannot be changed through the application."),
        ],
      },
      {
        id: "q05",
        number: 5,
        prompt: "Who may create or promote another Admin?",
        context: "Admins can manage users, but only Owners may remove other Admins.",
        options: [
          option("owner", "Owner only", "Admins may manage Employees and External users, while Owners control Admin access.", true),
          option("admin", "Owner or Admin", "Admins can create or promote peers but still cannot remove them."),
          option("platform", "Platform Administrator only", "All Admin promotions require Scott's platform account."),
        ],
      },
    ],
  },
  {
    id: "access",
    title: "Users and access",
    intro: "These choices define what people can see and how they receive access.",
    questions: [
      {
        id: "q06",
        number: 6,
        prompt: "What should assigning an Internal User to a Project control?",
        context: "Employees can already view every company Project, so assignment needs a separate purpose.",
        options: [
          option("team", "Team membership and connected access", "Assignment marks the Project team and controls Common-folder eligibility and relevant notifications.", true),
          option("information", "Informational label only", "Assignment simply shows who is associated with the Project."),
          option("visibility", "Project visibility", "Employees would see only assigned Projects, which changes the current specification."),
        ],
      },
      {
        id: "q07",
        number: 7,
        prompt: "What should an External or Client user see inside an assigned Project?",
        context: "A client-facing view may need to hide internal scheduling and contact details.",
        options: [
          option("simple", "Simplified task list and Project Calendar", "Show progress and Common files, but hide lag, internal notes, other users, and private Resource details.", true),
          option("gantt", "Complete read-only Gantt", "Show tasks, dependencies, lag, progress, and assigned Resources."),
          option("configurable", "Configurable per client", "Owners choose individual fields for each External user."),
        ],
      },
      {
        id: "q33",
        number: 33,
        prompt: "How should a newly added User set their password?",
        context: "An invitation avoids having an administrator know the User's permanent password.",
        options: [
          option("invite", "Secure invitation link", "The User receives a time-limited link and creates their own password.", true),
          option("temporary", "Administrator sets a temporary password", "The User must change it after the first login."),
          option("permanent", "Administrator sets the password", "No forced password change is required."),
        ],
      },
      {
        id: "q34",
        number: 34,
        prompt: "How should invitation and password-reset email be delivered?",
        context: "A delivery service is required for secure invitation and reset links.",
        options: [
          option("team_service", "Development team selects a transactional email service", "Use a dependable provider and document ownership and cost.", true),
          option("microsoft", "Sport Court Microsoft 365 email", "Send through an approved Sport Court mailbox."),
          option("no_email", "No automated email", "An Owner handles password resets manually."),
        ],
      },
    ],
  },
  {
    id: "projects",
    title: "Projects and lifecycle",
    intro: "These answers determine how Projects begin, finish, and retain their history.",
    questions: [
      {
        id: "q08",
        number: 8,
        prompt: "How should Project Start and End Dates work?",
        context: "Templates need a Start Date, while the root Header Task can calculate the End Date.",
        options: [
          option("derived", "Require Start; calculate End from the Gantt", "The root Header Task always determines the Project End Date.", true),
          option("manual", "Enter both dates manually", "Project dates may differ from the Gantt schedule."),
          option("tasks_only", "Store no Project dates", "Only individual Task dates are stored."),
        ],
      },
      {
        id: "q09",
        number: 9,
        prompt: "What should happen when a Project is marked Completed?",
        context: "Completed work should retain history without cluttering current schedules.",
        options: [
          option("readonly_reopen", "Read-only by default, with Reopen", "Hide it from current calendars but retain historical access and allow an Owner/Admin to reopen it.", true),
          option("editable", "Remain fully editable", "Completion changes filtering only."),
          option("locked", "Permanently locked", "A Completed Project cannot be reopened or edited."),
        ],
      },
      {
        id: "q10",
        number: 10,
        prompt: "How should Project removal work?",
        context: "A Project is connected to Tasks, Events, assignments, Google events, and OneDrive folders.",
        options: [
          option("archive_delete", "Archive first; Owner may permanently delete", "Archive is the normal action, with permanent deletion restricted and confirmed.", true),
          option("delete", "Permanent deletion only", "Deleting immediately removes Dialoggg records."),
          option("archive", "Archive only", "Projects are never permanently deleted through the application."),
        ],
      },
      {
        id: "q35",
        number: 35,
        prompt: "What should happen when a Project Type is still in use?",
        context: "Every Project must always have exactly one Project Type.",
        options: [
          option("block", "Block deletion until Projects are reassigned", "The Owner chooses another type for affected Projects first.", true),
          option("replacement", "Require a replacement during deletion", "The deletion dialog moves all affected Projects in one step."),
          option("unassigned", "Allow Projects to become unassigned", "This conflicts with the one-type requirement."),
        ],
      },
      {
        id: "q44",
        number: 44,
        prompt: "Should historical calendar views include Completed Projects?",
        context: "Managers may need to look back without seeing completed work in today's schedule.",
        options: [
          option("historical", "Yes, on historical dates or when enabled", "Hide Completed Projects by default but allow them in history/filter controls.", true),
          option("always", "Yes, always", "Completed work remains on all calendar views."),
          option("never", "No", "Completed Project entries disappear from calendars entirely."),
        ],
      },
      {
        id: "q55",
        number: 55,
        prompt: "Is there existing data that must be brought into the rebuilt application?",
        context: "This includes Users, Resources, Projects, schedules, or spreadsheets—not deployment planning.",
        options: [
          option("fresh", "Start fresh with manual entry", "No custom import tool is included.", true),
          option("spreadsheet", "Import supplied spreadsheets", "The team creates a one-time structured import."),
          option("legacy", "Migrate legacy application data", "The team first assesses the available legacy data."),
        ],
      },
    ],
  },
  {
    id: "gantt",
    title: "Gantt scheduling rules",
    intro: "Concrete examples here will make the core scheduling engine predictable.",
    questions: [
      {
        id: "q11",
        number: 11,
        prompt: "How should a one-day Task be counted?",
        context: "For example, a Task starts Monday and has Duration 1 day.",
        options: [
          option("inclusive", "It occupies Monday only", "The displayed end is Monday; calendar APIs may internally use Tuesday as an exclusive boundary.", true),
          option("next_day", "It ends Tuesday", "Duration is treated as 24 elapsed hours with Tuesday shown as the end."),
          option("end_entry", "Always enter both Start and End", "Duration is calculated from two manually chosen dates."),
        ],
      },
      {
        id: "q12",
        number: 12,
        prompt: "How should dependency lag interact with weekends?",
        context: "A linked start may land on a day the dependent Task does not work.",
        options: [
          option("working", "Count the dependent Task's working days", "Skip its excluded weekend days and move the start to the next permitted workday.", true),
          option("calendar_adjust", "Count calendar days, then adjust the landing day", "Lag includes weekends, but a non-working start moves forward."),
          option("calendar", "Always count calendar days", "The start may land on a non-working weekend day."),
        ],
      },
      {
        id: "q13",
        number: 13,
        prompt: "Should a dependency allow negative lag?",
        context: "Negative lag overlaps Tasks before the linked Start or End point.",
        options: [
          option("no", "No—zero or positive only", "Matches the examples in the Product Spec and keeps scheduling easier to understand.", true),
          option("yes", "Yes", "Allow Tasks to overlap their dependency by a chosen number of days."),
          option("admin", "Admins only", "Negative lag is available as an advanced scheduling option."),
        ],
      },
      {
        id: "q14",
        number: 14,
        prompt: "Which dependency types should be supported?",
        context: "The current prototype already supports the four standard Gantt dependency types.",
        options: [
          option("four", "All four standard types", "Finish-to-Start, Start-to-Start, Finish-to-Finish, and Start-to-Finish.", true),
          option("two", "Finish-to-Start and Start-to-Start", "Keep the two most commonly understood relationships."),
          option("fs", "Finish-to-Start only", "Use the simplest dependency model."),
        ],
      },
      {
        id: "q15",
        number: 15,
        prompt: "May one Task depend on multiple predecessor Tasks?",
        context: "A construction step may need several earlier Tasks to be ready.",
        options: [
          option("latest", "Yes—the latest valid constraint wins", "The Task starts only after every dependency is satisfied.", true),
          option("one", "No—one predecessor only", "Every Task has at most one incoming dependency."),
          option("manual", "Yes—with manual conflict resolution", "The user chooses which constraint controls the Task."),
        ],
      },
      {
        id: "q16",
        number: 16,
        prompt: "What should happen when a linked Task is dragged to another date?",
        context: "The dependency must remain understandable after a manual move.",
        options: [
          option("lag", "Update its lag", "Keep the dependency and convert the manual distance into the new lag value.", true),
          option("block", "Block the drag", "The user must edit or remove the dependency first."),
          option("unlink", "Remove the dependency", "Dragging turns the Task into a manually scheduled Task."),
        ],
      },
      {
        id: "q17",
        number: 17,
        prompt: "Should successors move earlier when a predecessor moves earlier?",
        context: "The current prototype only pushes linked Tasks later.",
        options: [
          option("both", "Yes—recalculate both earlier and later", "Dependency-controlled schedules remain deterministic.", true),
          option("later", "No—only push later", "Earlier movement preserves any newly created slack."),
          option("prompt", "Ask each time", "The user chooses whether to pull successors earlier."),
        ],
      },
      {
        id: "q18",
        number: 18,
        prompt: "What may a Header Task contain besides child Tasks?",
        context: "Header dates are derived from descendants and normally do not behave like leaf Tasks.",
        options: [
          option("derived", "No direct Resources or dependencies; derive progress", "Header dates span descendants and progress is duration-weighted from leaf Tasks.", true),
          option("full", "Allow Resources, dependencies, and manual progress", "Headers behave like regular Tasks plus folders."),
          option("links", "Allow dependencies but derive progress", "Headers may control other schedule sections."),
        ],
      },
      {
        id: "q19",
        number: 19,
        prompt: "What should happen when deleting a Header Task with children?",
        context: "Deleting a folder can otherwise remove a large part of the schedule unexpectedly.",
        options: [
          option("block", "Block until children are moved or deleted", "The safest option prevents accidental schedule loss.", true),
          option("cascade", "Delete the Header and all descendants", "Show a strong confirmation before deletion."),
          option("promote", "Move children up one level", "Delete only the Header and preserve descendants."),
        ],
      },
    ],
  },
  {
    id: "templates",
    title: "Project Templates",
    intro: "Templates should save setup time without carrying stale Project-specific information.",
    questions: [
      {
        id: "q20",
        number: 20,
        prompt: "What Resource information should a Template save?",
        context: "The two source documents differ on specific Resources versus Resource Categories.",
        options: [
          option("categories", "Resource Categories only", "Choose the specific people/equipment after creating the new Project.", true),
          option("resources", "Specific Resources", "Reuse the exact assignments from the source Project."),
          option("both", "Both as optional defaults", "Copy categories and optionally preselect the same Resources."),
        ],
      },
      {
        id: "q21",
        number: 21,
        prompt: "How should unlinked Tasks retain their timing in a Template?",
        context: "Without fixed dates or dependencies, independent Tasks need a rule relative to Project Start.",
        options: [
          option("offset", "Preserve relative day offsets", "Store how many working days each Task begins after Project Start.", true),
          option("start", "Start them all on Project Start", "The user reschedules independent Tasks manually."),
          option("prompt", "Ask during Project creation", "The user selects dates for every independent branch."),
        ],
      },
      {
        id: "q22",
        number: 22,
        prompt: "Which Task details should a Template retain?",
        context: "Progress and Project-specific dates should not accidentally carry into a new job.",
        options: [
          option("full_reset", "Structure, duration, links, colors, weekends, categories, and offsets", "Reset progress and specific Resources to a clean starting state.", true),
          option("basic", "Names, hierarchy, and duration only", "Rebuild colors, links, weekends, and Resources after creation."),
          option("everything", "Copy everything", "Include dates, progress, and specific Resources."),
        ],
      },
      {
        id: "q51",
        number: 51,
        prompt: "How should Template content be updated?",
        context: "The Product Spec requires a library with rename and delete, but does not require a separate Template editor.",
        options: [
          option("recreate", "Rename/delete and recreate from a Project", "Keep v1 simple; use a Project Plan as the Template editor.", true),
          option("editor", "Dedicated Template editor", "Edit the full task schedule directly in the Template Library."),
          option("overwrite", "Overwrite from a Project", "Choose an existing Template when saving a Project Plan."),
        ],
      },
    ],
  },
  {
    id: "calendars",
    title: "Calendars and Events",
    intro: "These choices keep calendar editing from conflicting with the Gantt schedule.",
    questions: [
      {
        id: "q23",
        number: 23,
        prompt: "How many Resources may be assigned to one Event?",
        context: "Tasks support multiple Resources, while the Event wording can be read as singular.",
        options: [
          option("multiple", "One or more Resources", "Use the same flexible assignment model as Tasks.", true),
          option("one", "One Resource only", "Each Event appears on one Resource row/calendar."),
          option("none", "No Resource assignment", "Events remain Project/company calendar items only."),
        ],
      },
      {
        id: "q24",
        number: 24,
        prompt: "How should a Master-only Event use an optional Project?",
        context: "A Project association can provide naming and Project Type filtering even when the Event is hidden from the Project Calendar.",
        options: [
          option("tag", "Use the Project for label/filtering only", "The Event stays off the Project Calendar unless Push to Project Calendar is enabled.", true),
          option("no_project", "Master-only Events cannot have a Project", "They are company-wide Events with no Project Type."),
          option("always_push", "A Project association always pushes it", "Every Project-associated Event appears on both calendars."),
        ],
      },
      {
        id: "q36",
        number: 36,
        prompt: "Should Header Tasks appear on calendars?",
        context: "Headers can duplicate the overall span already represented by their child Tasks.",
        options: [
          option("leaf", "No—show leaf Tasks only", "Calendars stay focused on actual scheduled work.", true),
          option("all", "Yes—show every Task", "Headers and descendants all appear."),
          option("toggle", "Provide a show/hide toggle", "Users decide whether to include Headers."),
        ],
      },
      {
        id: "q37",
        number: 37,
        prompt: "Can a Task be rescheduled directly from a calendar?",
        context: "Calendar movement could trigger dependency cascades or bypass the Gantt workflow.",
        options: [
          option("gantt", "No—click to open details; reschedule in Gantt", "All dependency-aware schedule movement stays in the Project Plan.", true),
          option("calendar", "Yes—drag and cascade", "Calendar dragging uses the same dependency engine."),
          option("unlink", "Yes—dragging makes it independent", "A calendar move removes or changes its dependency."),
        ],
      },
      {
        id: "q38",
        number: 38,
        prompt: "Can an Event be moved directly on a calendar?",
        context: "Events do not have dependencies, so direct movement is safer than moving Tasks.",
        options: [
          option("drag_confirm", "Yes, drag with confirmation", "Save the new date/time after a clear confirmation.", true),
          option("form", "No, edit through the Event form", "Calendar entries are not draggable."),
          option("drag", "Yes, save immediately", "Dragging autosaves without confirmation."),
        ],
      },
      {
        id: "q39",
        number: 39,
        prompt: "Which Event timing modes are required?",
        context: "Meetings need times, while holidays are normally all-day.",
        options: [
          option("both", "All-day and timed Events", "The Event form supports both modes.", true),
          option("all_day", "All-day only", "Events use dates without clock times."),
          option("timed", "Timed only", "Every Event requires start and end times."),
        ],
      },
      {
        id: "q40",
        number: 40,
        prompt: "Are recurring Events required in v1?",
        context: "Recurrence is not described in either specification.",
        options: [
          option("no", "No—exclude recurrence from v1", "Create individual Events only.", true),
          option("simple", "Yes—basic daily/weekly/monthly recurrence", "Add simple repeat rules."),
          option("advanced", "Yes—full recurrence rules", "Support end dates, exceptions, and edited occurrences."),
        ],
      },
      {
        id: "q41",
        number: 41,
        prompt: "Should every Project Calendar Event appear on the Master Calendar?",
        context: "The Master Calendar is intended to roll up active Project schedules.",
        options: [
          option("yes", "Yes—always roll up", "Project Events automatically appear on the Master Calendar.", true),
          option("optional", "Make it optional per Event", "An Event can be hidden from the Master Calendar."),
          option("no", "No", "Project Events stay only on their Project Calendar."),
        ],
      },
      {
        id: "q42",
        number: 42,
        prompt: "Who should see company-wide Master-only Events?",
        context: "These Events have no Project access rule to inherit.",
        options: [
          option("internal", "Owner, Admin, and Employee", "All internal Users see them; External users never do.", true),
          option("management", "Owner and Admin only", "Employees see only Project-associated items."),
          option("selected", "Selected Users only", "Each Event has a User visibility list."),
        ],
      },
      {
        id: "q43",
        number: 43,
        prompt: "What counts as a Resource scheduling conflict?",
        context: "v1 currently has no working-hours or capacity model.",
        options: [
          option("overlap", "Any overlapping Task/Event", "Any date/time overlap marks the Resource as double-booked.", true),
          option("capacity", "Only when capacity is exceeded", "Add working hours or percentage capacity to Resources."),
          option("warning_off", "Do not calculate conflicts", "Show assignments without warnings."),
        ],
      },
    ],
  },
  {
    id: "google",
    title: "Google Calendar",
    intro: "The sync is one-way; these choices define recipients, destination, privacy, and disconnect behavior.",
    questions: [
      {
        id: "q25",
        number: 25,
        prompt: "Which schedule items should an External or Client user receive in Google Calendar?",
        context: "Project access and Resource assignment are different relationships.",
        options: [
          option("assigned", "Only explicitly assigned Tasks and Events", "The External User must be linked to a Resource and assigned to each item.", true),
          option("project", "Every item on an accessible Project", "The complete Project schedule is synchronized."),
          option("choose", "Let each User choose", "Users subscribe to individual Projects or assignments."),
        ],
      },
      {
        id: "q26",
        number: 26,
        prompt: "Where should Dialoggg place synchronized Google events?",
        context: "A dedicated calendar is easier to identify, update, and remove safely.",
        options: [
          option("dedicated", "A separate calendar named Dialoggg", "Create and manage one dedicated calendar in the User's Google account.", true),
          option("primary", "The User's primary calendar", "Add items directly alongside their personal events."),
          option("select", "Let the User select a calendar", "The User chooses a destination during connection."),
        ],
      },
      {
        id: "q27",
        number: 27,
        prompt: "Who supplies the Google OAuth application credentials?",
        context: "OAuth application credentials are normally configured once for the platform.",
        options: [
          option("platform", "One platform-wide Dialoggg OAuth application", "The development team configures one app; each User grants personal access.", true),
          option("company", "Each company supplies its own credentials", "Every Owner configures a separate Google developer application."),
          option("sportcourt", "Sport Court credentials only", "The integration is initially tied to one company."),
        ],
      },
      {
        id: "q45",
        number: 45,
        prompt: "How should reminders work on synchronized Google events?",
        context: "Google calendars can apply personal default reminders automatically.",
        options: [
          option("google", "Use each User's Google defaults", "Dialoggg does not impose a reminder time.", true),
          option("dialoggg", "Dialoggg sets a standard reminder", "Every synchronized item receives the same reminder."),
          option("task", "Choose per Task/Event", "Add reminder controls to Dialoggg."),
        ],
      },
      {
        id: "q46",
        number: 46,
        prompt: "What should happen to existing Google events when a User disconnects?",
        context: "Leaving events preserves history but they will no longer receive updates.",
        options: [
          option("ask", "Ask whether to remove or keep them", "Present both choices during disconnect.", true),
          option("remove", "Remove all Dialoggg events", "Clean the dedicated calendar immediately."),
          option("keep", "Keep them", "Stop future updates and leave existing entries."),
        ],
      },
      {
        id: "q47",
        number: 47,
        prompt: "What happens when a Resource is reassigned to another User?",
        context: "The old User should not continue receiving schedule updates for work they no longer own.",
        options: [
          option("move", "Delete from the old User and create for the new User", "Update synchronization immediately.", true),
          option("keep", "Keep both copies", "The old User retains the original event."),
          option("prompt", "Ask an Admin each time", "The reassignment flow requires a manual choice."),
        ],
      },
      {
        id: "q48",
        number: 48,
        prompt: "What information may appear in personal Google Calendar entries?",
        context: "Calendar titles and notifications can be visible on lock screens and shared devices.",
        options: [
          option("project_task", "Project and Task/Event names", "Do not include client contact details or internal notes.", true),
          option("task_only", "Task/Event name only", "Hide the Project/client name for additional privacy."),
          option("full", "Full Project and client details", "Include address, contact details, and description."),
        ],
      },
    ],
  },
  {
    id: "onedrive",
    title: "OneDrive folders",
    intro: "These choices determine how folders are connected and how Microsoft permissions are handled.",
    questions: [
      {
        id: "q28",
        number: 28,
        prompt: "Which Microsoft storage should Dialoggg connect to?",
        context: "Company file storage normally uses Microsoft 365 rather than a personal OneDrive account.",
        options: [
          option("business", "OneDrive for Business or SharePoint library", "Use the company's Microsoft 365 storage.", true),
          option("personal", "Personal OneDrive", "Connect an individual's personal Microsoft account."),
          option("both", "Support both", "Allow either personal or business Microsoft storage."),
        ],
      },
      {
        id: "q29",
        number: 29,
        prompt: "How should Common and Private folders be established?",
        context: "Some Projects may already have folders while new Projects may need them created.",
        options: [
          option("both", "Create automatically or link existing folders", "Offer both choices and store stable Microsoft folder identifiers.", true),
          option("create", "Always create them automatically", "Use a configured company root folder."),
          option("link", "Always link existing folders", "An Owner/Admin selects both folders manually."),
        ],
      },
      {
        id: "q30",
        number: 30,
        prompt: "Who should manage Microsoft folder permissions?",
        context: "Showing a link in Dialoggg does not itself grant permission inside Microsoft 365.",
        options: [
          option("microsoft", "Microsoft 365 administrators manage permissions", "Dialoggg controls which links are visible; Microsoft controls folder access.", true),
          option("dialoggg", "Dialoggg automatically grants and revokes access", "Project assignments update Microsoft sharing permissions."),
          option("links", "Anyone with the link may open the folder", "Use share links without Microsoft authentication."),
        ],
      },
      {
        id: "q31",
        number: 31,
        prompt: "Which Employees may open a Project's Common folder?",
        context: "Employees see every Project schedule, but the file section refers to assigned Internal users.",
        options: [
          option("assigned", "Assigned Employees only", "All Employees see the schedule; only the Project team receives the Common-folder link.", true),
          option("all", "Every Employee", "Schedule visibility and Common-folder visibility are identical."),
          option("custom", "A separate file-access list", "Common-folder access is managed independently of Project assignment."),
        ],
      },
      {
        id: "q49",
        number: 49,
        prompt: "How should External users authenticate to Common folders?",
        context: "Anonymous links are convenient but can be forwarded outside the Project team.",
        options: [
          option("microsoft", "Require Microsoft-authenticated access", "External users sign in with an authorized Microsoft account.", true),
          option("controlled_link", "Controlled share link", "Use a link with expiry or passcode where available."),
          option("anonymous", "Anonymous link", "Anyone possessing the URL can open the folder."),
        ],
      },
      {
        id: "q50",
        number: 50,
        prompt: "What should Dialoggg do to OneDrive folders when a Project changes?",
        context: "Automatic folder deletion or renaming can cause unexpected file loss or broken external workflows.",
        options: [
          option("leave", "Never rename or delete folders automatically", "Keep stable folder links; Microsoft file management remains separate.", true),
          option("rename", "Rename folders with the Project", "Keep folder names synchronized but never delete them."),
          option("full", "Mirror Project lifecycle", "Rename and delete OneDrive folders with the Dialoggg Project."),
        ],
      },
    ],
  },
  {
    id: "experience",
    title: "Time, mobile, and product boundaries",
    intro: "The final choices define consistent time handling and a clear v1 boundary.",
    questions: [
      {
        id: "q32",
        number: 32,
        prompt: "Which time-zone model should Dialoggg use?",
        context: "Timed Events and Google Calendar synchronization require an explicit time zone.",
        options: [
          option("company", "One required time zone per company", "Every company schedule uses its configured time zone.", true),
          option("user", "A time zone per User", "Events are converted for each viewer."),
          option("fixed", "One fixed platform time zone", "Every company uses the same time zone."),
        ],
      },
      {
        id: "q52",
        number: 52,
        prompt: "What is the preferred phone experience for the Gantt chart?",
        context: "A desktop timeline is wider than a phone, but every function still needs to remain usable.",
        options: [
          option("both", "Compact task list plus horizontal touch timeline", "Users can switch between a phone-friendly list and the full scrollable Gantt.", true),
          option("scroll", "Horizontal touch timeline only", "Use the same Gantt with responsive controls and scrolling."),
          option("list", "Compact task list only", "Hide the visual timeline on phones."),
        ],
      },
      {
        id: "q53",
        number: 53,
        prompt: "Which browsers should v1 support?",
        context: "Defining current-browser support prevents accidental commitments to obsolete versions.",
        options: [
          option("current", "Current Chrome, Edge, Safari, and mobile Safari/Chrome", "Support actively maintained browser versions.", true),
          option("extended", "Also support older browser versions", "Define the exact minimum versions in comments."),
          option("chrome", "Chrome and Edge only", "Do not guarantee Safari support."),
        ],
      },
      {
        id: "q54",
        number: 54,
        prompt: "Is an activity or audit history required in v1?",
        context: "It is not included in the supplied specification and would be additional scope.",
        options: [
          option("out", "No—record it as out of scope", "Do not add an audit-history interface in v1.", true),
          option("basic", "Basic history", "Record schedule, role, and integration changes."),
          option("full", "Detailed audit log", "Record all important create, edit, and delete actions."),
        ],
      },
    ],
  },
];

export const REQUIREMENTS_QUESTIONS = REQUIREMENTS_SECTIONS.flatMap(section => section.questions);

export const REQUIREMENTS_DISPLAY_NUMBER_BY_ID = new Map(
  REQUIREMENTS_QUESTIONS.map((question, index) => [question.id, index + 1]),
);

export const REQUIREMENTS_QUESTION_BY_ID = new Map(
  REQUIREMENTS_QUESTIONS.map(question => [question.id, question]),
);
