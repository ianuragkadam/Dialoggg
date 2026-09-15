# Project Templates UI Module

Last verified: September 15, 2026

## Delivery boundary

This module is a detailed UI-only implementation for client review. It does not create or change production Templates, Projects, Tasks, Resources, or dates. All preview changes reset on refresh. Persistence, APIs, Template-to-Project instantiation, and schedule calculation remain deferred.

The existing original `GanttChart` remains Dialoggg's Project Plan engine. None of the Template preview components imports, replaces, or renders another Gantt. Once backend integration is approved, a Project created from a Template must open in the existing `/projects/[id]#plan` experience.

## Requirements traceability

| Requirement | UI coverage |
| --- | --- |
| `DG-TPL-001` | Owner/Admin-only **Save Project as Template** journey with company-Project source selection. |
| `DG-TPL-002` | Detail and save-summary views show Tasks, Headers, durations, dependencies, relative offsets, and Resource Categories. |
| `DG-TPL-003` | Detail view exposes saved colors and Saturday/Sunday work rules. |
| `DG-TPL-004` | Plan preview uses working-day offsets instead of fixed source dates. |
| `DG-TPL-005` | Library, detail, use, and confirmation states state that progress starts at 0%. |
| `DG-TPL-006` / `FUP-004` | Scott approved the implemented choice: categories always copy; exact Resources copy only when a save-time switch is enabled, off by default. |
| `DG-TPL-007` | Save UI explains that inactive/missing Resources cannot block Project creation. |
| `DG-TPL-008` | Library states company isolation; names validate as unique without case sensitivity. |
| `DG-TPL-009` | Library provides view, rename, and confirmation-protected delete actions. |
| `DG-TPL-010` | Read-only details state that v1 recreates Template content from a Project Plan and has no dedicated Template schedule editor. |
| `DG-TPL-011` | **Use Template** journey collects Project name, exactly one Project Type, and a required Project Start Date before review. |
| `DG-TPL-012` | Confirmation previews the Start Date anchor, copied Task count, reset progress, and future schedule-calculation handoff. |
| `DG-TPL-013` | Use flow states that created Tasks become ordinary editable Tasks and never change the saved Template. |

## Routes

| Route | Purpose | Signed-out | Employee (Internal) | Admin |
| --- | --- | --- | --- | --- |
| `/templates` | Company Template Library | Redirect to Login | Restricted state with no Template data | Full preview |
| `/templates/new` | Save an existing Project Plan as a Template | Redirect to Login | Restricted state | Source and content form |
| `/templates/[id]` | Read-only Template details and representative Plan rows | Redirect to Login | Restricted state | Full preview; unknown ID is 404 |
| `/templates/[id]/use` | Start a Project from the selected Template | Redirect to Login | Restricted state | Project setup and confirmation |

The **Project Templates** Admin navigation item opens `/templates`.

## Library states and actions

- Summary cards show company Template count, total reusable Tasks, and the 0% progress rule.
- Search matches Template or source-Project name.
- A no-results state quotes the search and provides **Clear search**.
- Each Template card exposes Task, working-day, and category totals plus View, Use Template, Rename, and Delete actions.
- Rename validates required input, the 80-character maximum, and case-insensitive duplicate names.
- Successful rename states that existing Projects were not changed.
- Delete confirmation names the Template, explains irreversibility, and states that existing Projects are independent.
- All modifications are in-memory demonstration state.

## Dialog and confirmation inventory

1. **Rename Template** — input focus, impact notice, validation, Cancel, and Save new name.
2. **Discard unsaved changes?** — Keep editing is initially focused; Discard changes closes the rename without mutation.
3. **Delete Template?** — Cancel is initially focused; destructive action removes only the in-memory preview item.
4. **Leave without saving?** — protects edited save-from-Project choices.
5. **Confirm Project setup** — repeats Project, Project Type, Start Date, Template, copied Task count, and 0% progress before the non-persistent preview is confirmed.
6. **Leave Project setup?** — protects Project-specific inputs from accidental cancellation.

Escape closes non-destructive dialogs, body scrolling is locked while a modal is open, changed rename forms require a discard decision, and focus is restored to the initiating control where applicable.

## QA evidence

- Production Next.js build and TypeScript checks passed with 30 generated routes.
- Foundation suite passed 10 of 10.
- Isolated application scenario suite passed 79 of 79.
- Focused Project Templates Playwright suite passed 12 of 12 after a fresh-database rerun.
- Existing Project Types Playwright regression suite remains available separately.
- Visible human-click QA covered Login, authenticated navigation, Library layout, rename validation, unsaved changes, save-from-Project, Project setup, date/type entry, confirmation, success, and the original-Gantt boundary.
- Human QA found and fixed programmatic Login label association and missing Escape/body-scroll handling on the save-Template discard dialog.
- The Gantt component was not changed.
