# Projects, Access Views, and Project Lifecycle UI Module

Last verified: September 15, 2026

## Delivery boundary

This detailed UI review module covers the Project directory, required Project setup, Project editing and Start Date decisions, role-based Project views, completion/reopen, archive/restore, and Owner-only permanent deletion. UI review actions do not persist lifecycle, detail, assignment, Project Type, Template, calendar, Google, or Microsoft changes.

The existing `GanttChart` remains the internal **Project Plan** and was not edited or replaced. External/Client receives a separate safe read-only summary and optional simple Gantt, as approved.

## Requirement traceability

| Requirement | UI coverage |
| --- | --- |
| `DG-PRJ-001`, `DG-GNT-001` | Project copy states one job site, one Project Plan, and one Project Calendar context. Internal detail continues to load the original Gantt. |
| `DG-PRJ-002`, `DG-PRJ-010` | Add Project requires Project Name, Client Name, Client Email, Address, City, State, Zip, Phone Number, Project Type, and Project Start Date. Status is visibly Active by default. |
| `DG-PRJ-003` | Project End Date is labelled as derived from scheduled leaf Tasks/root Header Task and is never an editable field. |
| `DG-PRJ-004` | Owner/Admin receives create, edit, complete, reopen, archive, restore, and role-appropriate delete controls. Employee is read-only. External/Client receives no management controls. |
| `DG-PRJ-005`, `DG-USR-004`–`DG-USR-006` | Setup/edit previews Internal and External/Client User assignments and explains the different visibility/access effects. |
| `DG-PRJ-006`, `DG-PRJ-007` | Directory rows show Project Name, Client Name, Project Type, status, dates, and role-appropriate actions. Search, status, and Project Type filters include recoverable no-results behavior. |
| `DG-PRJ-008` | Employee route copy and tests show every same-company Project, assigned or unassigned, without management actions. |
| `DG-PRJ-009`, `DG-ROL-007`, `DG-ROL-008`, `FUP-003` | External/Client server queries require Project assignment; direct unassigned IDs return not found. The safe view exposes progress, safe Tasks/dates, Project Calendar, Common, and optional simple Gantt while hiding internal notes, Users, Private access, dependency lag, and private Resource details. |
| `DG-PRJ-011`–`DG-PRJ-013` | Complete makes the Project read-only, removes it from current calendars by default, preserves history, and offers Reopen. Completed direct edit routes show a read-only state. |
| `DG-PRJ-014` | Archive is presented as normal removal, preserves all Project data and integration identifiers, leaves active lists/current calendars, and offers Restore. Archived direct edit routes are blocked. |
| `DG-PRJ-015`, `DG-PRJ-016` | Permanent deletion appears only after Archive, requires Owner, exact Project Name, and a separate acknowledgement. It names irreversible Dialoggg/Google effects and states that Microsoft folders are never renamed or deleted. |
| `DG-PRJ-017`, `FUP-006`, `IC-001` | A changed Project Start Date requires **Change Project Date only** or **Shift unfinished Tasks**. Completed Task counts are shown and completed Tasks never move. |
| `DG-PRJ-018` | Internal Note copy explicitly states that it is never included in Google Calendar. |
| `DG-TPL-011`–`DG-TPL-013` | Add Project offers Blank Project Plan or Start from Project Template and states that Template Tasks become ordinary editable Tasks in the original Gantt. |
| `DG-ODR-012` | Complete, reopen, archive, restore, and permanent-delete dialogs all preserve the rule that Dialoggg does not rename/delete Microsoft folders automatically. |
| `DG-UX-001`, `DG-UX-004`, `DG-UX-007`, `DG-UX-009` | Approved names, labelled controls, responsive cards, keyboard Escape, dialog semantics, non-color statuses, and no phone-width page overflow are covered. |

## Routes and access

