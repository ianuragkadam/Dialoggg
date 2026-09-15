# Resources and Fixed Resource Categories UI Module

Last verified: September 15, 2026

## Delivery boundary

This is a detailed UI-only review module for company Resources. It demonstrates the approved fixed Categories, Resource creation and editing, optional one-to-one User linkage, Task/Event schedule visibility, schedule-conflict acknowledgement, and deactivate/restore behavior. Preview actions do not persist Resources, links, assignments, calendars, feeds, Users, or notifications; state resets on refresh.

The module keeps **User** and **Resource** separate: a Resource can be scheduled but cannot log in. Scott's completed follow-up choices are applied, including one-to-one User/Resource linkage, conflict warning with explicit acknowledgement, and historical preservation on deactivation.

## Requirement traceability

| Requirement | UI coverage |
| --- | --- |
| `DG-RES-001`, `DG-RES-002` | The directory and form identify Resources as schedulable people, subcontractors, suppliers, equipment, or other capacity and explicitly state that a Resource receives no login access. |
| `DG-RES-003` | Add and Edit require a Resource Name and exactly one Category; invalid optional contact email is rejected. |
| `DG-RES-004`, `DG-OOS-002` | Only Employee, Subcontractor, Supplier, Equipment, and Other appear. No add, rename, delete, or custom-category builder is offered. |
| `DG-RES-005` | Owner/Admin edit preview updates display values without replacing schedule identity. Final persistence and cross-company API validation remain pending. |
| `DG-RES-006`, `DG-USR-007`, `FUP-010` | Add and detail flows explain and demonstrate an optional one-to-one company-scoped User link. Already-linked Jamie Morgan is excluded from the available User choices. Resource/User lifecycle remains independent. |
| `DG-RES-007`, `DG-RES-008` | Resource detail presents both Task and Event assignments and links to the Resource Calendar. Final assignment editors and Event persistence remain pending. |
| `DG-RES-009`, `DG-RES-010`, `FUP-011` | Deactivate confirmation removes the Resource from new assignments while preserving historical Task/Event and calendar records. Restore is available and never changes the linked User automatically. |
| `DG-RES-011` | All three routes require authentication and resolve the current company role. Unknown Resource IDs return not found. Final persisted tenant isolation remains enforced by the backend phase. |
| `FUP-009` | A visible schedule-conflict alert names the overlapping Task and Event and requires explicit acknowledgement instead of silently blocking every overlap. |
| `DG-ROL-005`, `DG-ROL-006`, `DG-UX-001` | Owner/Admin receives management controls; Employee receives a read-only Resource directory/detail; approved capitalization and terminology are used throughout. |
| `DG-UX-004`, `DG-UX-007`, `DG-UX-009`, `FUP-019` | Responsive layouts avoid phone-width page overflow. Controls have distinct accessible names, dialogs use dialog/alertdialog semantics, and statuses never rely on color alone. |

## Routes and access

| Route | Purpose | Signed out | Employee | Owner/Admin |
| --- | --- | --- | --- | --- |
| `/resources` | Search/filter the company Resource directory and review lifecycle actions | Redirect to Login | Read-only | Full UI preview |
| `/resources/new` | Configure and review a Resource | Redirect to Login | Restricted state | Full UI preview |
| `/resources/[id]` | Review details, User link, schedule, conflict, edit, and lifecycle | Redirect to Login | Read-only | Full UI preview; unknown IDs are 404 |

## Resource directory states

- Summary cards show Resources, Active, Linked Users, and Schedule conflicts.
- Search matches name, email, or Category without case sensitivity.
- Category filter contains only the five approved fixed Categories.
- Status filter contains Active and Inactive.
- No matching Resources explains the outcome and offers **Clear filters**.
- Each record shows Name, contact email, Category, status, linked User, and **View**.
- Owner/Admin lifecycle buttons include the Resource name in their accessible label, such as **Deactivate Jamie Morgan**.
- Employee sees the same review information without add, deactivate, restore, edit, or link controls.

## Add Resource states

1. **Empty form** — Resource Name and Category errors appear together.
2. **Duplicate Resource Name** — existing preview names are rejected case-insensitively.
3. **Optional contact validation** — invalid email is rejected; blank email and phone are allowed.
4. **Fixed Category** — exactly one approved Category is required.
5. **Optional linked User** — available company Users may be selected; already-linked Users are unavailable.
6. **Review** — exact Name, Category, contact values, and linked User are repeated before confirmation.
7. **Back to edit / Escape** — review closes without losing values.
8. **Leave Resource setup?** — protects a changed form and confirms that nothing was created.
9. **Resource preview complete** — explicitly states that no Resource, User link, assignment, calendar, or feed was created.

## Resource detail and conflict states

- Details show Resource Name, Category, status, contact email, and phone.
- Edit validates required Name and optional email before updating the in-memory preview.
- Linked User explains the one-to-one rule and can be changed or removed in an exact review dialog.
- Schedule contains both Task and Event examples and retains historical visibility messaging.
- An overlap carries a non-color **Schedule conflict** label and **Review conflict** action.
- The alert names both conflicting items, offers **Go back**, and requires **Proceed in UI preview** acknowledgement.
- Conflict copy is product-neutral and does not expose stakeholder workshop language.

## Lifecycle confirmations

- **Deactivate Resource?** states that new Task/Event assignment stops while historical assignments, Resource Calendar history, and the Resource name remain visible.
- **Restore Resource?** states that the Resource becomes available for new assignments again.
- Both confirmations state that a linked User is never deactivated or restored automatically.
- Safe cancellation is available before every lifecycle preview action.

## QA evidence

- Production build and TypeScript validation passed with 55 generated application routes, including all three Resource UI routes.
- Foundation suite passed 13 of 13 checks.
- Isolated application suite passed 93 of 93 scenarios, including authentication, Admin access, Employee restriction, and unknown-Resource handling.
- Focused Resources Playwright suite passed 17 of 17 scenarios.
- Human-click QA covered Login, authenticated navigation, the five fixed Categories, distinct lifecycle-control names, Add Resource validation and exact review, linked User choice, Task/Event schedule details, and the conflict warning.
- Human testing found ambiguous repeated lifecycle button names and stakeholder-specific conflict copy. Resource names were added to accessible button labels, the copy was made product-neutral, regression tests were added, and automated plus human retesting passed.
- The existing original `GanttChart` was not edited or replaced.

## Data wiring intentionally deferred

The backend phase must persist Resource lifecycle and contact data, seed/lock fixed Categories, enforce the one-to-one User relationship and company boundary, support multiple Resource assignments on Tasks and Events, reject new assignments to inactive Resources, preserve historical identifiers, audit changes, and connect Resource Calendar and Google synchronization. The current UI does not claim these production behaviors are complete.
