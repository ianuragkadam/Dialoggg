# Project Plan / Gantt Workflow UI Module

Last verified: September 20, 2026

## Delivery boundary

The original DHTMLX `GanttChart` remains the internal Project Plan and is now persistent. Owner/Admin edits in the live Gantt call tenant-scoped, CSRF-protected APIs; Task, Resource-assignment, dependency, cascade, roll-up, Plan-version, and Project End Date updates commit atomically. Employee is read-only. External/Client receives only its assigned Project, visible Tasks plus the Project root needed for hierarchy, no dependency graph, and no internal version/category/start-mode fields.

The scheduling-reference layer above the Gantt explains the approved rules; it is not the write surface. Real edits happen in the live Gantt below it. The server owns schedule calculation so Gantt, Project dates, Project/Master/Resource Calendars, Resource conflict views, and iCal feeds consume the same weekend-aware result.

## Persistent scheduling contract

- Schema v11 adds `project.plan_version`, protected root Tasks, Task optimistic versions/manual starts, normalized hierarchy and dependency indexes, and database triggers for root/Header/completed-history, leaf-only dependency, same-Project, valid-link-type, non-negative-integer-lag, and Header-resource invariants.
- Every Project has exactly one immutable root Header. Ordinary top-level Tasks are parented to it; root/Header dates and progress are derived and direct Resources/dependencies are forbidden.
- Leaf duration is inclusive working days. Saturday and Sunday are independent per Task. Finish-to-Start, Start-to-Start, Finish-to-Finish, and Start-to-Finish links accept non-negative whole working-day lag.
- Multiple predecessors use the latest applicable constraint. Cycles and invalid cross-Project/Header/self/duplicate links fail atomically. Recalculation propagates earlier or later through the complete graph.
- A linked drag adjusts the controlling dependency lag when one unambiguous non-negative result exists; otherwise the edit is rejected with an explicit review message. Completed Task schedule history is immutable.
- Header/root spans, duration-weighted progress, and Project End Date roll up from leaf Tasks. Calendar JSON and iCal use exclusive end dates derived from the same inclusive working-day Task end.
- Plan and Task optimistic versions reject stale writes. All mutation responses use `no-store`, structured safe errors, and payload-minimal audit events.

## API surface

- `GET /api/v1/projects/{projectId}/plan` returns the canonical Plan. External serialization is reduced to safe Project and visible Task fields.
- `GET|POST /api/projects/{projectId}/tasks` and `PUT|DELETE /api/projects/{projectId}/tasks/{taskId}` back the retained Gantt editor.
- `POST|DELETE /api/projects/{projectId}/links[/linkId]` persists dependency creation/removal. Link type and lag are selected before creation; changes can be applied by replacing the dependency atomically.
- Task create/update accepts Resource IDs in the same transaction. The separate Task Resource route remains tenant-scoped and rejects protected/non-writable Tasks.

## Requirement traceability

| Requirement | UI coverage |
| --- | --- |
| `DG-GNT-001`–`DG-GNT-005` | Shows the single Project Plan, protected Project root, nested Header/leaf hierarchy, and explicitly retains the original left-list/right-timeline Gantt with weekend presentation. |
| `DG-GNT-006`–`DG-GNT-013` | Full Task editor review includes Task Name, Header/leaf choice, parent, Time Period/Link start method, Start Date, integer Duration, inclusive End Date, independent Saturday/Sunday rules, Resource Category, multiple Resources, Color, Progress, save/cancel/delete paths, and validation. |
| `DG-GNT-014`–`DG-GNT-019`, `FUP-005` | Dependency review includes all four link types, multiple predecessors, latest-constraint-wins copy, non-negative integer lag, dependent-Task working-day language, and next-allowed-workday zero-lag Finish-to-Start examples. |
| `DG-GNT-020`–`DG-GNT-027` | UI explains earlier/later transitive cascades, linked-Task drag-to-lag behavior, identical editor/bar link creation, connector behavior in the retained Gantt, atomic invalid-link rejection, bar/edge/progress dragging, and double-click editing. |
| `DG-GNT-028`–`DG-GNT-034` | Header/root review covers derived dates, duration-weighted progress, no direct Resources/dependencies, child-safe deletion block, Project End Date roll-up, safe link cleanup, and one shared scheduling result across every downstream surface. |
| `DG-ROL-004`, `DG-ROL-005`, `DG-ROL-008` | Owner/Admin sees workflow controls, Employee receives read-only Project Plan controls, and the previously delivered External/Client view remains separate and safe. |
| `DG-UX-005` | Responsive control layer avoids page-level phone overflow while the original Gantt retains its own horizontally scrollable timeline. |

## Dialog and interaction inventory

1. Add Task / Review Header Task — conditional full editor with inline validation.
2. Review Task schedule — rule preview above the live persistent Gantt.
3. Create dependency — the live Gantt connector captures predecessor, dependent Task, type, lag, and atomic validation boundaries.
4. Scheduling guide — six plain-language scheduling examples.
5. Root Header Task is protected — immutable root explanation.
6. Header Task cannot be deleted — child-preservation block.
7. Delete Task? — incoming/outgoing link cleanup and recalculation confirmation.
8. Live Gantt status messages — confirm saved recalculation or return a safe actionable conflict without partial writes.

## Verification

- Schema-v10 rollback backup and isolated restore verification pass before migration 11.
- The focused scheduling-engine/migration suite passes 11/11, including all four dependency types, weekend rules, multiple predecessors, earlier/later cascade, cycles, roll-ups, deletion guards, and concurrency.
- The production-like API suite passes 143/143, including persistent Task/link writes, cycle rejection, tenant and Role denial, and shared weekend-aware downstream calendar results.
- Focused persistent Project Plan Playwright coverage passes 14/14; the complete eleven-suite browser matrix passes 157/157.
- TypeScript, the 56-route Next.js production build, standalone packaging, and production/full dependency audits pass before checkpoint commit.
- Human click-through QA is performed against an isolated local database after automated QA; production is unchanged until separately authorized.
