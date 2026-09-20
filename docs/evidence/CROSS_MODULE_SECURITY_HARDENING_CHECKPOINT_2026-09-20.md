# Cross-Module Security Hardening Checkpoint

Date: 20 September 2026

Base checkpoint: `1c9fba82390e` (`Implement transactional email delivery`)

Schema change: none; application schema remains v15 locally

## Scope and result

This checkpoint closes cross-module boundary gaps found after the schema-v15 transactional-email review. It changes request validation, credential handling, private calendar subscriptions, production startup configuration, browser-facing password guidance, and regression coverage. It does not add or alter a database migration.

Production was not changed. Railway remains on the healthy schema-v14 deployment `52834a22-8621-4df3-8199-ccbc7c6f9cca`; deployment of schema v15 and this later hardening checkpoint requires its own direct authorization.

## Canonical origin and request protection

- `APP_BASE_URL` is the sole production origin for state-changing request checks and generated iCalendar subscription URLs.
- Requests no longer trust client-controlled `X-Forwarded-Host` or `X-Forwarded-Proto` values.
- Login, logout, private questionnaire writes, integration invitation exchange/sign-out, and every secure-integration workshop mutation fail closed on missing or mismatched origins.
- The authenticated company, Project, and Resource feed-url routes return the canonical origin and mark bearer-bearing responses `no-store`.
- Authentication responses and password changes are explicitly non-cacheable.
- Regression cases prove that matching a forged `Origin` to forged forwarded headers cannot bypass login, questionnaire, or integration-workshop origin protection.

## Password and reauthentication boundary

- One shared policy requires at least 12 JavaScript characters and no more than 72 UTF-8 bytes, matching bcrypt's effective input boundary.
- Password hashing rejects out-of-policy values; password verification rejects overlong values before invoking bcrypt.
- Invitation acceptance, password reset, account password change, and Platform Google/Microsoft/Resend reauthentication use the shared bounded path.
- Account-password reauthentication is limited to five failures per identity/address window, with audit evidence and `Retry-After` on a block.
- Password forms expose correct labels, autocomplete hints, and the same minimum/byte-limit guidance as the server.

## Private iCalendar and browser transport controls

- Feed bearer tokens must match the exact `cmp_`, `prj_`, or `res_` plus 36 lowercase-hex format before database lookup.
- Calendar responses are `private, no-store`, preventing shared or browser cache retention of bearer-protected content.
- CR, LF, and CRLF are escaped before iCalendar serialization, preventing injected properties such as `ATTENDEE`.
- The global response-header policy now sends HSTS for two years with subdomains.

## Fail-closed production startup

Before migration or server startup, production now requires:

- a canonical HTTPS `APP_BASE_URL` without credentials, path, query, or fragment;
- an absolute `RAILWAY_VOLUME_MOUNT_PATH`;
- a base64-encoded 32-byte `APP_ENCRYPTION_KEY`; and
- a provider mode other than the isolated-test-only `fake` mode.

Invalid production configuration exits before the database migration command runs. Non-production tooling remains independent of these production-only requirements.

## Verification evidence

| Gate | Result |
| --- | --- |
| TypeScript | `tsc --noEmit` passed |
| Unit/foundation/migration/configuration | 40/40 passed |
| Production-like API scenarios | 170/170 passed |
| Secure Integration Setup focused browser suite | 17/17 passed after the final canonical-origin replacement |
| Complete browser regression | 161/161 passed across all eleven suites |
| Next.js production build | Next.js 15.5.24; 65 routes/pages generated |
| Standalone packaging | Passed; public and static assets prepared |
| Source hygiene | Intended tree passes `git diff --check`; no forwarded-host/protocol trust remains in application source |
| Dependencies | `package-lock.json` is unchanged; the base v15 checkpoint's locked npm 10.8.2 production/full audits were both zero vulnerabilities |

The browser regression includes Project Types (14), Project Templates (15), Company Administration (15), Users/Access (10), Integration Setup (17), Resources (14), Projects (16), Project Plan (14), Calendars/Events (16), Google Calendar (14), and Microsoft Storage (16), totaling 161.

## Recovery note

An accidental `pnpm` invocation stopped after its registry request failed. Before failing, it moved 15 existing direct dependencies into `node_modules/.ignored`. The command was terminated, collision checks confirmed their live destinations were absent, and only those exact directories were moved back under the verified project `node_modules`. Next.js 15.5.24, React 19.2.6, TypeScript 6.0.3, and better-sqlite3 12.10.0 manifests loaded successfully afterward. No source, lock, or production state was changed by that recovery.

## Remaining boundaries

- Multi-factor authentication, end-user session inventory/revocation UI, login-email change, and CSP remain future release work.
- Provider credentials, production workers/webhooks, and live provider-account smoke tests remain operational gates.
- Schema v15 and this schema-neutral hardening checkpoint are not deployed by this local verification.
