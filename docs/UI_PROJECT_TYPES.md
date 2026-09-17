# Project Types Module

## Status

Project Types are persistent, tenant-scoped company settings. The Owner/Admin screen at `/settings/project-types` uses protected APIs for create, rename, and delete. Employee (Internal), External/Client, platform-only, signed-out, and cross-company callers cannot read management data or mutate the setting.

## Requirement traceability

| Requirement | Implemented behavior |
| --- | --- |
| `DG-TYP-001` | Every query and mutation includes the active `company_id`. Direct Company B access to Company A IDs returns not found, and cross-company Project assignment is rejected. |
| `DG-TYP-002` | A type contains one trimmed label only. Labels are required, whitespace-normalized, limited to 50 characters, and unique case-insensitively within the company. |
| `DG-TYP-003` | Migration 5 backfills historical Projects and database triggers reject null, inactive, missing, or cross-company types on insert and update. Project create/update APIs require one valid `project_type_id`. Owner/Admin can reassign it later. |
| `DG-TYP-004` | The dedicated settings screen persists create and rename operations. Rename is immediately reflected by joined Project reads, All Projects, Project detail/edit, and Master Calendar filters. |
| `DG-TYP-005` | All Projects derives a multi-select filter from real Project Type records. Master Calendar sends one or more repeated `project_type_id` parameters and returns only matching tenant Projects, Tasks, and Events. |
| `DG-TYP-006`, `FUP-013` | In-use deletion returns `409 PROJECT_TYPE_IN_USE` with the exact affected Project IDs and names. The UI links to reassignment and exposes no destructive action. The database trigger protects the invariant during races. |

## API surface

- `GET /api/v1/project-types`
- `POST /api/v1/project-types`
- `GET /api/v1/project-types/:id`
- `PUT /api/v1/project-types/:id`
- `DELETE /api/v1/project-types/:id`
- `POST /api/projects` and `PUT /api/projects/:id` require a valid same-company `project_type_id`.
- `GET /api/calendar?project_type_id=:id` accepts one or more repeated type IDs.

Management endpoints require an active company Owner/Admin context. Mutations require same-origin and double-submit CSRF validation and emit audit records. Responses use request IDs and no-store cache policy.

## Persistent screen behavior

- Search, responsive table/cards, accessible dialogs, live success/error feedback, duplicate validation, and unsaved-change protection remain available.
- Create, rename, and unused deletion survive a refresh.
- A blocked deletion identifies every affected Project and links to its edit route.
- An empty company receives an actionable state explaining that a Project Type is required before creating a Project.
- The page never exposes another company's type labels or affected Project names.

## Schema and rollback

Migration 5, `project_type_invariants`, backfills legacy Projects with deterministic same-company types, indexes `(company_id, project_type_id, status)`, enforces a valid active type for every Project, prevents type-company changes, and blocks deletion while any Project uses the type.

The local pre-migration rollback copy is `data/backups/pre-project-types-2026-09-17.db` (ignored), SHA-256 `4701DE16BF1C88CA87B18E99DDB4BE945B784909AB7CF842A05C53BEF775176B`. It is schema version 4 with integrity OK and zero foreign-key violations. The migrated local database is schema version 5 with integrity OK, zero foreign-key violations, zero null Project types, and zero invalid same-company links.

## Verification

- Unit/foundation/migration: **23/23 passed**.
- Production-like API/scenario: **126/126 passed**.
- Focused Project Types live Chromium: **14/14 passed**, including Owner persistence and Employee/External denial.
- Project integration live Chromium: **15/15 passed**.
- Calendar integration live Chromium: **15/15 passed**.
- Full live Chromium regression: **149/149 passed** across ten suites.
- TypeScript, Next.js production build, and standalone packaging: passed.

Railway deployment is deliberately deferred. See `docs/evidence/PENDING_DEPLOYMENT_LEDGER.md`.
