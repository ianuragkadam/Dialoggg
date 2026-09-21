# Final Release QA Checkpoint

Date: 21 September 2026

Local base: `3965bd0` (`Harden cross-module security boundaries`)

Production baseline: `1c9fba8` (`Implement transactional email delivery`), Railway deployment `079691a9-89a8-4a9a-abf6-03b67065f5d9`, schema v15

Schema change in this checkpoint: none

## Result

The schema-neutral hardening release candidate is clean locally and ready for an explicit backup/deployment authorization. It has not been uploaded to Railway and did not read or mutate authenticated production data.

Final QA found one cross-cutting defect: authenticated API reads without a route-specific header relied on framework cache defaults. The fix adds a central `private, no-store, max-age=0` plus `Pragma: no-cache` policy to every `/api/*` response. The standalone scenario suite verifies the policy on a legacy authenticated endpoint, while private calendar feeds retain their stricter bearer-specific policy.

## Route, Role, and tenant review

The repeatable release-security gate inventories:

- 73 API route files;
- 50 GET method exports; and
- 69 POST, PUT, PATCH, or DELETE method exports.

Every non-bearer read resolves to a current actor, company Role guard, private Integration Setup session, or a reviewed re-export. The four intentional public/bearer read boundaries are readiness, iCalendar subscription, questionnaire, and questionnaire review. Every mutation resolves to `validateMutationRequest`, `validateRequestOrigin`, `validateIntegrationMutation`, a reviewed re-export, or the public-registration endpoint that remains hard-disabled with 404. Application source contains no trust in `X-Forwarded-Host` or `X-Forwarded-Proto`.

The dynamic scenario and browser suites prove Platform/company separation, second-company isolation, Owner/Admin write boundaries, Employee read-only behavior, External/Client assignment and visibility reduction, Common-versus-Private Microsoft serialization, personal Google connection isolation, Project/Task/Event/Resource cross-tenant denials, protected invitation/reset flows, and signed-out redirects/API denials.

## Abuse, secrets, and execution review

- Anonymous credential/token entry points and Integration Setup exchanges use database-backed attempt windows; account-password and Platform secret mutations require reauthentication where specified.
- Authenticated business writes additionally require session, canonical origin, CSRF token, tenant/Role authorization, bounded input validation, and optimistic versions where concurrent edits matter.
- Google and email workers use bounded retry/backoff and dead-letter states.
- The source scan found no embedded private key, AWS access-key, Google API-key, or live Stripe-key signature.
- Application source contains no `eval`, dynamic `Function`, or child-process execution. The only production child process is the fixed migration command launched before the standalone server.
- Redirects use fixed internal paths and the startup-validated canonical `APP_BASE_URL`; no user-provided redirect target is accepted.
- Dynamic SQL candidates were reviewed: table/column identifiers exist only in fixed migration/seed lists, while runtime lists generate placeholders and pass values separately.

## Schema and startup evidence

A disposable fresh database applied all 15 migrations in order. The final record was schema v15 `transactional_email_delivery` with checksum `aa2dc0024a644975d293354bacb0dea84f6ee34238f0c3c21145ca9e6f58bfc0`; all 15 migration records were present, SQLite integrity was `ok`, and `foreign_key_check` returned zero rows.

The actual production launcher was exercised against a disposable directory with `NODE_ENV` deliberately absent from its parent environment. It enforced the production contract, migrated v1→v15, launched the Next.js standalone server, became ready in 310 ms, and returned HTTP 200 with `{"status":"ready"}`. A separate negative gate proved missing canonical URL, volume, and encryption configuration is rejected before migration.

## Automated verification

| Gate | Result |
| --- | --- |
| TypeScript | `tsc --noEmit` passed |
| Unit/foundation/migration/config/release-security | 42/42 passed |
| Production-like API scenarios | 170/170 passed |
| Complete module browser regression | 161/161 passed across all eleven suites |
| Release browser/viewport matrix | 8/8 passed |
| Browser channels | Chrome 152.0.7977.83 and Edge 153.0.4234.32 |
| Matrix surfaces | Company application and Platform Administration at 1440×1000 and 390×844 |
| Browser assertions | Route responses, fatal/runtime errors, console/server failures, keyboard focus, HSTS, and page-level horizontal overflow |
| Production build | Next.js 15.5.24; 65 routes/pages generated |
| Standalone packaging | Passed; public and static assets prepared |
| Repository integrity | `git fsck --no-dangling` passed |
| Dependency lock | Unchanged from `1c9fba8`; SHA-256 `F270C0E65C78319F300A142EB85C928C27F6BEB639DA4FCAAB2B87898D0C138F` |
| Dependency audit evidence | Locked npm 10.8.2 production/full audits at the unchanged v15 checkpoint reported zero vulnerabilities |

The eleven-suite total is Project Types 14, Templates 15, Company Administration 15, Users/Access 10, Integration Setup 17, Resources 14, Projects 16, Project Plan 14, Calendars/Events 16, Google Calendar 14, and Microsoft Storage 16.

## Production and authorization boundary

The user authorized deployment of this final checkpoint. Fresh Railway backup `pre-final-71fdcea` is retained as backup `59557f7c-f9e9-4ba3-a395-3b99330f3c29` (external snapshot `vs_1789967758519_rdtvlk19vkl1h226`, 1059 MB, no expiry). The exact clean archive SHA-256 was `79E179C3936274D69B69BE75EEFD3477A6DC7D6BE9931CD93338F8067C264981`; it excluded the eight user-owned pre-development changes.

Commit `71fdcea` is live as Railway deployment `f23e0f82-6b62-4f03-a88b-40ee60af9503`, image digest `sha256:2ecaabada63bfd86dbebbfd553fb29747e1573da2039af724fd1a14e82f95c61`. The 65-page build and standalone packaging completed successfully. Initial startup and the explicit restart both reported schema v15 already current; restart Ready time was 488 ms. `/api/health/ready` returned HTTP 200, `/projects` redirected to Login, module APIs returned 401, Platform provider settings returned 403, a forged-origin login POST returned 403, all API checks carried private/no-store and HSTS, the persistent volume remained READY at 1058.889728 MB, and no HTTP 5xx was observed. The expected SIGTERM from the explicit restart is dispositioned as normal process replacement. No stored credential was inspected and no authenticated production record was created.

Production-authenticated Role/tenant workflows were not exercised because no separate authorization to use stored credentials or create production QA records was granted. Their automated local gates remain green; real provider/account tests remain external gates below.

## External release gates

This checkpoint does not claim Reboot v1 production completion. The remaining external or owner-controlled gates are:

- real Resend domain/API/webhook configuration, worker scheduling/monitoring/alerting, and one approved live-recipient delivery;
- real Google and Microsoft credentials plus approved-account smoke tests;
- Safari, mobile Safari, physical mobile Chrome, screen-reader, contrast, zoom, and formal WCAG 2.2 AA verification;
- CSP design compatible with the retained Gantt/calendar assets;
- multi-factor authentication, end-user session management, and verified self-service login-email change if retained as release requirements;
- off-volume daily backup retention/alerting and scheduled restore evidence; and
- remote repository ownership, branch protection, and final business acceptance.