| Route | Purpose | Signed out | Employee | External/Client | Owner/Admin |
| --- | --- | --- | --- | --- | --- |
| `/projects` | Accessible Project directory, filters, dates, and actions | Login redirect | All company Projects, read-only | Assigned Projects only | Full UI review |
| `/projects/new` | Required setup, Plan source, and assignments | Login redirect | Restricted | Restricted | Full UI review |
| `/projects/[id]` | Role-appropriate detail, Plan/calendar/resources, lifecycle | Login redirect | Internal read-only | Assigned safe view only | Full UI review |
| `/projects/[id]/edit` | Project details, assignments, and Start Date decision | Login redirect | Restricted | Restricted | Active Projects only; Completed/Archived show read-only state |
| `/projects/mine` | Existing assignment-based Project list | Login redirect | Assigned Projects | Not shown in External navigation | Available |

## Project directory states

- Active is the default filter; Completed, Archived, and All statuses are available.
- Project Type can be filtered by the approved fixed examples.
- Search matches Project, client, and Project Type.
- Empty filtered results explain the cause and offer **Clear filters**.
- Summary cards count Active, Completed, and Archived Projects.
- Derived End Date remains unavailable until scheduled leaf Tasks exist.
- External/Client navigation excludes Master Calendar, Resource Calendar, Resources, and redundant My Projects links.

## Add/Edit Project states

1. **Required validation** — all ten approved required values can fail together with field-specific messages.
2. **Active default** — Status is displayed, not silently inferred.
3. **Derived End Date** — no manual End Date control exists.
4. **Plan source** — Blank Project Plan or Start from Project Template; Template choice is required only for the latter.
5. **Assigned Users** — Internal and External/Client examples can be selected independently.
6. **Start Date rebase** — edit requires date-only or shift-unfinished selection when Tasks exist.
7. **Completed-history protection** — completed and unfinished Task counts are repeated before choosing a schedule shift.
8. **Exact review** — Project, Type, Status, Start Date, End Date rule, client/job-site information, phone, Plan source/rebase choice, and assigned Users are shown.
9. **Back to edit / Escape** — closes review without losing values.
10. **Leave Project setup?** — protects changed values.
11. **Completion** — explicitly states that no connected production record changed.

## Lifecycle states

- **Complete Project?** explains read-only behavior, current-calendar removal, historical availability, Reopen, and preservation.
- **Reopen Project?** explains restored authorized editing/current-calendar eligibility and stable history/integration IDs.
- **Archive Project?** identifies Archive as normal removal and confirms recovery plus Microsoft-folder preservation.
- **Restore Project?** returns the preview to Active without recreating Microsoft folders.
- **Permanently delete Project?** is Owner-only, Archive-only, irreversible, and requires both exact-name entry and an acknowledgement checkbox.
- Safe cancel is the initially focused action in lifecycle dialogs.

## External/Client view

- Assigned-Project server boundary returns not found for unassigned direct IDs.
- Company-wide Master/Resource Calendar and Resource directory navigation is absent.
- Safe summary shows overall progress, current phase, and status.
- Project Calendar preview shows only safe assigned-Project Task/Event information.
- Common is present; Private access is explanatory only and no Private link exists.
- Simple read-only Gantt is clearly distinct from the internal original Gantt.

## QA evidence

- Production build and TypeScript validation passed with 56 generated application routes, including `/projects/[id]/edit`.
- Foundation suite passed 14 of 14 checks.
- Isolated application suite passed 96 of 96 scenarios.
- Focused Projects Playwright suite passed 15 of 15 scenarios.
- Human-click QA covered Login, Active directory data, Project Type/status/date presentation, original Gantt task rows and timeline, completion impact, Edit fields, and the Start Date schedule-choice/exact-review flow.
- Automated testing found External/Client company-wide navigation leakage; it was removed and regression-tested.
- Human review found direct Completed/Archived edit URLs did not yet show the required read-only boundary; the guard and regression test were added.
- The existing original `GanttChart` remains unchanged.

## Data wiring intentionally deferred

The backend phase must persist the complete field set, Project Type, lifecycle/audit records, Project assignments, External Gantt enablement, Template instantiation, working-day rebase, derived root-Header End Date, calendar inclusion, Google cleanup, Microsoft stable IDs, and Owner authorization. API enforcement must mirror every UI boundary before launch.
