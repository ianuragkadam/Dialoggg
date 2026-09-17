# Foundation and Authentication Checkpoint — 17 September 2026

**Scope:** Local implementation checkpoint only. This record does not claim production release, PostgreSQL completion, live email delivery, client UAT, or completion of the remaining Dialoggg v1 modules.

## Outcome

The identity, company-membership, session, invitation, password-reset, audit, rate-limit, encrypted email-outbox, explicit migration, and readiness foundations are implemented and pass the local production-like gates. Public registration is unavailable. One global identity may hold one fixed Role in each of multiple companies, and changing the active company rotates the session.

## Requirement evidence

| Requirement IDs | Checkpoint result | Evidence |
| --- | --- | --- |
| `DG-TEN-007`, `DG-TEN-009` | Implemented and scenario-tested | Global unique identity plus per-company memberships and independently evaluated Roles; second-company invitation attaches to the existing identity. |
| `DG-TEN-008` | Implemented and live-browser tested | `/api/v1/me` lists allowed contexts; `/api/v1/me/active-company` validates membership and rotates the session; the authenticated header provides a responsive company/platform selector. |
| `DG-TEN-010` | Implemented for the authentication/membership boundary; broader entity matrix remains in later modules | Forged active-company selection, inactive membership, suspended company, and cross-company membership substitution are rejected server-side. |
| `DG-AUT-001`–`DG-AUT-005` | Implemented and tested locally | Bcrypt cost 12; generic failures; hashed session/invite/reset tokens; 72-hour invitation; one-hour reset; expiry, replay, and reissue tests. |
| `DG-AUT-006` | Adapter and configuration contract implemented; external ownership gate open | Resend adapter, encrypted outbox, retries, idempotency keys, and templates exist. A verified sender domain, account owner, API credential, commercial/privacy approval, and controlled live send remain required. |
| `DG-AUT-007`–`DG-AUT-010` | Implemented and tested locally | Public route removed/API returns 404; bounded sessions; revocation on password/role/deactivation/reset; generic responses and persistent rate limits. |
| `DG-ROL-001`, `DG-ROL-002`, `DG-ROL-004`, `DG-ROL-009`, `DG-ROL-010` | Identity/role-management foundation implemented and tested | Fixed membership Roles, separate platform context, Owner/Admin boundaries, self-change protection, and last-Owner protection. Complete per-entity authorization remains a later gate. |
| `DG-USR-001`–`DG-USR-004`, `DG-USR-007`, `DG-USR-009` | Core create/invite/deactivate behavior implemented | Individual name fields, global email uniqueness, External Project requirement, atomic optional Resource linkage, history-preserving deactivation/session revocation. Assignment behavior in `DG-USR-005`–`006`, profile editing in `DG-USR-008`, and all inactive selectors in `DG-USR-010` remain later module work. |
| `DG-RES-004`, `DG-NFR-003`, `DG-NFR-004`, `DG-NFR-007` | Foundation implemented | Five fixed categories are backfilled/seeded; invitation, assignments, Resource link, token, audit, and outbox creation are transactional; unique/FK/idempotency constraints are present. |
| `DG-SEC-001`, `DG-SEC-004`, `DG-SEC-007`, `DG-SEC-008` | Authentication-scope controls implemented and tested | Hashed bearer storage, Secure/HttpOnly/SameSite cookie assertions, no-referrer token pages, externalized secrets, and ciphertext-only email payload rows. Full cross-module security release gate remains open. |
| `DG-SEC-005` | Implemented for account, context, membership, and current modified routes; application-wide retrofit remains open | Exact same-origin validation plus double-submit CSRF; negative scenario coverage. |
| `DG-OPS-005`–`DG-OPS-007`, `DG-OPS-011`, `DG-OPS-017` | Local checkpoint complete; production/browser-matrix release evidence still open | Explicit migration command, startup schema refusal, readiness route, updated seed/test harnesses, build and Chrome browser suites. |

## Schema and migration record

