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

## Known gaps before final release

- The final Owner, Admin, Employee (Internal), and External/Client permission matrix is not implemented.
- There is no invitation, email verification, password-reset, multi-factor authentication, or session-management interface.
- Some legacy login and write endpoints do not yet have rate limiting or automated abuse protection; integration invitation exchange and validation paths do.
- Questionnaire URL tokens grant access to anyone who possesses the link; they must be treated as passwords and rotated if disclosed.
- A full route-by-route tenant-isolation review is required as new modules are added.
- Dependency audit findings must remain at zero or be triaged for reachability before each release.
- Content Security Policy is not yet enabled because third-party Gantt and calendar assets need a tested policy.
- TypeScript strict mode remains future hardening work.

## Reporting and response

Do not include credentials, tokens, questionnaire links, client answers, or database contents in tickets or chat. Report suspected exposure privately to the application owner, rotate affected secrets, invalidate sessions if necessary, preserve logs, and document the incident timeline.

Review this file whenever authentication, authorization, integrations, file handling, or deployment topology changes.
