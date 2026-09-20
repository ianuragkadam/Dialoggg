# Events and Calendar Views UI Module

Last verified: September 20, 2026

## Delivery boundary

This module now persists one canonical Event series plus occurrence exceptions and Resource assignments for the Project Calendar, Master Calendar, Resource Calendar, and iCalendar feeds. The retained FullCalendar views consume the same Event source and the shared weekend-aware Gantt Task result. Google delivery is intentionally outside this checkpoint.

Owner/Admin can create, edit, move, cancel one occurrence, or delete an entire Event series. Employee is read-only. External/Client receives only assigned Project Events explicitly marked for Project and external visibility. All mutation routes are tenant-scoped, CSRF/origin protected, audited, optimistic-versioned, and `no-store`.

## Routes

| Route | View |
| --- | --- |
| `/projects/[id]#calendar` | Project Calendar for one accessible Project |
| `/calendar` | Master Calendar across accessible Active Projects |
| `/resources/schedule` | Resource Calendar grouped by Resource |
| `/projects/[id]#plan` | Authorized Task edits from calendar Task details return to the original Project Plan |

The canonical APIs are `/api/events`, `/api/events/[seriesId]`, `/api/events/[seriesId]/exceptions`, `/api/calendar`, and `/api/resources/schedule`, with equivalent `/api/v1` aliases. The legacy Project Event route writes through the same Event-series domain service.

## Requirement traceability

| Requirement | UI coverage |
| --- | --- |
| `DG-CAL-001`–`DG-CAL-003` | Three exact calendar names, Day/Week/Month controls, company time-zone context, Project leaf Task/Event scope, and semantic Task/Event legend. |
| `DG-CAL-004`–`DG-CAL-007` | Master rollup, Project-name prefix examples, multiple Project Type filters, optional Project association, Master-only choice, and Push to Project Calendar choice. |
| `DG-CAL-008` | Task details disable calendar dragging and expose an authorized **Edit in Project Plan** route to the original Gantt. |
| `DG-CAL-009`–`DG-CAL-011` | Resource Calendar context, live Task/Event overlap details, atomic conflict rejection, and durable Owner/Admin acknowledgement before an intentional double-booking. |
| `DG-CAL-012`, `DG-CAL-013` | Completed Project history is opt-in; Project, Master, Resource, and iCalendar consumers expand the same series and exceptions without stale duplicates. |
| `DG-EVT-001`–`DG-EVT-004` | Event is a persistent record separate from Task; Owner/Admin Add/Edit/Delete controls persist Title, Description, optional Project, multiple Resources, Color, and timing fields. |
| `DG-EVT-005`–`DG-EVT-008` | All-day/timed modes, Project-to-Master rollup, Master-only/Push behavior, and internal-only company Event explanation. |
| `DG-EVT-009` | Event drag always confirms the destination/time, writes a replacement occurrence, checks Resource conflicts, and restores the original position on cancel or failure. |
| `DG-EVT-010`–`DG-EVT-014`, `FUP-007`, `FUP-008` | Daily/weekly/monthly recurrence, end date/count/open horizon, occurrence exceptions, Entire-series changes, company-time-zone/DST preservation, and recurring Resource-conflict behavior. |
| `DG-UX-003`, `DG-UX-006`, `DG-UX-009` | Task/Event shape+text distinction, responsive calendar review controls, programmatic labels, dialog roles, keyboard Escape, visible errors, and non-color-only status. |

## Dialog and state inventory

1. Add Event — live Project and Resource choices, conditional Push, all-day/timed modes, Color, recurrence, and inline validation.
2. Review Event — exact calendar scope, timing, assignments, and recurrence before persistence.
3. Task details — Task identity, schedule, Resources, no-drag rule, and original Project Plan route.
4. Event details — calendar-only boundary plus role-appropriate drag/edit/delete actions.
5. Move Event? — explicit destination/time confirmation before a persisted occurrence replacement.
6. Edit repeating Event — This occurrence or Entire series, using the raw Event title and company-time-zone display.
7. Delete repeating Event? — cancel one occurrence or soft-delete the entire series.
8. Resource scheduling conflict — actual Resource, conflicting Task/Event, occurrence time, Project, and durable Owner/Admin acknowledgement.
9. Success status — confirms the canonical Event source was saved and all applicable calendars refreshed.

## Verification

- Schema v12 (`event_calendar_invariants`) applies in 14 ms with checksum `d85b4873bddc5ca269234f50fd7bc898952f556c8ca30a3ce21cd8b9d95fb164`; integrity is `ok` and foreign-key violations are zero.
- The Event engine covers recurrence, DST-local-time preservation, exceptions, conflicts, history, and optimistic concurrency.
- Final verification passes 32/32 unit/foundation/migration tests, 149/149 production-like scenarios, 16/16 focused calendar browser cases, and 158/158 browser cases across all eleven suites.
- TypeScript, the 60-page production build, standalone packaging, and locked npm 10.8.2 production/full audits pass; both audits report zero vulnerabilities.
- Visible local QA persisted a weekly timed Event, displayed the real Resource/Task conflict at the correct New York time, recorded one acknowledgement, reloaded the Event, and verified its raw title and company-time-zone details.
- Production remains unchanged; the schema-v12 checkpoint is pending behind schema v7–v11.
