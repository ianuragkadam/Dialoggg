# Project Templates Module

Last verified: September 17, 2026

## Delivery boundary

Project Templates are persistent and tenant-scoped locally. Owner/Admin can save a current company Project Plan, inspect its read-only content, rename or delete it, and atomically create an independent Project from it. Employee (Internal) and External/Client cannot access Template data or APIs. Production deployment remains deferred in `docs/evidence/PENDING_DEPLOYMENT_LEDGER.md`.

The existing original `GanttChart` remains Dialoggg's Project Plan engine. Template code does not import, replace, or render another Gantt. A Project created from a Template opens at `/projects/[id]#plan`.

## Requirements traceability

| Requirement | Implemented evidence |
| --- | --- |
| `DG-TPL-001` | Owner/Admin save API and live `/templates/new` form accept only an editable same-company source Project; Employee/External are denied. |
| `DG-TPL-002` | One transaction snapshots Task names, hierarchy, Header/leaf type, working-day duration, dependencies, and category defaults. |
| `DG-TPL-003` | Per-Task colors and Saturday/Sunday rules are stored and copied into ordinary Tasks. |
| `DG-TPL-004` | Each Task stores a non-negative relative working-day offset from Project Start; disconnected Tasks and branches retain their anchors. |
| `DG-TPL-005` | Instantiation always writes Task progress as `0`, independent of source progress. |
| `DG-TPL-006`, `FUP-004` | Resource Categories always snapshot; exact Resource IDs snapshot only when the explicit save-time switch is enabled, off by default. |
| `DG-TPL-007` | Missing/inactive Resources and missing/remapped Categories never create cross-company references or abort instantiation; the response and success UI show actionable warnings. |
| `DG-TPL-008` | Active Templates are company-scoped and names are whitespace-normalized, limited to 80 characters, and unique per company without case sensitivity. |
| `DG-TPL-009` | Tenant-scoped list/detail/rename/delete APIs back the Library; delete requires UI confirmation and leaves created Projects unchanged. |
| `DG-TPL-010` | Detail is read-only; Plan content changes require saving a new Template from a Project Plan. |
| `DG-TPL-011` | Use flow requires one valid active same-company Project Type and a valid Project Start Date before confirmation. |
| `DG-TPL-012` | Instantiation calculates offsets, chains, branches, all four dependency types, non-negative working-day lag, and per-Task weekend rules inside one transaction. |
| `DG-TPL-013` | Instantiated rows are ordinary `project`, `task`, `task_link`, and `task_resource` records; later Project edits cannot mutate Template rows. |

## Routes and authorization

| Route | Purpose | Signed-out | Employee / External | Owner / Admin |
| --- | --- | --- | --- | --- |
| `/templates` | Company Template Library | Redirect to Login | Restricted; no Template data | Live Library |
| `/templates/new` | Save a Project Plan | Redirect to Login | Restricted | Persistent save form |
| `/templates/[id]` | Read-only saved Plan | Redirect to Login | Restricted | Same-company detail or 404 |
| `/templates/[id]/use` | Create a Project from a Template | Redirect to Login | Restricted | Validated confirmation and atomic creation |
| `/api/v1/project-templates` | List/source list and save | 401 | 403 | Tenant-scoped GET/POST |
| `/api/v1/project-templates/[id]` | Read, rename, delete | 401 | 403 | Tenant-scoped GET/PUT/DELETE |
| `/api/v1/project-templates/[id]/instantiate` | Create independent Project Plan | 401 | 403 | Tenant-scoped POST |

All mutations require the authenticated CSRF token and record audit events. Creation and instantiation use client-generated idempotency keys so safe retries do not duplicate Templates or Projects.

## Save and use semantics

- Save rejects invalid durations, negative offsets, negative/unknown link values, Header-linked dependencies, missing/non-Header parents, dependency cycles, and hierarchy cycles without leaving partial rows.
- Source Project dates become relative working-day offsets. Fixed source dates, progress, Project status, Events, and client/job-site details are not Template content.
- Instantiation validates Template, Project Type, Project name, and Start Date before opening a transaction.
- Dependency calculations support Finish-to-Start, Start-to-Start, Finish-to-Finish, and Start-to-Finish. Multiple predecessor constraints use the latest valid start.
- Duration is inclusive in allowed working days. Finish-to-Start `+0` starts on the next working day, and lag counts the dependent Task's working days.
- Parent references and dependencies are rebuilt with new Task IDs. Exact Resources are attached only when still active and in the same company.
- Delete cascades only Template-owned snapshots and idempotency metadata; previously created Projects and their Tasks remain intact.

## Migration and rollback

Migration 6, `project_template_invariants`, adds source-name/idempotency snapshots, Task category linkage, Template indexes, retry metadata, and database triggers for tenant source/creator scope, non-negative offsets, dependency references, and same-company Task categories.

The local pre-migration rollback copy is `data/backups/pre-project-templates-2026-09-17.db` (Git-ignored), SHA-256 `E4AD20BE7A5BC24D85F3AC9F8E4858EC6C8100E325B5F2E9DFAE9D47941E9EFC`. It is schema version 5 with integrity `ok` and zero foreign-key violations. The migrated local database is schema version 6 with integrity `ok`, zero foreign-key violations, zero invalid Template/source relationships, and zero invalid Task/category relationships.

## QA evidence

- Unit/foundation/migration: **24 passed, 0 failed**.
- API/scenario: **133 passed, 0 failed**.
- Focused Project Templates Chromium: **15 passed, 0 failed**, including real Admin/Owner persistence, refresh, instantiation, independence after delete, and Employee/External denial.
- Complete ten-suite Chromium regression: **152 passed, 0 failed**.
- TypeScript: passed.
- Next.js production build: passed with 50 routes.
- Standalone asset packaging: passed.
- Original `src/components/GanttChart.tsx`: unchanged.
