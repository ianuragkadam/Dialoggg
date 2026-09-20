# Security

## Implemented controls

- Passwords are hashed with bcrypt through one shared policy: at least 12 characters and at most 72 UTF-8 bytes. Hashing rejects values outside the policy, and verification rejects overlong values before invoking bcrypt.
- Session identifiers are cryptographically random and stored in HTTP-only cookies.
- Production cookies use `Secure` and `SameSite=Lax`.
- Shared authorization guards protect Admin-only writes.
- Data routes are expected to enforce company ownership.
- Security response headers disable framing, MIME sniffing, camera, microphone, and geolocation access, restrict referrer disclosure, and enable a two-year HSTS policy with subdomains.
- Production state-changing requests compare `Origin` to the canonical HTTPS `APP_BASE_URL`; client-controlled forwarded host/protocol headers are never an origin authority. Login, logout, password, questionnaire, and Integration Setup writes use this boundary.
- Production startup fails before migration unless the canonical application origin, absolute persistent-volume path, base64 32-byte encryption key, and non-fake provider mode are valid.
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
- Platform Google settings require Platform Administration context, same-origin double-submit CSRF, and current-password reauthentication for save/rotation/disable/enable/revoke. The client secret is a write-only versioned AES-256-GCM envelope; safe reads expose only non-secret configuration, fingerprint/version, verification/disabled timestamps, callback URI, and status. OAuth verification uses PKCE, session-bound single-use state, `APP_BASE_URL`, and a temporary Calendar create/read/delete capability check before User connections are enabled.
- Personal Google connections are scoped to identity, active company membership, and company. PKCE verifiers, refresh tokens, and dedicated calendar IDs are encrypted with context-bound AES-256-GCM; raw OAuth state is stored only as a hash and consumed atomically. The only requested scope is `calendar.app.created`, and browser/API/audit responses do not contain tokens, calendar IDs, secrets, or provider bodies.
- Schema-v13 triggers and indexes enforce same-company active membership connections, one connection per identity/company, one mapping per connection/source/occurrence, unique Google event IDs per connection, single-use OAuth state, and bounded sync-run/outbox health. Eligibility queries fail closed across tenant, Role, Resource, Project assignment, and external-visibility boundaries. Safe payloads exclude client contact/site/private data and Microsoft links.
- Platform Microsoft settings require Platform Administration context, same-origin double-submit CSRF, and current-password reauthentication for save/rotation/disable/enable/revoke. The Entra client secret is a write-only versioned AES-256-GCM envelope; safe reads expose only non-secret metadata, fingerprint/version, callback, verification/disabled timestamps, and safe status. PKCE OAuth must prove the required delegated scope, Graph identity, and temporary create/delete capability before any company connection is enabled.
- Company Microsoft connections require an active company Owner/Admin and single-use PKCE state. Refresh tokens plus tenant/account/site/drive/root identifiers are context-bound AES-256-GCM ciphertext. Root and folder choices are short-lived opaque encrypted values; browser DTOs, audit metadata, logs, and safe errors omit raw tokens, drive IDs, item IDs, URLs, and provider bodies.
- Schema-v14 triggers and indexes enforce company/connection/Project scope for Microsoft connections and folder mappings. Owner/Admin may manage Common and Private; assigned Employee/External may receive Common only; unassigned Users receive neither. Private metadata is omitted rather than masked. Disconnect, Project lifecycle, and company lifecycle preserve mappings and never invoke Microsoft rename/move/delete or permission mutation.
- Company, Project, and Resource iCalendar subscription URLs derive from the canonical application origin and are returned only in non-cacheable authenticated responses. Bearer feeds enforce exact token formats, send `private, no-store`, and escape CR/LF text before serialization.

## Known gaps before final release

- The fixed Role model, membership invitations, password reset, Resource authorization, and core Project visibility are implemented; a final route-by-route permission audit is still required as remaining modules become persistent.
- Multi-factor authentication, end-user session management, and verified self-service login-email change are not implemented.
- Login, forgot/reset password, invitation acceptance, account-password reauthentication, and integration invitation/validation paths have bounded abuse controls. The remaining authenticated mutation surface still needs a final per-action abuse-budget review before release.
- Questionnaire URL tokens grant access to anyone who possesses the link; they must be treated as passwords and rotated if disclosed.
- A full route-by-route tenant-isolation review is required as new modules are added.
- Dependency audit findings must remain at zero or be triaged for reachability before each release.
- Content Security Policy is not yet enabled because third-party Gantt and calendar assets need a tested policy.
- TypeScript strict mode remains future hardening work.

## Reporting and response

Do not include credentials, tokens, questionnaire links, client answers, or database contents in tickets or chat. Report suspected exposure privately to the application owner, rotate affected secrets, invalidate sessions if necessary, preserve logs, and document the incident timeline.

Review this file whenever authentication, authorization, integrations, file handling, or deployment topology changes.
