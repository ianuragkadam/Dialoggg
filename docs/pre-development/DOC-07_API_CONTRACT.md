# DOC-07 — API Contract and Error Model

**Version:** 0.1  
**Status:** Draft  
**Protocol:** HTTPS JSON under `/api/v1` for new production contracts

## Principles

- Authenticate and authorize every protected Route Handler as a public-facing API endpoint.
- Resolve active company and membership from the session; never accept role or authoritative company scope from the body.
- Validate all input server-side and use transactions for multi-record changes.
- Return role-specific DTOs so forbidden fields are never serialized.
- Make lifecycle and integration commands idempotent where retries are expected.
- Use optimistic concurrency for schedule/lifecycle updates that may be edited concurrently.

Next.js explicitly recommends authorization checks in Route Handlers and server-side session validation: [Next.js authentication guidance](https://nextjs.org/docs/app/guides/authentication).

## Common request conventions

- JSON uses `camelCase`; database naming may remain `snake_case` behind the data layer.
- IDs are opaque to clients even if internally numeric.
- Date-only values use `YYYY-MM-DD`.
- Timed values use ISO 8601 instants plus an explicit IANA time zone where local recurrence matters.
- Pagination uses `cursor` and `limit`; response contains `nextCursor` or `null`.
- Search is trimmed and case-insensitive where specified.
- Writes that support replay accept `Idempotency-Key`.
- Mutable resources return `version`; update/delete requires `If-Match` or version in the command.
- Request correlation header: accept/generate `X-Request-Id`; return it in errors and logs.

## Standard responses

Success:

```json
{
  "data": {},
  "meta": { "requestId": "req_..." }
}
```

Validation or business failure:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Check the highlighted fields.",
    "fields": { "startDate": "A start date is required." },
    "requestId": "req_..."
  }
}
```

Do not include stack traces, SQL, tokens, hidden IDs, other-tenant values, or vendor response bodies.

## Status and error catalog

| HTTP | Code | Use |
| ---: | --- | --- |
| 400 | `VALIDATION_FAILED` | Invalid format, field, transition, or business rule |
| 401 | `AUTHENTICATION_REQUIRED` | Missing, invalid, expired, or revoked session |
| 403 | `ACTION_FORBIDDEN` | Actor lacks a capability and resource existence is safe to reveal |
| 404 | `RESOURCE_NOT_FOUND` | Missing resource or tenant/assignment mismatch to avoid existence leakage |
| 409 | `CONFLICT`, `DUPLICATE`, `VERSION_CONFLICT` | Unique rule, lifecycle conflict, stale update |
| 422 | `SCHEDULE_CONSTRAINT_FAILED` | Valid request shape but dependency/date graph cannot be applied |
| 429 | `RATE_LIMITED` | Authentication/abuse or API rate limit; include safe retry guidance |
| 502 | `INTEGRATION_FAILED` | Synchronous vendor operation failed safely |
| 503 | `SERVICE_UNAVAILABLE` | Temporary database/job/vendor unavailability |

## Core resource contracts

### Authentication and identity

| Method/path | Purpose | Access |
| --- | --- | --- |
| `POST /api/v1/auth/login` | Create session | Public, rate limited |
| `POST /api/v1/auth/logout` | Revoke current session | Authenticated |
| `POST /api/v1/auth/forgot-password` | Issue one-hour reset if identity exists | Public, generic response |
| `POST /api/v1/auth/reset-password` | Consume single-use reset token | Public token, rate limited |
| `POST /api/v1/invitations/{token}/accept` | Set password/accept membership | Public token, single-use |
| `GET /api/v1/me` | Identity, memberships, active context | Authenticated |
| `PUT /api/v1/me/active-company` | Switch active membership | Active membership required |

### Platform companies

| Method/path | Purpose | Access |
| --- | --- | --- |
| `GET /api/v1/platform/companies` | Search/list operational metadata | Platform Administrator |
| `POST /api/v1/platform/companies` | Create company and pending first Owner | Platform Administrator |
| `GET /api/v1/platform/companies/{companyId}` | Operational metadata only | Platform Administrator |
| `POST /api/v1/platform/companies/{companyId}/suspend` | Suspend access/pause sync | Platform Administrator; idempotent |
| `POST /api/v1/platform/companies/{companyId}/restore` | Restore access; sync remains reviewable | Platform Administrator; idempotent |

### Memberships and access

`/api/v1/memberships`, `/api/v1/memberships/{id}`, `/invitations`, and `/project-assignments` implement DOC-04. Role changes use explicit command endpoints rather than a generic unrestricted patch. Last-Owner and Admin-versus-Owner constraints are transactional.

### Projects, Types, Resources, Templates

- `/api/v1/projects` and `/api/v1/projects/{id}`: list/create/read/update plus explicit `/complete`, `/reopen`, `/archive`, `/restore`, and `/permanent-delete` commands.
- `/api/v1/project-types`: create/rename/deactivate/delete with in-use protection.
- `/api/v1/resources` and `/resource-categories`: fixed-category validation, linkage, lifecycle, and schedule reads.
- `/api/v1/project-templates`: create from Project, read, rename, archive/delete, and `/instantiate` atomically.

### Gantt and calendar

- `GET /api/v1/projects/{id}/plan` returns Tasks, dependencies, and plan version.
- Task/link creates and edits return the complete changed set after cascade, including ancestor summaries and Project End Date.
- Schedule writes require plan version and return `VERSION_CONFLICT` when stale.
- Events use a series resource plus occurrence-exception commands.
- Master/Resource Calendar endpoints accept date range, Project, Resource, and type filters with role-scoped results.

### Integrations

- Google endpoints cover begin/callback/status/disconnect and retry; tokens never enter response DTOs.
- Microsoft endpoints cover begin/callback/status/root selection and Common/Private mapping/relink; Private IDs never enter unauthorized DTOs.
- Integration callbacks validate state, issuer, redirect URI, and session/connection binding.

## Audit and idempotency

Lifecycle, role, assignment, schedule, integration, deletion, invite/reset, and support actions create safe audit events. External-delivery operations use an outbox idempotency key such as `google:{connection}:{source}:{occurrence}:{sourceVersion}`.

## Contract testing

Every operation requires schema validation, allowed-role test, denied-role test, cross-company/object substitution test, lifecycle-state test, version-conflict test where applicable, and error-body snapshot. OpenAPI must become the machine-readable source before frontend wiring is declared complete.

