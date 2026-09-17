# Company Administration and Tenant Lifecycle Checkpoint — 17 September 2026

**Scope:** Platform Company Administration, tenant lifecycle enforcement, first-Owner provisioning, and global-identity context switching. This is a verified implementation checkpoint, not a claim that the remaining Dialoggg v1 modules or external integrations are complete.

## Outcome

The former Company Administration preview is connected to persistent, platform-only APIs and database records. A Platform Administrator can create a uniquely named company with an IANA time zone, seed the five fixed Resource Categories, create a pending first-Owner membership, and queue a 72-hour encrypted invitation in one transaction. The company list/detail views expose operational metadata and aggregate counts without exposing tenant record names or content.

Suspension is immediately enforced by the server: the company becomes unavailable, all active sessions in that company context are revoked, the per-company Google synchronization state becomes paused, and all Dialoggg and Microsoft mapping records remain intact. Restoration returns the company to Active but deliberately leaves Google synchronization paused with `restored_review_required` until a later integration-health review.

## Requirement evidence

| Requirement IDs | Result | Evidence |
| --- | --- | --- |
| `DG-TEN-001`–`DG-TEN-004` | Implemented and tested | Multiple companies persist behind a separate Platform Administrator context; only that context can list or create companies. Tenant Admin API/UI attempts are denied. |
| `DG-TEN-005` | Implemented and tested | Transactional create API validates Company Name, IANA time zone, first Owner first/last name and email; creates pending Owner membership and encrypted invitation; seeds the five fixed Categories. |
| `DG-TEN-006`, `DG-TEN-010` | Implemented for the Company Administration boundary | Every company/member/resource/project aggregate is company-scoped. Direct and UI authorization tests reject non-platform callers. Broader entity-by-entity completion remains a later gate. |
| `DG-TEN-007`–`DG-TEN-009` | Implemented and tested | Global identity, per-company Role, authorized-context API, and responsive UI selector. Context changes rotate the session and route to the selected company or platform area. |
| `DG-TEN-011`, `DG-TEN-012` | Implemented for first-Owner/lifecycle administration | Platform access is limited to operational metadata, first-Owner provisioning, and lifecycle controls; no tenant Project, Task, Event, client, Resource, or file names are returned. Existing Owner protections remain covered by the foundation suite. |
| `DG-TEN-013`, `DG-TEN-014`, `FUP-012` | Implemented and tested | Active/suspended transitions, immediate session revocation, per-company Google pause, restore-with-review, and preservation of Project, folder mapping, and Microsoft connection rows. No Microsoft rename/delete is issued. |
| `DG-AUT-003`, `DG-AUT-004`, `FUP-015` | Implemented and tested | First Owner receives a single-use 72-hour invitation; no password is chosen or exposed by the Platform Administrator. New and existing identity acceptance paths retain foundation behavior. |
| `DG-OPS-003`, `DG-SEC-005` | Implemented and tested | Create/suspend/restore actions emit safe audit records and require same-origin plus double-submit CSRF protection. |

## API surface

- `GET /api/v1/platform/companies`
- `POST /api/v1/platform/companies`
- `GET /api/v1/platform/companies/:id`
- `POST /api/v1/platform/companies/:id/suspend`
- `POST /api/v1/platform/companies/:id/restore`
- `GET /api/v1/me` and `PUT /api/v1/me/active-company` power the authenticated context selector.

All new endpoints use the versioned success/error envelope, request IDs, `cache-control: no-store`, server-side authorization, and mutation request protection.

## Schema and rollback record

Migration 4, `company_lifecycle_and_unique_name`, adds:

- a unique index on `lower(trim(company.name))`; migration fails closed if historical duplicates exist; and
- `company_google_sync_state`, which isolates pause/resume state per company rather than mutating a person's cross-company Google connection.

The pre-migration local rollback copy is `data/backups/pre-company-lifecycle-2026-09-17.db` (ignored local evidence), SHA-256 `6FC98C794D5F1522C0F55DB63EC0DC3A3E3E327391CEB3273B1AAFFB97DEF1E5`, schema version 3, integrity OK, and zero foreign-key violations. The migrated local database is schema version 4, integrity OK, and has zero foreign-key violations.

Production uses the fail-closed startup wrapper. Before applying a newer schema to a populated production database, it creates a timestamped SQLite backup on the mounted volume, verifies integrity and foreign keys, computes a SHA-256 digest, then runs the checksummed migration. A code/image rollback alone does not revert volume data.

## Verification

- Foundation/unit/migration tests: **22/22 passed**.
- Production-like API/scenario suite: **117/117 passed**.
- Focused live Chromium Company Administration suite: **15/15 passed**, including platform/company context switching, real lifecycle mutations, real provisioning, authorization boundaries, and 390px overflow.
- Full live Chromium regression: **147/147 passed** across ten suites. A single focus assertion was flaky only during a three-suite parallel run and passed in its immediate isolated 12/12 rerun.
- TypeScript validation: passed.
- Next.js production build and standalone packaging: passed.
- Original `src/components/GanttChart.tsx`: unchanged.

## Still open

- Resend account/domain credentials and controlled live invitation/reset delivery remain external gates; the encrypted outbox is queued but no provider credential is assumed.
- Google workers must consume `company_google_sync_state` before any live synchronization is enabled.
- PostgreSQL remains an explicit architecture/cost decision. This checkpoint does not provision a new paid service and retains the single-writer SQLite constraint.
- Project Types, Templates, Resources, Projects, Plan/Gantt, Events/recurrence, Google OAuth/sync, and Microsoft Graph backends remain staged work despite their complete review UIs.
