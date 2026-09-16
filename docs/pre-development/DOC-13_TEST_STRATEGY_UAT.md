# DOC-13 — Test Strategy, Acceptance, and Test Data Plan

**Version:** 0.1  
**Status:** Active draft  
**Current evidence:** 261/261 automated checks plus visible Chrome QA passed on September 16, 2026

## Quality objective

Demonstrate that each approved Requirement ID works for the permitted role, fails safely for every denied role, preserves tenant isolation and data integrity, remains usable on supported browsers/devices, and can be deployed/recovered operationally.

## Test levels

| Level | Scope | Required evidence |
| --- | --- | --- |
| Static | Type checking, lint/policy, dependency/secret checks | CI result and findings disposition |
| Unit/property | Date math, cascade, authorization, validation, recurrence, serializers | Deterministic isolated tests |
| Data/migration | Fresh schema, previous-version migration, constraints, rollback/forward-fix | Sanitized database copy results |
| API/contract | Schema, status/error, role, tenant, lifecycle, idempotency, concurrency | Contract + integration suite |
| Integration | Email, Google, Microsoft, jobs/outbox, backup | Vendor sandbox and failure tests |
| Browser | Complete role workflows, dialogs, responsive behavior | Playwright on supported matrix |
| Accessibility | Keyboard, screen reader spot checks, zoom/reflow, contrast, drag alternative | Automated report + manual checklist |
| Performance | API, Plan load/cascade, calendar, jobs, database locks | Benchmark report against DOC-12 |
| Security | Authentication abuse, CSRF, XSS, IDOR/tenant isolation, tokens/secrets | Security test report |
| Recovery | Deployment rollback, database restore, vendor reconnect | Timed drill record |
| UAT | Client role journeys and business outcomes | Signed UAT results by Requirement ID |

## CI gates

Every change must pass unit tests, production build/type checks, scenario/API tests, changed-module browser tests, and documentation/traceability checks. Schema changes also require fresh-install and previous-schema migration tests. Authorization changes require all role allow/deny scenarios, not only the requested happy path.

Release candidates additionally require the complete browser matrix, security/dependency review, representative-data performance run, backup/restore evidence, and UAT disposition.

## Critical scenario catalog

- Authentication: valid/invalid, enumeration resistance, rate limiting, expiry, revoke, invitation/reset reuse.
- Multi-company: one identity with different roles; company switch; suspended company; platform boundary.
- Roles: every DOC-04 cell plus direct URL/API/ID substitution and stale sessions.
- Projects: create/edit, assignments, Complete/Reopen, Archive/Restore, Owner-only deletion.
- Project Start Date: completed Tasks never move; date-only and unfinished-only shift choices follow `IC-001`.
- Gantt: complete DOC-08 golden suite and original component characterization.
- Templates: relative-date copy, exact Resource option, atomic instantiation, duplicate names.
- Events: timed/all-day, recurrence/end modes, occurrence/series changes, conflicts, time zones.
- Google: safe payload, create/update/delete, duplicate job, revoke, disconnect choices, 24-hour retry.
- Company restore: application access resumes while Google remains paused until explicit Owner/Admin health review and resume (`IC-002`).
- Microsoft: create/link, stable ID after rename/move, role link visibility, permission denial, no delete/rename.
- Operations: deployment healthcheck, failed migration, restore, alert, and incident drill.
- Performance: 10 simultaneous active Users in one company plus background synchronization (`IC-003`), followed by a separate 2× engineering stress run.

## Test data

- Never use production client data in automated or developer tests.
- Generate isolated companies covering every role and lifecycle state.
- Include two companies with overlapping names/emails to expose missing tenant filters.
- Include assigned/unassigned External and Employee memberships.
- Include small, large, archived, completed, and adversarial Projects.
- Include Gantt chains, branches, merges, weekends, month/year/leap-day boundaries.
- Store test OAuth/vendor accounts in dedicated sandbox tenants/projects and secrets storage.
- Test cleanup must validate that only its unique temporary database/resources are removed.

## Browser/device matrix

- Current stable Chrome and Edge on desktop.
- Current stable Safari on supported macOS.
- Mobile Safari on a current supported iPhone viewport/device.
- Mobile Chrome on a current supported Android viewport/device.
- Desktop widths, 200% zoom, keyboard-only, and phone widths for every primary route.

Exact versions are recorded at release time because the approved requirement targets maintained browser families.

## Defect severity

| Severity | Definition | Release rule |
| --- | --- | --- |
| S0 | Data exposure/loss, credential compromise, unrecoverable corruption | Stop work/release; incident process |
| S1 | Core workflow unavailable, incorrect authorization/schedule, no safe workaround | Release blocker |
| S2 | Material workflow defect with safe workaround | Must fix or obtain explicit acceptance |
| S3 | Minor visual/usability/documentation issue | May defer with owner/date |

## UAT roles and journeys

Scott or named delegates test Platform Administrator, Owner, Admin, Employee, and External/Client accounts. UAT covers company setup, invitations, role boundaries, Project creation/lifecycle, Project Plan, all calendars, Templates, Google, Microsoft links, phone layouts, and recovery messages.

Each UAT record contains UAT ID, Requirement IDs, preconditions, role, steps, expected/actual result, evidence, defect, tester, date, and Accepted/Rejected/Accepted with exception.

## Exit criteria

- All Must requirements have passing traceability or approved exception.
- No open S0/S1 defect.
- S2 defects have explicit owner, workaround, due date, and acceptance.
- Security, performance, accessibility, migration, backup/restore, and browser evidence meet agreed targets.
- Scott signs UAT and release scope.
