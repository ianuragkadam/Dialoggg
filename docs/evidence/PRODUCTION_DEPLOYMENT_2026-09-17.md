# Production Deployment Evidence — 17 September 2026

## Outcome

The completed Foundation/Authentication, Company Administration, Project Types, and Project Templates checkpoints were deployed successfully to Railway production after clean-release QA and two release defects were corrected.

| Item | Evidence |
| --- | --- |
| Railway deployment | `0dab30fa-e3f5-4f9e-91f4-bb5bafef3635` — `SUCCESS` |
| Service | `Linkedin Automation` → `dialoggg` → `production` → `dialoggg-web` |
| Public URL | `https://dialoggg-web-production.up.railway.app` |
| Release commits | `4a48fc9`, `6adebe2`, `f2bb936` |
| Schema | Version 6, migrations 1–6 applied successfully |
| Production backup | `/data/backups/pre-migration-v0-2026-09-17T15-27-33-678Z.db` |
| Backup SHA-256 | `ffad81855aab22360a1f28f49394a5753a3b20ab1f169d937f2210bc225e3ae6` |
| Readiness | HTTP 200; `Cache-Control: no-store`; security headers present |

## Release gates

- Unit, migration, backup, restore, and static contract tests: **24/24 passed**.
- Production build: passed on Next.js **15.5.24** from an empty local runtime-data directory.
- API and end-to-end scenario suite: **133/133 passed**.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Full `npm audit`: **0 vulnerabilities**.
- Production startup created and integrity-checked a pre-migration backup before applying schema changes.
- Migrations 1–6 completed with their expected checksums, and readiness reported schema version 6.

## Live smoke and human-click checks

- `/api/health/ready` returned 200.
- Security headers included `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a restrictive Permissions Policy.
- `/register` returned 404.
- An unknown requirements-workshop bearer returned 404.
- A signed-out visit to Project Types redirected to Login.
- Login and Forgot Password rendered correctly in a real browser.
- A nonexistent test email received the approved generic password-reset response; no account-existence signal was exposed.
- The live browser reported zero console errors during the smoke path.

## Preserved production data

- Original requirements workshop: Completed, **55/55**, 100%.
- Follow-up requirements workshop: Completed, **19/19**, 100%.
- Both review endpoints returned `Cache-Control: no-store, max-age=0`.

## Security events and corrections

The Railway CLI unexpectedly printed the four existing workshop bearer values during configuration inspection. All four were rotated immediately without printing or retaining their replacements. Existing private workshop URLs are therefore invalid and must be replaced with newly generated URLs when access is needed.

The initial release attempt `cf0a758c-6158-4b7d-aae4-34d212a8d509` failed before traffic promotion because eager database initialization made the build depend on the runtime volume. Commit `f2bb936` defers database opening and schema assertion until runtime, while preserving fail-closed behavior after the explicit startup migration.

The release audit also found a critical advisory in Next.js 15.5.18. The release was upgraded to Next.js 15.5.24, audited transitive versions were pinned, all tests were rerun, and the corrected build reported zero vulnerabilities before deployment.

## Remaining external gates

- Resend API key, verified sender domain, `EMAIL_FROM`, and a controlled invitation/reset delivery are still required for live email delivery.
- The Secure Integration Setup Workshop requested for Scott is not part of this deployment and remains the next urgent module.
- Users/Access and all later backend modules remain local until each module reaches its own tested checkpoint and is approved for deployment.