| Version | Name | Purpose |
| ---: | --- | --- |
| 1 | `legacy_foundation` | Reproduces the prior compatible schema. |
| 2 | `identity_membership_and_v1_domain_foundation` | Adds identity/membership/session/security/outbox and v1 domain foundations; backfills legacy Users and Project assignments. |
| 3 | `invitation_reset_and_membership_resource_link` | Adds one-to-one membership/Resource linkage and live-token lookup indexes. |
| 4 | `company_lifecycle_and_unique_name` | Enforces normalized Company Name uniqueness and adds per-company Google synchronization lifecycle state. |

- Migration application is explicit through `npm run db:migrate`; application module initialization never migrates.
- Startup fails closed for an absent, newer, incomplete, or checksum-modified schema.
- Live local database after migration: version 4, `integrity_check=ok`, zero `foreign_key_check` rows.
- Pre-version-3 rollback copy: `data/backups/pre-auth-token-schema-2026-09-17.db` (ignored local evidence), SHA-256 `3AB008E2ED16E062744C8F74D99DC05A86497DB9FA2334121A40C9BD2FD3B93D`, schema version 2, integrity OK, zero foreign-key violations.
- Rollback posture: code rollback may leave additive tables/columns in place when compatible; otherwise stop writes and restore the verified version-2 copy. A Railway image rollback does not revert volume data.

## Security design evidence

- Session, invitation, and reset bearer values are random and only SHA-256 hashes are stored.
- Token-bearing email payloads, including recipient and fragment URL, are stored as AES-256-GCM ciphertext using `APP_ENCRYPTION_KEY`.
- Invitation and reset browser links carry the bearer in `#token=...`; token pages use `Referrer-Policy: no-referrer`, load no third-party content, submit the token in the request body, and clear the fragment from history.
- Existing identities must confirm their current Dialoggg password before accepting a second-company membership; new identities create a password.
- Email delivery is asynchronous through an idempotent outbox with bounded exponential retry and a five-attempt dead-letter state. Provider errors are stored only as safe codes.
- Audit records contain action/result/IDs and safe metadata, not passwords or bearer tokens.

## Verification

- Foundation/unit tests: **22/22 passed**, including automatic verified pre-migration production backup.
- Production-like API/scenario suite: **117/117 passed** (includes migration, readiness, authentication, invitation/reset, tenant isolation, Company Administration lifecycle, CSRF, sessions, cookies, and existing regression journeys).
- Live Chromium role/responsive suites: **147/147 passed** across ten modules. The harnesses use explicit migrations and private test fixtures; none depends on public registration.
- TypeScript validation: passed.
- Next.js production build: passed.
- Readiness endpoint: `/api/health/ready` validates exact schema version and a SQLite quick check without exposing internals.

## Open external and release gates

1. A fresh interactive Railway CLI login completed without invalidating other sessions. Non-secret linkage was verified as `Linkedin Automation` → `dialoggg` → `production` → `dialoggg-web`, with `dialoggg-data` mounted at `/data`; the prior successful deployment remains `861b045c-d8ca-4e96-b0d0-b09f8587be36`. Deployment is paused before migration because creating the new persistent `APP_ENCRYPTION_KEY` requires explicit user approval. No workaround or partial auth deployment was attempted.
2. The user explicitly accepted the residual risk of leaving existing remote Railway sessions active because other processes may depend on them. The local CLI was logged out; no token value was retained or reused.
3. Production currently has no PostgreSQL service. ADR-004 remains unresolved: approve/provision PostgreSQL or explicitly accept/test the single-writer SQLite exception before production backend expansion.
4. With explicit authorization, configure `APP_BASE_URL` and a freshly generated `APP_ENCRYPTION_KEY` without displaying values. Separately configure `RESEND_API_KEY` and `EMAIL_FROM`, verify the sender domain, and complete one controlled invitation and reset delivery. Never place values in documentation or logs.
5. Complete dependency vulnerability disposition, off-volume daily backup scheduling/retention, wider application CSRF/authorization retrofit, UAT, and final release approval before claiming Dialoggg v1 complete.

## Defects caught and resolved in this checkpoint

- Migration execution previously occurred as a database-import side effect; it is now explicit and checksummed.
- Public registration and administrator-set User passwords were retired.
- A legacy User ID could collide numerically with a new membership ID; legacy route resolution now deterministically prefers the legacy mapping.
- Browser fixtures depended on public registration and omitted CSRF; all ten harnesses now migrate and privately seed isolated databases and use protected setup requests.
