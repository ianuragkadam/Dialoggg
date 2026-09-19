# Resources and Fixed Resource Categories

Last verified: September 19, 2026

## Delivery boundary

Resource Management is persistent and company-scoped. A Resource is schedulable capacity and never receives login access. A User is an identity with a company membership and may optionally have a one-to-one link to a Resource; linking does not couple their lifecycle.

Owner/Admin can create, edit, link, deactivate, restore, and assign Resources. Employee has read-only directory, detail, schedule, and feed access subject to the linked-Resource rule. External/Client and Platform contexts cannot access company Resource records.

## Requirement traceability

| Requirement | Implemented behavior | Verification |
| --- | --- | --- |
| `DG-RES-001`, `DG-RES-002` | Resource records are separate from login identities and represent schedulable people, subcontractors, suppliers, equipment, or other capacity. | Unit/static, scenario, focused browser |
| `DG-RES-003` | Name and exactly one Category are required; optional email and phone are validated and normalized. | API and browser validation |
| `DG-RES-004`, `DG-OOS-002` | Exactly five Categories are seeded and database-locked: Employee, Subcontractor, Supplier, Equipment, Other. Custom insert, rename, and delete fail closed. | Migration invariant test and API test |
| `DG-RES-005` | Company-scoped create/edit uses case-insensitive unique normalized names, optimistic versions, audit records, and refresh persistence. | Scenario and browser persistence |
| `DG-RES-006`, `DG-USR-007`, `FUP-010` | Optional same-company one-to-one membership linkage is enforced by validation, unique index, and database triggers. User/Resource lifecycles remain independent. | Migration, API, lifecycle browser check |
| `DG-RES-007`, `DG-RES-008` | Multiple Task and canonical Event-series assignments persist and render together on Resource detail; tenant scope is enforced in service and triggers. | Assignment API and browser checks |
| `DG-RES-009`, `DG-RES-010`, `FUP-011` | Deactivation blocks only new assignments; historical Task/Event links and calendar history remain. Restore re-enables assignment without changing a linked User. | Migration and persisted lifecycle checks |
| `DG-RES-011` | Every Resource read/write is authenticated, role-gated, and company-scoped; cross-tenant IDs return not found and External access is denied. | Scenario and focused API checks |
| `FUP-009` | Task/Event overlaps receive a visible conflict label and explicit acknowledgement without silent assignment changes. | Focused browser check |
| `DG-ROL-005`, `DG-ROL-006` | Owner/Admin manage; Employee reads; External/Client is denied. | Role browser and API checks |
| `DG-UX-001`, `DG-UX-004`, `DG-UX-007`, `DG-UX-009`, `FUP-019` | Approved terminology, named controls, accessible dialogs/status, keyboard-safe confirmation, and phone-width layout are retained. | Static and browser checks |

## Routes and APIs

| Route | Purpose | Access |
| --- | --- | --- |
| `/resources` | Persistent Resource directory, filters, summary, lifecycle | Employee read; Owner/Admin manage |
| `/resources/new` | Validated create and optional User link | Owner/Admin |
| `/resources/[id]` | Detail, edit, link, Task/Event schedule, conflict, lifecycle | Employee read; Owner/Admin manage |
| `/api/v1/resources` | List/create structured Resource DTOs | Company internal roles; create is Owner/Admin |
| `/api/v1/resources/[id]` | Read/update/lifecycle with optimistic version | Company internal roles; writes are Owner/Admin |
| `/api/v1/resources/[id]/assignments` | Read/replace Task and Event-series assignments | Company internal roles; write is Owner/Admin |

All mutations enforce same-origin plus double-submit CSRF validation and write an audit event. Compatibility endpoints use the same domain rules and cannot create custom Categories.

## Database invariants

Migration 9, `resource_management_invariants`, performs the following additive/backfill work:

- canonicalizes the five Categories per existing company and reassigns legacy custom or invalid values to Other;
- normalizes and de-duplicates legacy Resource names without deleting a Resource;
- adds normalized name, optimistic version, and timestamps;
- removes pre-existing cross-company Task/Event assignment rows;
- enforces Resource/Category/membership company scope and one-to-one membership linkage;
- rejects new Task/Event assignments to inactive or cross-company Resources while preserving existing history; and
- locks Category insert/update/delete to the approved fixed set.

## QA evidence

- 28/28 unit, foundation, backup/restore, and migration tests.
- 136/136 production-like API/scenario checks.
- 14/14 focused Resource browser checks, including real create/edit/link/lifecycle/assignment persistence.
- 155/155 browser checks across all eleven UI suites.
- TypeScript validation, Next.js 15.5.24 production build, and standalone asset packaging passed.
- Locked npm 10.8.2 production and full dependency audits found zero vulnerabilities.

Detailed backup, restore, migration, security, and acceptance evidence is in [Resource Management checkpoint evidence](evidence/RESOURCE_MANAGEMENT_CHECKPOINT_2026-09-19.md).

## Remaining boundary

Production has not received schema v9 or this checkpoint. Google synchronization and the broader Event/Calendar persistence checkpoint remain separate work. The original `GanttChart.tsx` was not replaced.
