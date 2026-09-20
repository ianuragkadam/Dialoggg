# Persistent Events and Calendars Checkpoint — 20 September 2026

## Outcome

Project, Master, and Resource Calendars now read one persistent, tenant-scoped Event-series source with occurrence exceptions and Resource assignments. The checkpoint preserves the approved Calendar UI and the schema-v11 weekend-aware Gantt schedule while adding durable Event recurrence, editing, cancellation, soft deletion, conflict acknowledgement, history, concurrency, security, audit, and iCalendar behavior.

Production was not changed. Google Calendar delivery was not started. Schema v12 remains behind schema versions 7–11 in the controlled deployment ledger and requires separate deployment authorization.

## Data-safety evidence

- Pre-migration backup: `data/backups/pre-events-calendars-2026-09-20.db`
- Backup SHA-256: `E742CDED1EEB111EEFAEBD90086EF6DC6610E2F2E249DD7F16138234EF58CC59`
- Backup schema: v11 (`gantt_plan_invariants`)
- Backup verification: SQLite integrity `ok`; zero foreign-key violations
- Isolated restore target: `.tools/events-restore-verification-20260920`
- Restore verification: identical SHA-256, schema v11, integrity `ok`, zero foreign-key violations
- Final local schema: v12 (`event_calendar_invariants`)
- Migration execution: 14 ms
- Migration checksum: `d85b4873bddc5ca269234f50fd7bc898952f556c8ca30a3ce21cd8b9d95fb164`
- Final local verification: integrity `ok`; zero foreign-key violations

## Persistence and behavior coverage

The Event domain service and schema implement:

- one canonical Event series with optional Project association and multiple Resources;
- all-day or timed scheduling in the company IANA time zone;
- daily, weekly, and monthly recurrence with date, count, or bounded open horizon;
- local-wall-time preservation across daylight-saving changes;
- one-occurrence replacement or cancellation plus entire-series update or soft deletion;
- optimistic series and exception versions with safe stale-write rejection;
- atomic Task/Event Resource-conflict detection and explicit Owner/Admin acknowledgement;
- legacy Project Event compatibility and `/api/v1` aliases through the same domain service;
- Project, Master, Resource, and iCalendar expansion from the same series/exceptions;
- the unchanged shared weekend-aware Gantt result for Task dates;
- Owner/Admin mutation, Employee read-only behavior, and reduced assigned-only External/Client visibility;
- same-origin double-submit CSRF, tenant validation, `no-store`, structured safe errors, and payload-minimal audit records.

Schema-v12 triggers additionally enforce active same-company Projects and Resources, valid all-day/timed shapes, supported recurrence/end modes, valid occurrence exceptions, soft-deletion state, and same-company assignment scope.

## Requirement traceability

| Requirement family | Checkpoint evidence |
| --- | --- |
| `DG-CAL-001`–`DG-CAL-008` | Persistent Project/Master/Resource views, Day/Week/Month controls, Task/Event distinction, Project Type and completed-history filters, Master-only versus Project rollup, and original Project Plan routing. |
| `DG-CAL-009`–`DG-CAL-013` | Real Resource rows, Task/Event overlap detection, explicit durable acknowledgement, one canonical downstream record, and opt-in completed Project history. |
| `DG-EVT-001`–`DG-EVT-009` | Persistent Event identity, role-scoped create/edit/delete, complete fields, Project/Resource assignments, all-day/timed modes, visibility boundaries, and confirmed drag-to-exception writes. |
| `DG-EVT-010`–`DG-EVT-014`, `FUP-007`, `FUP-008` | Daily/weekly/monthly recurrence, date/count/open ends, occurrence versus series actions, DST-local-time preservation, and recurring conflict behavior. |
| `DG-ROLE-*`, `DG-SEC-*` | Owner/Admin mutations, Employee read-only, External/Client reduced visibility, tenant/Project/Resource guards, optimistic concurrency, audit, CSRF/origin, and `no-store`. |
| `DG-UX-003`, `DG-UX-006`, `DG-UX-009` | Non-color Task/Event semantics, responsive controls, accessible labels/dialogs/status, visible validation, and real conflict details. |

The user-owned pre-development traceability matrix was deliberately preserved; this evidence file records checkpoint traceability without overwriting those pending edits.

## Automated verification

| Gate | Result |
| --- | --- |
| Focused Event engine and schema-v12 migration | Passed inside the final 32-test foundation/migration suite |
| Foundation and migration suite (`node --test tests/*.test.mjs`) | 32/32 passed on the final tree |
| Production-like API/scenario suite | 149/149 passed |
| Focused persistent Calendar/Event browser suite | 16/16 passed after the final UI fixes |
| Full browser regression across eleven suites | 158/158 passed |
| TypeScript | clean |
| Next.js production build | passed; 60 pages generated |
| Standalone packaging | passed on the final build |
| Locked npm 10.8.2 production audit | 0 vulnerabilities |
| Locked npm 10.8.2 full audit | 0 vulnerabilities |

The complete browser total comprises Project Types 14, Project Templates 15, Company 15, Users/Access 10, Integration Setup 16, Resources 14, Projects 16, Project Plan 14, Calendars/Events 16, Google Calendar 13, and Microsoft Storage 15. The first Project Types run hit a transient focus timing assertion; its immediate isolated rerun passed 14/14, and every remaining suite completed green.

The final Calendar rerun also exercises the official FullCalendar Luxon 3 named-time-zone adapter and asserts that a 2:00 PM `America/New_York` Event renders at `2p` even when the browser host uses a different time zone. This closes the grid-level browser-zone defect in addition to the already verified company-zone detail formatting.

## Visible human-click verification

Visible in-app browser QA ran against an isolated local schema-v12 database, not production. An Admin opened Master Calendar and confirmed the Add Event form used the actual `Human Calendar Court` Project and `Human Crew` Resource. The Admin prepared `Human recurring conflict QA`, a weekly timed Event at 2:00–3:00 PM on 22 September 2026 in `America/New_York`, assigned `Human Crew`, and reviewed the real conflict with Task `Human conflict task`.

After explicit acknowledgement and save:

- the Event appeared as `Human recurring conflict QA (Human Calendar Court)` after refresh;
- the isolated database retained an active weekly series with five occurrences;
- exactly one conflict acknowledgement was stored;
- Event details showed `Sep 22, 2026, 2:00 PM` to `3:00 PM · America/New_York`;
- the entire-series editor loaded the raw title `Human recurring conflict QA`, without appending the Project display suffix.

QA found and fixed three issues before sign-off: the form originally showed prototype Project/Resource choices, the conflict dialog used prototype names instead of API conflict details, and Event details/editor/grid used the browser-zone display title/time rather than the company-zone time and raw Event title. The form now uses live tenant data, conflicts render the actual Resource, Task/Event, occurrence time and Project, editing preserves the canonical title, and all FullCalendar surfaces receive the company IANA zone through the Luxon adapter.

The generated QA server and data were stopped and removed after verification. The schema-v11 backup and isolated restore evidence remain intact.

## Release gate

No Railway deployment was performed. A release must follow ledger order, verify the mounted-volume backup immediately before migration, and repeat live series/exception persistence, recurrence/DST, conflict acknowledgement, calendar/feed, concurrency, audit, Role, External-visibility, and restart/readiness smoke tests. The known production deployment therefore remains unchanged.
