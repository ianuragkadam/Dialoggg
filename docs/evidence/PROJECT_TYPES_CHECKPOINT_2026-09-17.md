# Project Types Checkpoint — 17 September 2026

**Scope:** `DG-TYP-001` through `DG-TYP-006` and `FUP-013`. This is a locally verified backend/UI checkpoint. Production deployment is deferred by explicit instruction and is not claimed here.

## Outcome

The former browser-only demonstration is now a persistent company setting. Owner/Admin create, rename, and delete operations use tenant-scoped, CSRF-protected APIs. Project writes require exactly one active same-company type, joins expose its current label everywhere, All Projects and Master Calendar use real multi-select filters, and an in-use type cannot be deleted until every affected Project is reassigned.

## Requirement evidence

| IDs | Result | Authoritative evidence |
| --- | --- | --- |
| `DG-TYP-001` | Implemented and tested | Project Type library/API predicates include active `company_id`; two-tenant scenario checks prove list, item-read, rename, Project assignment, and calendar-filter isolation. |
| `DG-TYP-002` | Implemented and tested | Label-only schema/API; trim and whitespace normalization; required and 50-character validation; company-scoped case-insensitive unique constraint; duplicate API and browser evidence. |
| `DG-TYP-003` | Implemented and tested | Migration 5 backfill plus insert/update triggers; Project POST/PUT validation; database tests for null/cross-company rejection; scenario reassigns an existing Project. |
| `DG-TYP-004` | Implemented and tested | Live `/settings/project-types` persistence, Owner/Admin guard, Employee restriction, cross-tenant 404s, refresh persistence, joined downstream reads, and rename propagation. |
| `DG-TYP-005` | Implemented and tested | All Projects real multi-select filtering; repeated Master Calendar query parameters; matching, nonmatching, combined, and cross-tenant scenario cases; browser integration. |
| `DG-TYP-006`, `FUP-013` | Implemented and tested | API returns exact affected Projects and no delete; browser shows names/links with no destructive control; DB trigger prevents race deletion; reassign-then-delete and unused-delete cases pass. |

## Migration and rollback evidence

- Migration: version 5, `project_type_invariants`.
- Checksummed migration applied locally from v4 to v5.
- Rollback copy: `data/backups/pre-project-types-2026-09-17.db` (Git-ignored).
- Rollback SHA-256: `4701DE16BF1C88CA87B18E99DDB4BE945B784909AB7CF842A05C53BEF775176B`.
- Rollback copy: version 4, integrity `ok`, zero foreign-key violations.
- Migrated database: version 5, integrity `ok`, zero foreign-key violations, zero null Project types, zero invalid type/company relationships.

Production startup remains fail closed and must create and verify its own mounted-volume backup immediately before migration. A code rollback alone does not revert volume data.

## Verification record

- Unit/foundation/migration: **23 passed, 0 failed**.
- API/scenario: **126 passed, 0 failed**.
- Project Types browser: **14 passed, 0 failed**, including Owner persistence and Employee/External denial.
- Projects browser: **15 passed, 0 failed**.
- Calendar browser: **15 passed, 0 failed**.
- Remaining seven browser suites: **105 passed, 0 failed**.
- Whole browser regression: **149 passed, 0 failed**.
- TypeScript: passed.
- Next.js production build: passed.
- Standalone asset packaging: passed.
- Original `src/components/GanttChart.tsx`: unchanged.

## Deferred deployment

No Railway configuration, data, migration, or deployment was changed for this checkpoint. It is queued after the Foundation/Auth and Company Administration checkpoint in `PENDING_DEPLOYMENT_LEDGER.md`.
