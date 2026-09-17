# Project Templates Checkpoint — 17 September 2026

**Scope:** `DG-TPL-001` through `DG-TPL-013`, `FUP-004`, and the Template portions of `DG-NFR-003`, `DG-NFR-004`, `DG-NFR-007`, `DG-NFR-012`, and `DG-OPS-012`. This is a locally verified backend/UI checkpoint. Production deployment is deferred by explicit instruction and is not claimed here.

## Outcome

The former hard-coded Template demonstration is now a persistent company workflow. Owner/Admin can save a live Project Plan, view the complete read-only snapshot, rename/delete it, and create an independent Project Plan. Employee and External/Client receive no Template data. Mutations use CSRF protection, tenant predicates, database guards, audit events, atomic transactions, and retry idempotency.

The snapshot preserves hierarchy, Header/leaf structure, duration, relative working-day offsets, dependency graph and non-negative lag, colors, Saturday/Sunday rules, Resource Category names, and optional exact Resource IDs. Instantiation recalculates offsets, chains, branches, all four dependency types, multiple predecessors, and weekend rules from the selected Start Date; it resets all progress to zero. Invalid/missing defaults are omitted or remapped without creating cross-company references, with visible warnings.

## Requirement evidence

| IDs | Result | Authoritative evidence |
| --- | --- | --- |
| `DG-TPL-001`, `DG-TPL-008` | Implemented and tested | Owner/Admin save, company source lookup, normalized unique name, two-tenant API isolation, Employee/External denial, and refresh persistence. |
| `DG-TPL-002`–`DG-TPL-005` | Implemented and tested | Transactional Task/Header/hierarchy/dependency snapshot, per-Task offsets/durations/colors/weekends, complete detail rows, and progress reset assertions. |
| `DG-TPL-006`, `FUP-004`, `DG-TPL-007` | Implemented and tested | Categories always snapshot; exact Resources are off by default and optional; inactive/missing Resources are omitted with warnings; category mapping remains company-scoped. |
| `DG-TPL-009`, `DG-TPL-010` | Implemented and tested | Persistent view/rename/delete, case-insensitive conflict, confirmation, read-only detail, and no dedicated schedule editor. |
| `DG-TPL-011`–`DG-TPL-013` | Implemented and tested | Valid Project Type/Start Date confirmation, atomic instantiation, all dependency types and branches, ordinary editable Task rows, and independence after Template rename/delete. |
| `DG-NFR-003`, `DG-NFR-004`, `DG-NFR-007` | Implemented for this module | Save/use transactions roll back together; migration/API tenant and reference guards reject invalid relationships; creation and use retries replay existing results. |
| `DG-NFR-012`, `DG-OPS-012` | Implemented for Template instantiation | Production-like scenarios assert deterministic FS/SS/FF/SF, multiple-predecessor branch, independent weekend offset, progress reset, hierarchy, and exact-Resource behavior. |

## Migration and rollback evidence

- Migration: version 6, `project_template_invariants`.
- Checksummed migration applied locally from v5 to v6; a second run reported the schema current at v6.
- Rollback copy: `data/backups/pre-project-templates-2026-09-17.db` (Git-ignored).
- Rollback SHA-256: `E4AD20BE7A5BC24D85F3AC9F8E4858EC6C8100E325B5F2E9DFAE9D47941E9EFC`.
- Rollback copy: version 5, integrity `ok`, zero foreign-key violations.
- Migrated database: version 6, integrity `ok`, zero foreign-key violations, zero invalid Template/source relationships, and zero invalid Task/category relationships.
- Migration isolation tests cover cross-company creator/source rejection, negative offsets, invalid dependency references, and cross-company Task category rejection.

Production startup remains fail closed and must create and verify its own mounted-volume backup immediately before migration. A code rollback alone does not revert volume data.

## Verification record

- Unit/foundation/migration: **24 passed, 0 failed**.
- API/scenario: **133 passed, 0 failed**.
- Project Templates browser: **15 passed, 0 failed**.
- Remaining nine browser suites: **137 passed, 0 failed**.
- Whole browser regression: **152 passed, 0 failed**.
- TypeScript: passed.
- Next.js production build: passed with 50 routes.
- Standalone asset packaging: passed.
- Original `src/components/GanttChart.tsx`: unchanged.

The focused browser suite uses real Admin and Owner persistence and refreshes, real Project creation, independence after deletion, Employee/External data denial, signed-out redirect, modal/validation recovery, and mobile overflow checks.

## Deferred deployment

No Railway configuration, data, migration, or deployment was changed for this checkpoint. It is queued after Foundation/Auth, Company Administration, and Project Types in `PENDING_DEPLOYMENT_LEDGER.md`.
