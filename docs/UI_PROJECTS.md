# Projects, Access Views, and Project Lifecycle

Last verified: September 19, 2026

## Delivery boundary

Projects and Project lifecycle are persistent and company-scoped. Owner/Admin can create and edit the complete approved Project record, choose a blank Plan or an active company Project Template, assign active company Users, choose explicit Start Date rebase behavior, and manage the approved lifecycle. Employee remains company-wide read-only. External/Client sees only assigned Projects through a sanitized view.

The existing `GanttChart` remains the internal **Project Plan**. This checkpoint does not implement the later complete weekend-aware Gantt cascade engine, Event recurrence, Google delivery workers, or Microsoft Graph operations. Project lifecycle preserves their existing identifiers and records.

## Requirement traceability

| Requirement | Persistent acceptance evidence |
| --- | --- |
| `DG-PRJ-001`, `DG-GNT-001` | One Project retains one job-site, Project Plan, and Project Calendar context; internal detail continues to load the original Gantt. |
| `DG-PRJ-002`, `DG-PRJ-010` | Create/update APIs and browser validation require Project Name, Client Name, Client Email, Address, City, State, Zip, Phone Number, Project Type, and Project Start Date. New Projects start Active. |
| `DG-PRJ-003` | Project End Date remains read-only and derived from scheduled leaf Tasks. |
| `DG-PRJ-004` | Owner/Admin create, edit, complete, reopen, archive, and restore. Employee has read-only company visibility. External/Client has no management controls. |
| `DG-PRJ-005`, `DG-USR-004`–`DG-USR-006` | Create/edit loads real active company memberships and persists tenant-safe assignments. The acting Owner/Admin remains assigned. External access is assignment-scoped. |
| `DG-PRJ-006`, `DG-PRJ-007` | Directory rows, counts, search, status filters, and real multi-select Project Type filters use persisted records. |
| `DG-PRJ-008` | Employee reads every same-company Project, assigned or not, and receives 403 on Project mutations. |
| `DG-PRJ-009`, `DG-ROL-007`, `DG-ROL-008`, `FUP-003` | External/Client list/detail queries require Project assignment; unassigned and cross-company IDs return not found; internal fields and Private access remain absent. |
| `DG-PRJ-011`–`DG-PRJ-013` | Complete timestamps and versions the Project, makes it read-only, preserves dependent data, and permits only Reopen or Archive. Reopen returns it to Active. |
| `DG-PRJ-014` | Archive is recoverable, preserves Project-owned data, and permits Restore to Active. Migration 10 rejects invalid transitions. |
| `DG-PRJ-015`, `DG-PRJ-016` | Permanent deletion is Owner-only, Archive-only, requires exact Project Name plus acknowledgement, cascades Project-owned Dialoggg rows, and preserves audit history. |
| `DG-PRJ-017`, `FUP-006`, `IC-001` | A changed Start Date requires date-only or shift-unfinished. Date-only leaves every Task date unchanged. Shift-unfinished applies the same weekday delta using each Task's weekend rules. Completed Tasks never move. |
| `DG-PRJ-018` | Internal Note is persisted but remains excluded from Google Calendar content. |
| `DG-TPL-011`–`DG-TPL-013` | Create loads real active Templates. Template instantiation is transactional/idempotent and its copied Tasks become ordinary independent Tasks in the original Gantt. |
| `DG-ODR-012` | Lifecycle actions preserve Microsoft folder references; Dialoggg does not rename or delete Microsoft folders automatically. |
| `DG-UX-001`, `DG-UX-004`, `DG-UX-007`, `DG-UX-009` | Approved names, labelled controls, keyboard Escape, accessible dialogs/status, non-color state, and phone-width overflow checks pass. |

## Routes and authorization

| Route/API | Employee | External/Client | Owner/Admin |
| --- | --- | --- | --- |
| `/projects` | All company Projects, read-only | Assigned Projects only | Full directory and Add Project |
| `/projects/new` | Restricted | Restricted | Persistent create |
| `/projects/[id]` | Internal read-only | Assigned sanitized view | Detail and lifecycle |
| `/projects/[id]/edit` | Restricted | Restricted | Active Projects only |
| `POST /api/v1/projects` | 403 | 403 | Required-field create with assignment and optional Template validation |
| `PUT /api/v1/projects/[id]` | 403 | 403 | Active-only optimistic update and explicit rebase mode |
| `PATCH /api/v1/projects/[id]/lifecycle` | 403 | 403 | Versioned approved transition |
| `DELETE /api/v1/projects/[id]` | 403 | 403 | Owner-only exact-name deletion after Archive |

All mutations require same-origin plus double-submit CSRF validation. Company/type/membership scope is checked before persistence, responses use structured safe errors, and successful writes create payload-minimal audit events.

## Persistence and lifecycle behavior

- Migration 10 adds `project.updated_at`, normalizes lifecycle state/timestamps, removes invalid cross-company assignments, and adds the company/status/update index.
- Database triggers require Active initial state, permit only Active → Completed/Archived, Completed → Active/Archived, and Archived → Active, and require Archive before delete.
- Project and Project membership updates are transactional.
- Update and lifecycle APIs use `project.version`; stale clients receive `PROJECT_VERSION_CONFLICT` or `PROJECT_LIFECYCLE_CONFLICT`.
- Completed and Archived Projects are server-side read-only, not merely hidden in the UI.
- Audit Project references use `ON DELETE SET NULL`; immutable `target_id` retains the deleted Project ID after permanent deletion.
- The compatibility Project write APIs pass through the same required-field, assignment, lifecycle/read-only, CSRF, and optimistic-version rules.

## Start Date rebase

When an Active Project Start Date changes, the user must choose:

1. **Change Project Date only** — save the Project date and leave all Task dates unchanged.
2. **Shift unfinished Tasks** — calculate the weekday delta between old and new Project dates, then shift only Tasks with progress below 100% using each Task's Saturday/Sunday rules.

Both operations run transactionally with the Project update. Browser persistence checks prove that completed Task dates remain fixed and that reloaded Project/Task dates match the selected mode.

## Data safety and verification

Pre-migration backup: `data/backups/pre-project-lifecycle-2026-09-19.db`

- Source schema: v9
- SHA-256: `931EFE8B92D57CA0D4E8610D02073F24C7921369C13C60D407C4C4AA8D18AA72`
- SQLite integrity: `ok`
- Foreign-key violations: `0`
- Isolated restore: passed under `.tools/project-lifecycle-restore-verification`

The local workspace database is schema v10 with checksum `21603203e998a0c6c475b8e421446da369c957f7028b0c43db46d90ff1f405ba`, integrity `ok`, zero foreign-key violations, the lifecycle index/triggers present, and audit Project deletion set to `SET NULL`.

## QA evidence

- Unit/foundation/migration/backup/restore: **29/29**.
- Production-like API/scenario gate: **142/142**.
- Focused Projects Chromium: **16/16**.
- Full eleven-suite Chromium regression: **156/156**.
- TypeScript, Next.js production build (56 routes), and standalone packaging passed.
- Production and full dependency audits use the locked npm 10.8.2 runtime; final results are recorded in the checkpoint evidence.

Detailed evidence: [Projects and lifecycle checkpoint](evidence/PROJECTS_LIFECYCLE_CHECKPOINT_2026-09-19.md).
