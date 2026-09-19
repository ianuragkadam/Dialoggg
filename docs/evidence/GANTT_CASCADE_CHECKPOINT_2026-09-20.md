# Persistent Gantt Cascade Checkpoint — 20 September 2026

## Outcome

The existing DHTMLX Project Plan is now backed by a deterministic, tenant-scoped scheduling engine and durable schema-v11 storage. The checkpoint preserves the approved Gantt interface while making Task, hierarchy, dependency, Resource-assignment, roll-up, concurrency, and Project End Date changes persistent and atomic.

Production was not changed. This checkpoint remains behind schema versions 7–10 in the controlled deployment ledger and requires separate deployment authorization.

## Data-safety evidence

- Pre-migration backup: `data/backups/pre-gantt-cascade-2026-09-19.db`
- Backup SHA-256: `04BF95C9470DDA5D49273A886F434165D7FADFCECCF2980523EC586D12562D05`
- Backup schema: v10 (`project_lifecycle`)
- Backup verification: SQLite integrity `ok`; zero foreign-key violations
- Isolated restore target: `.tools/gantt-restore-verification-20260919`
- Restore verification: identical SHA-256, schema v10, integrity `ok`, zero foreign-key violations
- Final local schema: v11 (`gantt_plan_invariants`)
- Migration checksum: `c897e8a084141b329e65a4aba1b82099974c6ce8f591f85494208a4bdf1ea21d`
- Final local verification: integrity `ok`; zero foreign-key violations; three Projects, three protected roots, no missing or duplicate roots, no orphan parents, and no cross-Project links

## Scheduling and persistence coverage

The server owns the schedule result used by the Gantt and all downstream consumers. It implements:

- inclusive working-day calculation with independently configurable weekends;
- Finish-to-Start, Start-to-Start, Finish-to-Finish, and Start-to-Finish dependencies;
- non-negative integer lag and the latest valid constraint across multiple predecessors;
- deterministic earlier and later transitive cascade with topological cycle rejection;
- linked-Task drag review through lag calculation;
- protected Project root plus Header/leaf hierarchy and roll-ups;
- duration-weighted progress and derived Project End Date;
- optimistic Plan and Task versions;
- atomic Task and Resource-assignment writes;
- safe dependency creation and deletion;
- tenant, Role, CSRF/origin, no-store, audit, and External-view boundaries.

Project, Master, and Resource Calendars, Project event previews, Resource conflict schedules, iCal output, Project cards/details, and Project Template instantiation now consume the same working-day result.

## Requirement traceability

| Requirement family | Checkpoint evidence |
| --- | --- |
| `DG-GNT-001`–`DG-GNT-005` | One protected Project root, Header/leaf hierarchy, retained left-list/right-timeline Gantt, and weekend presentation. |
| `DG-GNT-006`–`DG-GNT-019` | Persistent conditional editor, manual start, working duration, Category, progress, Resource assignment, four dependency types, lag, multiple predecessors, and optimistic versions. |
| `DG-GNT-020`–`DG-GNT-027` | Earlier/later cascade, linked-drag lag behavior, dependency connectors, atomic rejection, resize/move/progress persistence, and double-click editing. |
| `DG-GNT-028`–`DG-GNT-036` | Root/Header roll-ups, protected and completed history, safe deletion, shared Project End Date, and consistent downstream calendar results. |
| `DG-SEC-*`, `DG-ROLE-*` | Same-company and same-Project guards, Owner/Admin mutation, Employee read-only behavior, reduced External DTOs, audit, CSRF, and no-store responses. |
| `DG-UX-005` | Responsive page controls with the retained Gantt's own horizontal timeline scrolling. |

The user-owned pre-development traceability matrix was deliberately preserved; this evidence file records checkpoint traceability without overwriting those pending edits.

## Automated verification

| Gate | Result |
| --- | --- |
| Focused Gantt engine and schema-v11 migration | 11/11 passed |
| Foundation and migration suite (`node --test tests/*.test.mjs`) | 29/29 passed on the final tree |
| Production-like API/scenario suite | 143/143 passed |
| Focused persistent Project Plan browser suite | 14/14 passed after the final UI fixes |
| Full browser regression across eleven suites | 157/157 passed |
| TypeScript | clean |
| Next.js production build | passed; 56 routes generated |
| Standalone packaging | passed on the final build |
| Locked npm 10.8.2 production audit | 0 vulnerabilities |
| Locked npm 10.8.2 full audit | 0 vulnerabilities |

The complete browser total comprises Project Types 14, Project Templates 15, Company 15, Users/Access 10, Integration Setup 16, Resources 14, Projects 16, Project Plan 14, Calendars/Events 15, Google Calendar 13, and Microsoft Storage 15.

## Visible human-click verification

Visible in-app browser QA ran against an isolated local database, not production. An Owner opened Project Plan, created and edited `Human weekend cascade`, and entered a Friday start (`2026-09-25`) with a two-working-day duration. After saving and fully reloading:

- both rapidly entered modal fields remained present;
- the Task grid showed Start `2026-09-25` and Days `2`;
- the calculated Task end was Monday `2026-09-28`;
- the Project root Days cell showed `Derived`, not misleading calendar days;
- Project End Date showed `Sep 28, 2026`.

QA found and fixed two issues before sign-off: modal updates could overwrite a recently changed sibling field because they used stale React state, and the DHTMLX Days column displayed calendar-span days instead of the server's working duration. Modal updates now use functional state transitions, and leaf rows preserve/render `working_duration`; drag resize recalculates that duration while move/progress operations preserve it. A focused browser assertion protects the two-day display.

The isolated QA server was stopped and its generated harness/data were removed after verification. The schema-v10 backup and isolated restore evidence remain intact.

## Release gate

No Railway deployment was performed. A release must follow ledger order, verify the mounted-volume backup immediately before migration, and repeat live migration, persistence, dependency/cascade, calendar, concurrency, audit, Role, and External-boundary smoke tests. The known production deployment therefore remains unchanged.
