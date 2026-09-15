import type {
  RequirementOption,
  RequirementQuestion,
  RequirementSection,
} from "@/lib/requirements-questionnaire";

export const FOLLOW_UP_FORM_KEY = "dialoggg-reboot-follow-up-v1";

const option = (
  id: string,
  label: string,
  detail: string,
  recommended = false,
): RequirementOption => ({ id, label, detail, recommended });

const question = (
  id: string,
  number: number,
  prompt: string,
  context: string,
  example: string,
  options: RequirementOption[],
): RequirementQuestion => ({ id, number, prompt, context, example, options });

export const FOLLOW_UP_SECTIONS: RequirementSection[] = [
  {
    id: "privacy-and-access",
    title: "Privacy and access",
    intro: "These choices decide who can enter a company and what clients can see. The examples show exactly what each answer would mean.",
    questions: [
      question(
        "fu01",
        1,
        "What should the Platform Administrator be allowed to see inside a company?",
        "You already chose a separate Platform Administrator who can create companies. We still need to decide whether that person can open a company's private projects and schedules.",
        "Example: Sport Court asks for help with a Project. Should the Platform Administrator see only the company name and Owner account, or should they also be able to open that Project?",
        [
          option("company_only", "Manage companies only", "The Platform Administrator can create, pause, and restore companies and invite the first Owner. They cannot open company Projects, Users, schedules, or file links unless that company adds them as a User.", true),
          option("read_only", "Read-only support access", "The Platform Administrator can enter any company in a clearly marked support mode, but cannot change anything."),
          option("full_support", "Full support access", "The Platform Administrator can open and edit any company when support is needed."),
        ],
      ),
      question(
        "fu02",
        2,
        "Can the same person have a different role in each company?",
        "You chose one login with a company switcher. We need to know whether the role belongs to the person or to each company membership.",
        "Example: Jamie could be an Admin for Sport Court, but only an External/Client for another contractor. Jamie would use the same email and password, then switch companies.",
        [
          option("per_company", "Yes, a separate role in each company", "A person's permissions can be different in every company they join.", true),
          option("same_everywhere", "No, use one role everywhere", "If the person is an Admin in one company, they are an Admin in every company they join."),
          option("same_role_only", "Only allow matching roles", "A person can join several companies only when the role is the same in all of them."),
        ],
      ),
      question(
        "fu03",
        3,
        "Should an External/Client user be able to see a Gantt chart?",
        "You selected a simple task list and Project Calendar, and then said you would also be fine with clients seeing the Gantt. This choice makes the final client view clear.",
        "Example: A homeowner opens their court Project. They can already see tasks and dates. Should they also see a simple timeline of those tasks, without internal notes, lag settings, or private Resource details?",
        [
          option("optional", "Let the Owner turn on a simple Gantt per Project", "Clients normally see the simple task list. An Owner/Admin can also show a read-only timeline for a particular Project. Sensitive scheduling details stay hidden.", true),
          option("always", "Always show a simple read-only Gantt", "Every client sees a safe read-only timeline on each Project they can access."),
          option("never", "Do not show clients a Gantt", "Clients see only the task list, Project Calendar, progress, and allowed Common folder link."),
        ],
      ),
    ],
  },
  {
    id: "templates-and-scheduling",
    title: "Templates and scheduling",
    intro: "These choices remove the last uncertainty from Templates and the Gantt calculation rules.",
    questions: [
      question(
        "fu04",
        4,
        "Should a Template remember the exact people and equipment assigned to Tasks?",
        "One earlier answer said a Template may remember specific Resources. Another answer said specific Resources should reset. We need one clear rule.",
        "Example: A 'Backyard Court' Template says Excavation needs the Employee category. Should it also remember that John and Excavator #2 were assigned on the Project used to create the Template?",
        [
          option("optional", "Categories always; exact Resources only when chosen", "The Template always remembers Resource Categories. When saving it, the User can turn on 'Also save current Resource assignments.' That switch is off by default.", true),
          option("categories", "Remember categories only", "The new Project starts with categories such as Employee or Equipment, but the User always chooses the actual people and equipment."),
          option("always", "Always remember exact Resources", "The same people, subcontractors, suppliers, and equipment are automatically assigned on every new Project made from the Template."),
        ],
      ),
      question(
        "fu05",
        5,
        "When one Task must start after another Task finishes, what does zero lag mean?",
        "You chose inclusive dates and all four standard link types. We still need to settle whether two linked Tasks may share the finishing day when lag is zero.",
        "Example: Task A runs Monday, Tuesday, and Wednesday. Task B is linked Finish-to-Start with 0 days of lag. Does Task B start Thursday, or does it also start on Wednesday?",
        [
          option("next_day", "Start on Thursday—the next working day", "Task B starts on the first allowed working day after Task A's final day. This is the usual Finish-to-Start rule.", true),
          option("same_day", "Start on Wednesday—the same day", "Task B may start on the day Task A finishes."),
          option("per_link", "Choose for every link", "Each link gets an extra same-day or next-day setting."),
        ],
      ),
      question(
        "fu06",
        6,
        "What should happen if someone changes the Project Start Date after the schedule has been created?",
        "A Template is built from a chosen Project Start Date. Later, an Owner/Admin may need to move the whole job. The system needs a predictable response.",
        "Example: A Project was planned to start June 1, but the permit moves it to June 15. Should every Task move by the same number of working days, or should the Task dates remain unchanged?",
        [
          option("ask", "Ask whether to move the whole schedule", "Show two clear choices: move all Tasks together, or change only the Project Start Date. This avoids a surprise.", true),
          option("always_shift", "Always move the whole schedule", "All Tasks move by the same working-day amount and keep their links and spacing."),
          option("never_shift", "Never move existing Tasks", "Changing Project Start Date does not change any Task once the Project Plan contains work."),
        ],
      ),
    ],
  },
  {
    id: "events-and-lifecycle",
    title: "Events, Resources, and lifecycle",
    intro: "These choices explain repeating Events and what happens when records overlap, become inactive, or are removed.",
    questions: [
      question(
        "fu07",
        7,
        "How should a repeating Event end?",
        "You added simple daily, weekly, and monthly repeating Events to v1. We need to know what the Event form should ask for at the end of the series.",
        "Example: A safety meeting repeats every Monday. The User may want it to stop on December 31, stop after 12 meetings, or continue with no chosen end date.",
        [
          option("flexible", "Allow an end date, a number of times, or no end date", "The User can choose the most useful end rule. The system will still use a safe future limit when loading calendars.", true),
          option("date", "Always require an end date", "Every repeating Event must stop on a selected calendar date."),
          option("count", "Always require a number of times", "Every repeating Event must say exactly how many occurrences to create."),
        ],
      ),
      question(
        "fu08",
        8,
        "When editing one repeating Event, what should the User be able to change?",
        "Changing a repeating Event can affect only the selected occurrence or the entire series. More choices make the feature more powerful but also more complicated.",
        "Example: The weekly Monday meeting moves to Tuesday for one week only. Should the User move just that meeting, or must every meeting in the series move?",
        [
          option("one_or_all", "This occurrence or the entire series", "Let the User change/delete only the selected occurrence or the whole series. Do not add the more complex 'this and following' choice in v1.", true),
          option("all_only", "Entire series only", "One occurrence cannot have a different date or be deleted by itself."),
          option("full", "Add all three common choices", "Support this occurrence, this and following Events, or the entire series."),
        ],
      ),
      question(
        "fu09",
        9,
        "What should happen when a Resource is double-booked?",
        "You chose that any overlapping Task or Event counts as a conflict. We still need to decide whether the system should stop the User from saving it.",
        "Example: Excavator #2 is already assigned Monday through Wednesday. Someone assigns it to another Task on Tuesday. Should Dialoggg warn them and allow it, or completely block the second assignment?",
        [
          option("warn_confirm", "Warn, then allow it after confirmation", "Show the conflict clearly. An Owner/Admin may continue if the overlap is intentional.", true),
          option("block", "Block the second assignment", "The User must change dates or Resources before saving."),
          option("calendar_only", "Only mark it on the Resource Calendar", "Save normally without a warning in the editor, but display the conflict later."),
        ],
      ),
      question(
        "fu10",
        10,
        "How should a login User be connected to a scheduling Resource?",
        "Google Calendar uses this connection to know whose calendar receives an assigned Task or Event.",
        "Example: John has one login and also appears as an Employee Resource. Normally those two records connect one-to-one. A crew account, however, might represent several Resources.",
        [
          option("one_to_one", "One User connects to one Resource in each company", "Each person has one clear scheduling identity per company. One Resource also connects to no more than one User.", true),
          option("one_to_many", "One User may connect to several Resources", "One login can receive schedules for several people, crews, or equipment items."),
          option("many_to_one", "Several Users may connect to one Resource", "Everyone connected to a shared Resource receives the same schedule."),
        ],
      ),
      question(
        "fu11",
        11,
        "What should happen when a Resource is no longer used but appears on old Projects?",
        "Permanently deleting a Resource can make old schedules confusing. We need a history-safe rule.",
        "Example: A subcontractor is no longer used, but was assigned to 30 completed Tasks. Should their name remain visible on those old Tasks?",
        [
          option("deactivate", "Deactivate it and keep the history", "The Resource cannot be used on new work, but its name stays on old Tasks and Events. It can be restored later.", true),
          option("delete", "Remove it from old work and delete it", "Dialoggg unassigns it everywhere, then permanently deletes the Resource."),
          option("block", "Do not allow removal while it is used", "An Owner/Admin must manually remove or replace every assignment first."),
        ],
      ),
      question(
        "fu12",
        12,
        "What should happen when the Platform Administrator pauses a company?",
        "A paused company may still contain years of Projects and connected calendars. The data should not disappear by accident.",
        "Example: A company stops using Dialoggg for six months. Should its Users be locked out while all data is kept, should they get read-only access, or should the company be deleted?",
        [
          option("suspend", "Lock access, pause sync, and keep everything", "Users cannot enter the company, Google updates pause, OneDrive folders stay untouched, and the Platform Administrator can restore the company later.", true),
          option("read_only", "Allow read-only access", "Users can still sign in and view schedules, but cannot change anything and Google updates pause."),
          option("delete", "Delete the company", "Pausing permanently removes its Dialoggg records."),
        ],
      ),
      question(
        "fu13",
        13,
        "Please confirm what should happen when a Project Type is still being used.",
        "You selected 'block deletion,' but also said the earlier question was unclear. This example states the rule in a more direct way.",
        "Example: The Project Type 'Acrylic' is used by 12 Projects. Dialoggg would not delete 'Acrylic' until an Owner/Admin changes those 12 Projects to another type.",
        [
          option("block", "Yes, keep that rule", "Do not delete an in-use Project Type. First move all affected Projects to another type.", true),
          option("replace", "Choose a replacement while deleting", "The delete window asks for another Project Type and moves all affected Projects in one step."),
          option("archive", "Never delete Project Types", "Allow rename or archive only, so old Projects always keep their original type."),
        ],
      ),
    ],
  },
  {
    id: "setup-and-quality",
    title: "Setup and quality targets",
    intro: "These final questions set practical expectations for Microsoft files, secure links, Google updates, system size, backups, and accessibility.",
    questions: [
      question(
        "fu14",
        14,
        "Where should each company's Common and Private Project folders live?",
        "You chose OneDrive for Business or SharePoint and said Dialoggg may create or link folders. The connection still needs a starting location.",
        "Example: Sport Court may have a SharePoint site called 'Operations' with a library called 'Projects.' Dialoggg could create each new Project's Common and Private folders below that location.",
        [
          option("select_root", "Choose a company folder or SharePoint library during setup", "An Owner/Admin selects the company's main location once. New Project folders go there, while existing Project folders may still be linked.", true),
          option("user_root", "Use the connecting person's OneDrive", "Folders are created in the root of the Owner/Admin's OneDrive for Business."),
          option("fixed", "Use one fixed Sport Court location", "The development team configures one library for the first company only."),
        ],
      ),
      question(
        "fu15",
        15,
        "How long should invitation and password-reset links stay usable?",
        "These links must expire for security, but invitations usually need more time than an urgent password reset.",
        "Example: A new Employee receives an invitation on Friday and opens it Monday. A password-reset link should normally expire much sooner because it gives quick access to an existing account.",
        [
          option("72_1", "Invitation: 72 hours; password reset: 1 hour", "Both links work once and can be sent again if they expire.", true),
          option("24_24", "Both links: 24 hours", "Use one simple expiry rule for both types of link."),
          option("custom", "Use different times", "Choose this and write the two preferred time limits in the comment box."),
        ],
      ),
      question(
        "fu16",
        16,
        "How quickly should a Dialoggg change normally appear in Google Calendar?",
        "Google or the internet may sometimes be temporarily unavailable. We need a clear normal target and a retry rule.",
        "Example: An Admin moves Excavation from Tuesday to Thursday. The assigned User should see Thursday in their Dialoggg Google calendar shortly afterward, without creating a duplicate Event.",
        [
          option("two_minutes", "Usually within 2 minutes; keep retrying for 24 hours", "Show connection or sync problems so the User or an Owner/Admin knows when action is needed.", true),
          option("five_minutes", "Usually within 5 minutes; keep retrying for 24 hours", "This allows a little more processing time while keeping automatic retries."),
          option("manual", "Best effort with a manual Retry button", "Do not promise a time. A User retries failed updates themselves."),
        ],
      ),
      question(
        "fu17",
        17,
        "About how large could one company become in v1?",
        "This estimate helps the team choose and test the right database. It does not limit future growth; it gives v1 a realistic test target.",
        "Example: Think about the busiest company you expect, including office Users, field Resources, active Projects, Tasks inside one large Project, and people using the app at the same time.",
        [
          option("standard", "Up to 25 Users, 100 Resources, 250 active Projects, and 500 Tasks per Project", "Test at this practical small-contractor scale, with several separate companies on the platform.", true),
          option("large", "Up to 100 Users, 500 Resources, 1,000 active Projects, and 2,000 Tasks per Project", "Plan for a much larger company and stronger server-database/load-testing needs."),
          option("custom", "We should provide our own estimate", "Choose this and write expected companies, Users, Resources, Projects, Tasks, and simultaneous Users in the comment box."),
        ],
      ),
      question(
        "fu18",
        18,
        "How much backup protection should v1 have?",
        "This sets how often data is copied, how long copies are kept, and how quickly the system should be restorable after a serious problem.",
        "Example: With one backup each day, a worst-case failure just before the next backup could lose almost one day of changes. A four-hour restore target means the team aims to recover service within four hours after work begins.",
        [
          option("daily", "Daily backup, keep 30 days, restore within 4 hours", "Test a restore at least every three months. Maximum expected data loss is about 24 hours.", true),
          option("six_hour", "Backup every 6 hours, keep 90 days, restore within 2 hours", "Provides stronger protection but needs more storage and operations work."),
          option("custom", "Use a different target", "Choose this and write the backup frequency, retention period, acceptable data loss, and restore time in the comment box."),
        ],
      ),
      question(
        "fu19",
        19,
        "What accessibility target should the team use for the main workflows?",
        "Accessibility includes keyboard use, readable contrast, clear labels, visible focus, zoom, and not using color as the only way to show meaning.",
        "Example: A User should be able to tab through a Project form, see which field is selected, understand an error without relying only on red color, and zoom the page without losing the Save button.",
        [
          option("wcag", "Use WCAG 2.2 AA for the main workflows", "Test the important screens against a recognized accessibility standard.", true),
          option("good_practice", "Use good accessibility practices without claiming a standard", "Apply the same ideas, but do not perform formal conformance testing."),
          option("later", "Do a formal accessibility review after v1", "Keep basic usability in v1 and treat formal conformance as future work."),
        ],
      ),
    ],
  },
];

export const FOLLOW_UP_QUESTIONS = FOLLOW_UP_SECTIONS.flatMap(section => section.questions);

export const FOLLOW_UP_DISPLAY_NUMBER_BY_ID = new Map(
  FOLLOW_UP_QUESTIONS.map((item, index) => [item.id, index + 1]),
);

export const FOLLOW_UP_QUESTION_BY_ID = new Map(
  FOLLOW_UP_QUESTIONS.map(item => [item.id, item]),
);
