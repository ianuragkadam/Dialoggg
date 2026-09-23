# Dialoggg Bug Sheet Remediation Checkpoint

Date: 23 September 2026

Source: `Dialoggg Bug Tracker`, tab `Bug Log`, sheet ID `775065822`, rows 3–10. The source spreadsheet was read-only during this work and was not changed.

Local base: `67ab5a0`

Production baseline at review start: schema v15. This checkpoint has no schema change and has not been deployed.

## Result

All eight entries in the supplied bug sheet were reproduced or traced to their code path and remediated:

| Bug | Resolution | Verification |
| --- | --- | --- |
| Login password has no visibility control | Added one accessible, reusable Show/Hide password control with `aria-pressed`; used by Login and Change Password. | Foundation test and Chrome/Edge desktop/phone release matrix. |
| Dialoggg favicon missing | Added an App Router `icon.svg`, automatically emitted as `/icon.svg`. | Production build route inventory. |
| Shared pages are not responsive on mobile/tablet | Rebuilt the primary navigation as a closed-by-default mobile drawer with backdrop, header-level close control, route-close behavior, and desktop-static layout. | Chrome/Edge 390×844 matrix, all module phone checks, no page-level overflow. |
| Platform Administrator Google Calendar action fails without visible feedback | Removed the invalid personal-calendar action from Platform context, explains the company-context requirement, and redirects direct Platform access safely. Google errors now remain visible and styled. | Focused Google browser test, including Platform Account and direct-route behavior. |
| Shared list pages have no pagination | Added reusable 12-item pagination to Companies, Projects, Resources, Users, Project Templates, and Project Types; searches and filters reset to page 1. | Foundation coverage plus the corresponding six focused browser suites. |
| Change Password fields have no visibility controls | Reused the accessible Show/Hide control for Current Password and New Password. | Foundation and production build/type gate. |
| Integration actions do not clearly show success or failure | Added consistent information, success, and error feedback banners with status/alert live-region semantics across Google, Microsoft, Resend, and secure-link issuance. | Integration Setup 19/19 and Google 15/15 focused browser suites. |
| Add Project phone accepts letters, symbols, and more than 10 digits | Client input now strips non-digits and caps at 10; both legacy and v1 server paths reject non-digit/overlength values with a field error. | Negative API scenario, Project browser flow, and 170/170 scenario regression. |

## Security and authorization review

- No authorization or tenant boundary was broadened.
- Platform Administration cannot enter a company-personal Google Calendar workflow without an active company context.
- Phone validation is enforced server-side, not only in the browser.
- Integration errors use `role="alert"`; successful and in-progress outcomes use polite status regions.
- No dependency was added and the dependency lock is unchanged from the prior zero-vulnerability audited release.
- No production credential, authenticated production record, or secret was accessed.

## Automated verification

| Gate | Result |
| --- | --- |
| Production build / TypeScript | Passed; Next.js 15.5.24, 66 generated pages/routes |
| Standalone packaging | Passed |
| Unit/foundation/migration/config/security | 43/43 passed |
| Production-like API scenarios | 170/170 passed |
| Focused and full module browser suites | 172/172 passed |
| Chrome/Edge desktop/phone release matrix | 8/8 passed |
| Project browser flow | 16/16 passed |
| Google browser flow | 15/15 passed |
| Integration Setup browser flow | 19/19 passed |

The browser total comprises Company Administration 15, Users/Access 10, Resources 14, Project Types 14, Project Templates 15, Projects 16, Project Plan 14, Calendars/Events 16, Google Calendar 15, Microsoft Storage 16, Integration Setup 19, and the Chrome/Edge release matrix 8.

## Deployment boundary

This is a schema-neutral local checkpoint. Deploy only from its clean committed archive after separate explicit user authorization and a fresh verified Railway production backup. Preserve the existing user-owned pre-development document changes; they are not part of this checkpoint.
