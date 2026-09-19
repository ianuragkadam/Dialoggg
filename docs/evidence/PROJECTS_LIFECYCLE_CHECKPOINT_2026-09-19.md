# Projects and Project Lifecycle Checkpoint Evidence

Date: September 19, 2026

Scope: persistent Project create/edit, Project Type and Template integration, User assignments, Start Date rebase, lifecycle, and permanent deletion

Production state: not deployed

## Outcome

The Projects UI-only workflow was replaced with tenant-safe persistence. Owner/Admin can create the complete approved Project record, choose a blank Plan or an active Project Template, assign active same-company Users, update Active Projects with optimistic concurrency, explicitly choose date-only or shift-unfinished Start Date handling, and persist Complete/Reopen/Archive/Restore. Owner alone can permanently delete an exact named Archived Project after a separate acknowledgement.

Employee remains read-only across all same-company Projects. External/Client reads remain assignment-scoped and sanitized. Compatibility Project writes now pass through the same required-field, assignment, read-only, CSRF, and optimistic-version rules instead of bypassing the v1 service.

## Requirement-ID traceability

| IDs | Acceptance evidence |
| --- | --- |
| `DG-PRJ-001`–`DG-PRJ-003`, `DG-PRJ-010`, `DG-GNT-001` | Required persisted Project/job-site/client fields; Active initial state; derived read-only End Date; original Gantt retained. |
| `DG-PRJ-004`–`DG-PRJ-008`, `DG-USR-004`–`DG-USR-006` | Real membership options and assignment persistence; Owner/Admin writes; Employee all-company read-only; assignment/company triggers and cross-tenant tests. |
| `DG-PRJ-009`, `DG-ROL-007`, `DG-ROL-008`, `FUP-003` | External assigned-only list/detail; unassigned/cross-company not found; safe serialization and navigation checks. |
| `DG-PRJ-011`–`DG-PRJ-014` | Versioned Complete/Reopen/Archive/Restore APIs, persisted timestamps/states, read-only completed/archived edit routes, legal/illegal transition migration tests. |
| `DG-PRJ-015`, `DG-PRJ-016` | Owner-only, Archived-only, exact-name plus acknowledgement deletion; Admin denial; durable audit target; browser removal/reload proof. |
| `DG-PRJ-017`, `FUP-006`, `IC-001` | Date-only leaves every Task date fixed; shift-unfinished applies weekday delta with per-Task weekend rules; 100% Tasks never move; both persist across reload. |
| `DG-PRJ-018` | Internal Note persists and is explicitly excluded from Google Calendar delivery. |
| `DG-TPL-011`–`DG-TPL-013` | Real active Template selection; transactional/idempotent Template instantiation; ordinary independent Tasks in the original Gantt. |
| `DG-ODR-012` | Lifecycle preserves Microsoft identifiers/folders and never renames or deletes them automatically. |
| `DG-UX-001`, `DG-UX-004`, `DG-UX-007`, `DG-UX-009`, `FUP-019` | Approved language, labelled controls, accessible dialogs/status, keyboard Escape, and mobile overflow checks. |

## Schema and data safety

Migration 10: `project_lifecycle_invariants`

Full checksum: `21603203e998a0c6c475b8e421446da369c957f7028b0c43db46d90ff1f405ba`

The migration:

- adds `project.updated_at` and normalizes legacy lifecycle state/timestamps;
- removes invalid pre-existing cross-company Project membership rows;
- adds `idx_project_company_status_updated`;
- enforces Active initial state;
- permits only Active → Completed/Archived, Completed → Active/Archived, and Archived → Active;
- requires Archive before Project deletion; and
- rebuilds the audit Project reference with `ON DELETE SET NULL`, retaining immutable `target_id` after permanent deletion.

The migration test directly proves invalid initial-state rejection, legal and illegal transitions, Active deletion rejection, Archived deletion success, lifecycle index presence, zero foreign-key violations, and retained audit evidence after Project deletion.

## Backup and restore evidence

Pre-migration backup: `data/backups/pre-project-lifecycle-2026-09-19.db`

- Source schema: v9
- SHA-256: `931EFE8B92D57CA0D4E8610D02073F24C7921369C13C60D407C4C4AA8D18AA72`
- SQLite integrity: `ok`
- Foreign-key violations: `0`

The restore command was exercised against `.tools/project-lifecycle-restore-verification`. It retained a pre-restore copy, reopened the restored database at schema v9, reproduced integrity `ok` and zero foreign-key violations, and left the workspace database unchanged during the isolated exercise.

When scenario testing exposed the historical audit foreign-key conflict, the workspace database was restored from the same verified v9 rollback copy before the corrected migration was reapplied. The remigrated local database is schema v10 with integrity `ok`, zero foreign-key violations, the lifecycle index/triggers present, and the audit Project delete action verified as `SET NULL`.

## Security controls verified

- Same-origin plus double-submit CSRF on every Project mutation, including explicit missing-token rejection.
- Owner/Admin authorization for create, update, assignment, and lifecycle writes.
- Owner-only permanent deletion with exact Project Name and explicit acknowledgement.
- Employee and External/Client write denial.
- Company-scoped Project, Project Type, Template, and active membership validation.
- Cross-company create assignment, update, lifecycle, and read failures.
- Optimistic update/lifecycle versions and stale-client conflict responses.
- Completed/Archived server-side read-only enforcement.
- Database transition and Archive-before-delete triggers.
- Payload-minimal create/update/lifecycle/delete audits; deletion retains immutable target ID.
- Structured errors without raw database or secret detail.

## Verification results

| Gate | Result |
| --- | --- |
| TypeScript | Passed (`tsc --noEmit`) |
| Unit/foundation/migration/backup/restore | 29/29 passed |
| Production-like API/scenario | 142/142 passed |
| Focused Projects Chromium | 16/16 passed |
| Full eleven-suite Chromium regression | 156/156 passed |
| Next.js production build | Passed; 56 application routes generated |
| Standalone static/public packaging | Passed |
| npm 10.8.2 production audit | 0 vulnerabilities |
| npm 10.8.2 full audit | 0 vulnerabilities |

The focused browser suite creates isolated Admin, Owner, Employee, External, and second-company fixtures. It performs real create-from-Template, membership assignment, complete/reopen/archive/restore, exact deletion, shift-unfinished, and date-only writes, reloads to prove persistence, checks the SQLite Task/Project rows, verifies role and External boundaries, and checks narrow/mobile overflow and signed-out routing.

Hands-on local browser verification used a separate isolated database and an Owner session. It confirmed the empty Projects state, the complete required-field create form, active same-company User assignment, the pre-save review dialog, the persisted success/detail view, the retained original Gantt, and the Active → Completed confirmation. Reloading the completed Project preserved the `Completed` state, exposed `Reopen Project`, and rendered the Project Plan read-only. The isolated QA server was stopped after verification; no production process or data was changed.

## Release boundary

Production remains on Railway deployment `0dab30fa-e3f5-4f9e-91f4-bb5bafef3635` at schema v6. The separately prepared v7/v8 release of commit `0046766` remains paused until the user explicitly authorizes the production restart and migration. This v10 checkpoint must be released only after v7, v8, and v9, with a fresh verified production-volume backup followed by readiness, role, create/edit/rebase/lifecycle/delete, and audit smoke tests.

Complete weekend-aware Gantt persistence/cascade remains the next dependency module and was not started inside this checkpoint.
