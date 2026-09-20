# Security

## Implemented controls

- Passwords are hashed with bcrypt.
- Session identifiers are cryptographically random and stored in HTTP-only cookies.
- Production cookies use `Secure` and `SameSite=Lax`.
- Shared authorization guards protect Admin-only writes.
- Data routes are expected to enforce company ownership.
- Security response headers disable framing, MIME sniffing, camera, microphone, and geolocation access, and restrict referrer disclosure.
- Production secrets and database files are excluded from source control.
- Each private workshop uses different client and review bearer tokens. The original and follow-up workshops also use separate form keys, so their responses cannot overwrite one another.
- Integration setup invitation bearers remain in URL fragments, are exchanged for short-lived HttpOnly sessions, and are stored only as SHA-256 hashes. Writable and read-only invitations are separate, expiring, revocable, and scoped to platform, company, or an explicitly authorized combination.
- Integration credentials use versioned AES-256-GCM envelopes authenticated to their config/version context. API responses expose only configured state, a short fingerprint/last-four display, environment, and timestamps.
- Integration mutations enforce same-origin plus double-submit CSRF checks, rate limits, scoped provider authorization, safe error codes, and payload-free audit metadata. OAuth uses PKCE and one-time hashed state.
- Resource mutations enforce same-origin plus double-submit CSRF, Owner/Admin authorization, structured errors, optimistic versions, and payload-minimal audit records. Employee is read-only; External/Client and cross-tenant access fail closed.
- Schema-v9 triggers enforce fixed Resource Categories, same-company Category/User links, unique normalized names, and active same-company Task/Event assignments even if an application path is bypassed.
- Project mutations enforce same-origin plus double-submit CSRF, Owner/Admin authorization, tenant-safe Project Type/User assignment checks, structured errors, and optimistic versions. Employee/External writes are denied; cross-company records return not found.
- Schema-v10 triggers enforce Active initial state, only approved Active/Completed/Archived transitions, and Archive-before-delete. Permanent deletion is Owner-only with exact-name acknowledgement; audit history survives through a nullable Project reference plus immutable target ID.
- Project Plan mutations require Owner/Admin, same-origin double-submit CSRF, company-scoped Project lookup, optimistic Plan/Task versions, no-store responses, structured safe errors, and payload-minimal audit events. Employee is read-only; External/Client receives a reduced visible-Task DTO with no dependency, Resource, version, category, manual-date, or start-mode data.
- Schema-v11 triggers enforce exactly one protected root per Project, same-Project Header hierarchy, valid leaf-only dependency endpoints, supported link types, non-negative integer lag, unique Task pairs, leaf-only Resource assignment, non-empty Header deletion, and completed Task history protection. Application transactions reject cycles and stale versions before committing schedule changes.
- Event mutations require Owner/Admin, same-origin double-submit CSRF, tenant-scoped Project/Resource validation, optimistic series or exception versions, `no-store` responses, structured safe errors, and payload-minimal audit records. Employee is read-only; External/Client receives only assigned Project Events explicitly enabled for both Project and external visibility, without private descriptions or Resource identifiers.
- Schema-v12 triggers enforce valid company time zones, active same-company Projects and Resources, valid all-day/timed shapes, supported recurrence/end modes, occurrence-exception shape, soft deletion, and same-company Event assignments. Resource conflicts are rejected atomically until an Owner/Admin explicitly confirms them; the acknowledgement stores only the series/occurrence, Resource, actor membership, conflicting item type/title, time range, and time zone.

## Known gaps before final release

- The fixed Role model, membership invitations, password reset, Resource authorization, and core Project visibility are implemented; a final route-by-route permission audit is still required as remaining modules become persistent.
- Multi-factor authentication, end-user session management, and verified self-service login-email change are not implemented.
- Some legacy login and write endpoints do not yet have rate limiting or automated abuse protection; integration invitation exchange and validation paths do.
- Questionnaire URL tokens grant access to anyone who possesses the link; they must be treated as passwords and rotated if disclosed.
- A full route-by-route tenant-isolation review is required as new modules are added.
- Dependency audit findings must remain at zero or be triaged for reachability before each release.
- Content Security Policy is not yet enabled because third-party Gantt and calendar assets need a tested policy.
- TypeScript strict mode remains future hardening work.

## Reporting and response

Do not include credentials, tokens, questionnaire links, client answers, or database contents in tickets or chat. Report suspected exposure privately to the application owner, rotate affected secrets, invalidate sessions if necessary, preserve logs, and document the incident timeline.

Review this file whenever authentication, authorization, integrations, file handling, or deployment topology changes.
