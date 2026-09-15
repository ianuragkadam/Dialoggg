# Events and Calendar Views UI Module

Last verified: September 15, 2026

## Delivery boundary

This UI-only review module covers Event workflows and the Project Calendar, Master Calendar, and Resource Calendar. The existing FullCalendar views and persisted Task/Event feeds remain rendered below the new review controls. Review actions do not persist Event, recurrence, Resource, calendar, Project, or Google changes.

## Routes

| Route | View |
| --- | --- |
| `/projects/[id]#calendar` | Project Calendar for one accessible Project |
| `/calendar` | Master Calendar across accessible Active Projects |
| `/resources/schedule` | Resource Calendar grouped by Resource |
| `/projects/[id]#plan` | Authorized Task edits from calendar Task details return to the original Project Plan |

## Requirement traceability

| Requirement | UI coverage |
| --- | --- |
| `DG-CAL-001`–`DG-CAL-003` | Three exact calendar names, Day/Week/Month controls, company time-zone context, Project leaf Task/Event scope, and semantic Task/Event legend. |
| `DG-CAL-004`–`DG-CAL-007` | Master rollup, Project-name prefix examples, multiple Project Type filters, optional Project association, Master-only choice, and Push to Project Calendar choice. |
| `DG-CAL-008` | Task details disable calendar dragging and expose an authorized **Edit in Project Plan** route to the original Gantt. |
| `DG-CAL-009`–`DG-CAL-011` | Resource Calendar context, visible overlap details, and explicit Owner/Admin acknowledgement before an intentional double-booking. |
| `DG-CAL-012`, `DG-CAL-013` | Completed Project history is opt-in; downstream no-stale-duplicate behavior is explained for Task/Event operations. |
| `DG-EVT-001`–`DG-EVT-004` | Event is visually and semantically separate from Task; Owner/Admin Add/Edit/Delete controls; Title, Description, optional Project, multiple Resources, Color, and timing fields. |
| `DG-EVT-005`–`DG-EVT-008` | All-day/timed modes, Project-to-Master rollup, Master-only/Push behavior, and internal-only company Event explanation. |
| `DG-EVT-009` | Event drag preview always presents a destination/time confirmation and explains cancel restoration. |
| `DG-EVT-010`–`DG-EVT-014`, `FUP-007`, `FUP-008` | Daily/weekly/monthly recurrence, end date/count/no User-selected end, safe future horizon, This occurrence/Entire series edit-delete scope, company-time-zone/DST copy, and recurring Resource-conflict behavior. |
| `DG-UX-003`, `DG-UX-006`, `DG-UX-009` | Task/Event shape+text distinction, responsive calendar review controls, programmatic labels, dialog roles, keyboard Escape, visible errors, and non-color-only status. |

## Dialog and state inventory

1. Add Event — conditional Project/Push, all-day/timed, multiple Resources, Color, recurrence, and inline validation.
2. Review Event — exact calendar scope, timing, assignments, and recurrence before any apply action.
3. Task details — Task identity, schedule, Resources, no-drag rule, and original Project Plan route.
4. Event details — calendar-only boundary plus role-appropriate drag/edit/delete actions.
5. Move Event? — old/new date-time and downstream-impact confirmation.
6. Edit repeating Event — This occurrence or Entire series.
7. Delete repeating Event? — This occurrence or Entire series with explicit delete action.
8. Resource scheduling conflict — overlapping Resource/work/date-time and Owner/Admin acknowledgement.
9. Success status — explicitly confirms that production data did not change.

## Verification

- Production build and TypeScript validation pass.
- Focused Playwright suite covers 15 Event/calendar scenarios.
- Phone-width checks cover all three calendar routes.
- Existing APIs and calendar rendering remain in place; production persistence and recurrence/sync logic remain later implementation work.

