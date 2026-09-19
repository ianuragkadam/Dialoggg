# Resource Management Checkpoint Evidence

Date: September 19, 2026

Scope: persistent Resource Management, fixed Categories, optional one-to-one User linkage, lifecycle, and Task/Event assignments

Production state: not deployed

## Outcome

The Resource UI preview was replaced with tenant-safe persistence. Owner/Admin can create, edit, link, deactivate, restore, and assign Resources. Employee can review company Resource records and schedules without mutation controls. External/Client and Platform contexts are denied. Compatibility APIs and User invitation/profile flows were updated so they cannot bypass the new invariants.

## Requirement-ID traceability

| IDs | Acceptance evidence |
| --- | --- |
| `DG-RES-001`–`DG-RES-003` | Separate schedulable Resource DTO; required normalized Name and fixed Category; validated optional contact fields; persistent form/detail/list browser checks. |
| `DG-RES-004`, `DG-OOS-002` | Migration test proves custom Category insert/update/delete are rejected. API rejects a custom Category. Exactly five canonical Categories remain after legacy backfill. |
| `DG-RES-005` | Company-scoped create/edit, case-insensitive unique name, optimistic version, audit, and reload persistence pass. |
| `DG-RES-006`, `DG-USR-007`, `FUP-010` | Membership link is same-company and one-to-one in validation, unique index, and triggers. Browser check proves linked User remains active after Resource deactivation. |
| `DG-RES-007`, `DG-RES-008` | Assignment API persists both Task and canonical Event-series IDs. Detail renders both types and their project/timing context. |
| `DG-RES-009`, `DG-RES-010`, `FUP-011` | Inactive Resource rejects additions; historical Task/Event rows remain; restore is available; linked User lifecycle remains independent. |
| `DG-RES-011` | Signed-out redirect/401, External 403, role restrictions, cross-tenant 404, same-company queries, and database scope triggers pass. |
| `FUP-009` | Overlapping Task/Event intervals display non-color conflict status and require acknowledgement; neither assignment is silently changed. |
| `DG-ROL-005`, `DG-ROL-006` | Owner/Admin manage; Employee reads; External/Client is denied in server pages and APIs. |
| `DG-UX-001`, `DG-UX-004`, `DG-UX-007`, `DG-UX-009`, `FUP-019` | Approved terminology, accessible names/dialog roles/status, keyboard-safe confirmation, and narrow viewport overflow checks pass. |

## Schema and data safety

Migration 9: `resource_management_invariants`

Checksum prefix reported by the migration runner: `9a0384d03e0c`

The migration:

- adds `resource.normalized_name`, `version`, `created_at`, and `updated_at`;
- canonicalizes Employee, Subcontractor, Supplier, Equipment, and Other;
- maps legacy custom/invalid Categories to Other without deleting Resources;
- normalizes and deterministically disambiguates duplicate legacy names;
- removes invalid pre-existing cross-company Task/Event assignment rows;
- creates normalized-name, company/status/category, and assignment indexes; and
- installs fixed-Category, Resource scope/link, active Task assignment, and active Event assignment triggers.

The migration test directly proves fixed-category immutability, wrong-company Category rejection, one-to-one membership uniqueness, duplicate normalized-name rejection, Task/Event tenant rejection, inactive assignment rejection, and preservation of historical assignments.

## Backup and restore evidence

Pre-migration backup: `data/backups/pre-resource-management-2026-09-19.db`

- Source schema: v8
- SHA-256: `314BCF01ED3277D59DF4125CE0EF673E42E2B11DB11821F51447DE3E7C54358C`
- SQLite integrity: `ok`
- Foreign-key violations: `0`

The restore command was exercised against the isolated `.tools/resource-restore-verification` directory, never the live workspace database. It retained a pre-restore copy, verified the restored database, reproduced the same SHA-256, reopened at schema v8, returned integrity `ok`, and returned zero foreign-key violations.

The local workspace database was then migrated to v9 in 4 ms. Post-migration verification returned schema v9, integrity `ok`, zero foreign-key violations, zero Categories outside the fixed set, and unique company/Category names.

## Security controls verified

- Same-origin plus double-submit CSRF on every Resource mutation.
- Owner/Admin authorization for create, edit, lifecycle, and assignment writes.
- Employee read-only behavior.
- External/Client and Platform fail-closed access.
- Tenant filtering before Resource, User membership, Task, and Event lookup.
- Database triggers as a second boundary against cross-company or inactive assignments.
- Optimistic version conflict response for concurrent edit/lifecycle changes.
- Structured v1 errors without raw database detail.
- Payload-minimal audit events for create, update, lifecycle, and assignment changes.
- Compatibility endpoints cannot create legacy custom Categories.

## Verification results

| Gate | Result |
| --- | --- |
| TypeScript | Passed (`tsc --noEmit`) |
| Unit/foundation/migration/backup/restore | 28/28 passed |
| Production-like API/scenario | 136/136 passed |
| Focused Resource Chromium | 14/14 passed |
| Full eleven-suite Chromium regression | 155/155 passed |
| Next.js production build | Passed; 55 application routes generated |
| Standalone static/public packaging | Passed |
| npm 10.8.2 production audit | 0 vulnerabilities |
| npm 10.8.2 full audit | 0 vulnerabilities |

The focused browser suite creates isolated Admin, Employee, External, and second-company fixtures; verifies CSRF/custom-Category/cross-tenant failures; performs real create/edit/link/lifecycle operations; reads Task and Event assignments; exercises conflict acknowledgement; reloads to prove persistence; checks User independence and retained history in SQLite; and checks mobile/signed-out behavior.

## Release boundary

Production remains on deployment `0dab30fa-e3f5-4f9e-91f4-bb5bafef3635` at schema v6. The separately prepared v7/v8 release of commit `0046766` remains paused until the user explicitly authorizes the production restart and migration. This v9 checkpoint must be released only after v7 and v8, with a new verified production-volume backup and live role/persistence smoke tests.
