# Users, Roles, Invitations, and Project Access Checkpoint — 17 September 2026

**Scope:** `DG-ROL-001` through `DG-ROL-012` and `DG-USR-001` through `DG-USR-011`, limited to the Users/Access dependency boundary and the Project/Calendar/Resource read paths needed to prove External isolation. This is a locally verified checkpoint. Production deployment is not performed by this worktree.

## Outcome

The hard-coded User directory, invitation, detail, lifecycle, and Project-access demonstrations are replaced by persistent company membership workflows. One global identity can hold separate fixed Roles in multiple companies. Owner can manage all company Roles; Admin can manage only Employee and External/Client. The API and database both protect the final active Owner. Deactivation, Role changes, profile changes, and Project-assignment changes revoke stale identity sessions while preserving historical associations.

External/Client Project authorization now uses `project_membership` as the authoritative assignment. Lists, direct routes, API detail, Tasks, Events, Project Calendar queries, Master Calendar access, calendar subscriptions, Resource endpoints, and server-rendered pages enforce that scope. External DTOs omit client contact fields, address, internal note, dependency links/lag, hidden Tasks/Events, Users, and Resource data. Employee assignment remains team/Common-link/notification eligibility metadata and does not restrict read-only company schedule visibility.

## Requirement evidence

| IDs | Result | Authoritative evidence |
| --- | --- | --- |
| `DG-ROL-001`–`DG-ROL-004`, `DG-ROL-009` | Implemented and tested | Fixed membership Role validation; separate platform context; Owner-only Owner/Admin mutations; Admin Employee/External boundary in UI, page, and API; forged direct calls rejected. |
| `DG-ROL-005`, `DG-ROL-006` | Implemented for this dependency boundary | Owner/Admin User and assignment management persists; Employee can read all company Projects but receives restricted User-management pages and forbidden writes. Remaining module-specific Admin capabilities stay with their dependency modules. |
| `DG-ROL-007`, `DG-ROL-008` | External isolation implemented; final Gantt setting UI remains a Project-module item | Assigned-only Project discovery/direct access plus role-specific Project, Task, Event, calendar, feed, link, User, and Resource behavior. Sensitive fields and dependency lag are never serialized. |
| `DG-ROL-010` | Implemented and tested | UI prevents self-lifecycle changes, API returns a safe conflict, and migration v7 triggers reject final-Owner demotion, deactivation, or deletion. |
| `DG-ROL-011`, `DG-ROL-012` | Central policy/DTO layer implemented for Users and access-sensitive reads | Shared `can`, membership-target policy, Project scope, Project assignment, and role-specific serializer are used server-side. App-wide settings completion remains dependency-ordered. |
| `DG-USR-001`–`DG-USR-004` | Implemented and tested | Required structured identity fields, invitation-only password setup, globally unique email, verified existing-identity attachment, fixed membership Role, and at-least-one External assignment. |
| `DG-USR-005`, `DG-USR-006` | Implemented for authorization/team mappings | Assignment changes persist atomically in authoritative and legacy compatibility mappings, take effect immediately, revoke stale sessions, preserve history, and leave Employee schedule visibility company-wide. Notification and Microsoft delivery consumers remain in their modules. |
| `DG-USR-007` | Implemented and tested | “Also add as a Resource” atomically creates/reuses a one-to-one same-company Employee-category Resource; User deactivation does not deactivate the linked Resource. |
| `DG-USR-008` | Implemented with conservative email policy | Permitted profile/Role fields persist with validation. Company administrators cannot replace the global Login Email; the API requires a future verified self-service identity flow rather than accepting an unverified change. |
| `DG-USR-009`, `DG-USR-010` | Implemented and tested | Deactivation revokes login/sessions and preserves history. Deactivated memberships reject new Project assignments and silent reinvitation until explicitly restored. |
| `DG-USR-011` | Implemented for current production screens | Owner, Admin, Employee (Internal), and External/Client labels are centralized; no current User/Project access screen presents legacy “Viewer” terminology. |

## Migration and rollback evidence

- Migration: version 7, `membership_access_invariants`.
- Rollback copy: `data/backups/pre-users-access-2026-09-17.db` (Git-ignored).
- Rollback SHA-256: `C460EE2AF97B9ABD0A11B1CA071A3EE8520D8D7549772B85FC44312D6583332D`.
- Rollback copy: schema v6, integrity `ok`, zero foreign-key violations.
- Migrated local database: schema v7, integrity `ok`, zero foreign-key violations, zero cross-company Project membership links, zero cross-company linked Resources, and zero active External memberships without a Project.
- Database guards cover final Owner survival, Project-membership tenant/status scope, linked-Resource tenant scope, External activation/invitation minimum assignment, and removal of the final External assignment.
- New explicit Task/Event `external_visible` fields default closed; legacy rows are not exposed to External/Client by accident.

## Security and behavior decisions

- Membership IDs, not legacy User IDs, are the canonical management identifiers.
- Email is a global login identity. Company management treats it as read-only and returns `VERIFIED_EMAIL_CHANGE_REQUIRED` for attempted replacement.
- Linked Resource name/contact fields follow permitted profile edits, but Resource activation/deactivation remains independent.
- External users cannot obtain company calendar feeds or reusable Project subscription URLs that could outlive assignment removal.
- API denials use `404` for cross-tenant/unassigned Project discovery and `403` for known general capability boundaries.
- Mutation APIs require authenticated company context, Role checks, same-origin/CSRF validation, tenant predicates, bounded validation, and audit events containing IDs/counts rather than private payloads.

## Verification record

- Unit/foundation/migration: **25 passed, 0 failed**.
- API/scenario: **136 passed, 0 failed**.
- Users/Access focused Chromium: **10 passed, 0 failed**.
- Remaining nine browser suites: **132 passed, 0 failed**.
- Whole browser regression: **142 passed, 0 failed**.
- TypeScript: passed.
- Next.js production build and standalone asset packaging: passed.

The focused browser suite performs real database writes for deactivation/restoration, invitation plus linked Resource, profile editing, Project assignment, and owner invitation options. It also performs human-style and direct-fetch adversarial External checks for unassigned Project concealment, DTO redaction, visible-only Tasks/Events, company-calendar denial, Resource denial, feed denial, signed-in Employee restriction, and mobile overflow.

## Deferred external gates

This checkpoint requires a controlled schema-v7 deployment, mounted-volume backup, readiness verification, and live multi-role smoke test before it can be called production-verified. Notification delivery and Microsoft Common-folder behavior consume the persisted Employee/External assignment in later modules. A verified self-service Login Email replacement workflow is intentionally not invented here.
