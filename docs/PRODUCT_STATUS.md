# Product Status

Last verified: September 20, 2026

## Complete foundations

- Authentication-first entry with Projects after Login
- Project, Gantt, Resource, Project Calendar, Master Calendar, and Resource Calendar foundations
- Retirement of Discussion, Gallery, in-app storage, Billing, Google Drive, and other confirmed exclusions
- Approved interface language for the currently implemented roles and screens
- Original and follow-up private requirements workshops with autosave, examples, comments, completion state, response review, and Markdown export
- Local Git repository, setup/deployment runbooks, tested backup/restore commands, automated test pipeline, and security/maintenance guidance

## Complete UI review modules

- Persistent Project Types management at `/settings/project-types`
- Owner/Admin tenant-scoped create, rename, and safe delete APIs with CSRF protection and audit records; Employee/External management access is denied
- Every Project is backfilled and database-enforced to have exactly one active same-company type; Project create/update rejects null and cross-company types
- Rename propagation, All Projects multi-select filtering, Master Calendar one-or-more filtering, exact affected-Project disclosure, reassign-then-delete, refresh persistence, responsive cards, and accessible dialogs
- Project Types passed 23/23 unit, 126/126 scenario, and 149/149 live browser checks and was deployed in Railway release `0dab30fa-e3f5-4f9e-91f4-bb5bafef3635`
- Persistent Project Templates at `/templates`, `/templates/new`, `/templates/[id]`, and `/templates/[id]/use`, backed by tenant-scoped CSRF-protected APIs and audit records
- Owner/Admin can atomically snapshot hierarchy, Headers/leaves, durations, relative working-day offsets, all dependency types, colors, weekend rules, Categories, and optional exact Resources from a live company Project Plan
- Instantiation is idempotent and transactional, requires a valid same-company Project Type and Start Date, resets progress to 0%, handles missing/inactive defaults with visible warnings, and creates ordinary independent Project Tasks in the unchanged original Gantt
- Project Templates passed 24/24 unit, 133/133 scenario, 15/15 focused browser, and 152/152 complete browser checks and was deployed in Railway release `0dab30fa-e3f5-4f9e-91f4-bb5bafef3635`
- Company Administration UI at `/platform/companies`, `/platform/companies/new`, and `/platform/companies/[id]`
- Platform-only navigation, tenant-safe restricted states, company search/filtering, operational metadata, first-Owner provisioning review, and approved suspension/restore confirmations
- Scott's approved `FUP-001`, `FUP-002`, `FUP-012`, and `FUP-015` choices are reflected in the platform boundary, lifecycle behavior, per-company role direction, and 72-hour invitation language
- Company Administration is now server-backed: platform-only APIs persist unique companies, seed fixed Categories, queue encrypted first-Owner invitations, enforce suspension/session revocation, preserve tenant/Microsoft records, and restore access with Google still paused for review
- Secure Integration Setup is locally complete: hashed fragment invitations, short-lived HttpOnly sessions, platform/company scope separation, versioned AES-256-GCM credentials, PKCE OAuth verification, Resend domain/test controls, read-only review, and Platform Administrator link rotation are covered by the schema-v8 checkpoint
- The authenticated header now switches one global identity among its authorized company and Platform Administration contexts by rotating the session
- Users, Roles, Invitations, and Project Access UI at `/users`, `/users/new`, `/users/[id]`, and `/users/[id]/projects`
- Approved fixed Roles, search/filtering, invitation review, optional linked Resource, lifecycle confirmations, exact Project-access changes, External/Client minimum access, and Owner/Admin locks
- Focused automated and human-click QA completed; the incorrect Owner-screen Employee explanation found manually was fixed and regression-tested
- Resources and fixed Resource Categories UI at `/resources`, `/resources/new`, and `/resources/[id]`
- Resource Management is now persistent locally: five database-locked Categories, tenant-safe normalized names, audited create/edit/lifecycle writes, one-to-one company membership linkage, Task/Event-series assignments, optimistic versions, and preserved history on deactivate/restore
- Owner/Admin manage, Employee reads, and External/Client is denied across the server pages and v1 APIs; legacy Resource/User paths use the same fixed-Category and normalization rules
- Verification passed 28/28 unit/foundation/migration checks, 136/136 scenarios, 14/14 focused Resource browser checks, and 155/155 browser checks across all eleven suites; production/full dependency audits report zero vulnerabilities
- Projects, role-based Project views, and lifecycle UI at `/projects`, `/projects/new`, `/projects/[id]`, and `/projects/[id]/edit`
- Projects and lifecycle are now persistent locally: complete required fields, derived End Date rule, real Template/blank Plan choice, tenant-safe User assignments, optimistic versions, explicit date-only/shift-unfinished Start Date handling, Complete/Reopen, Archive/Restore, durable audits, and Owner-only exact-name deletion
- Migration 10 enforces approved lifecycle transitions and Archive-before-delete at the database boundary; Employee remains company-wide read-only and External/Client remains assigned-only with safe serialization
- Verification passed 29/29 unit/foundation/migration checks, 142/142 scenarios, 16/16 focused Projects browser checks, and 156/156 browser checks across all eleven suites; production/full dependency audits report zero vulnerabilities
- The existing original Gantt remains the internal Project Plan; automated and human-click QA fixed External navigation leakage and direct Completed/Archived edit access
- Project Plan/Gantt is persistent locally on the retained original DHTMLX interface. Schema v11 and the server scheduling engine enforce one protected root, Header/leaf invariants, inclusive working days, independent weekends, FS/SS/FF/SF dependencies, non-negative lag, multiple predecessors, cycle rejection, earlier/later cascade, linked-drag review, atomic Resource assignment, roll-ups, optimistic versions, safe deletion, audit, and tenant/Role boundaries.
- Gantt, Project End Date, Project/Master/Resource Calendars, Resource conflict views, and iCal feeds use the same weekend-aware schedule result. Verification passes 11/11 focused engine/migration checks, 143/143 scenarios, 14/14 focused Project Plan browser checks, and 157/157 browser checks across all eleven suites.
- Events and Calendars are persistent locally on schema v12. One canonical tenant-scoped Event series supports optional Project rollup, multiple Resources, all-day/timed company-zone scheduling, daily/weekly/monthly recurrence, date/count/open ends, occurrence replacement/cancellation, entire-series update/soft-delete, optimistic versions, audited writes, and durable conflict acknowledgements.
- Project, Master, and Resource Calendars plus iCalendar expand the same Event series/exceptions and shared weekend-aware Task schedule. Event drag and series/occurrence edits explicitly confirm Resource conflicts; Employee is read-only and External/Client is assignment- and visibility-scoped.
- Verification passes 32/32 unit/foundation/migration tests, 149/149 scenarios, 16/16 focused Calendar/Event browser checks, and 158/158 browser checks across all eleven suites. TypeScript, the 60-page production build, standalone packaging, and locked npm 10.8.2 production/full audits are green with zero vulnerabilities.
- Personal Google Calendar delivery is implemented locally on schema v13. Each company membership can authorize one personal connection using PKCE, single-use state, offline access, encrypted refresh-token/calendar-ID envelopes, and the least-privilege `calendar.app.created` scope. Dialoggg creates one dedicated **Dialoggg** calendar and remains the one-way source of truth.
- Internal delivery follows the User's one-to-one linked Resource; External/Client delivery is assigned-Project and external-visibility scoped. Stable deterministic mappings reconcile eligible Task/Event occurrences without duplicates, mutation hooks enqueue company connections, transient failures back off for up to 24 hours before dead-lettering, and safe health supports retry plus explicit resume after company restoration.
- Permanent Platform Google settings at `/platform/integration-setup` let the Platform Administrator save/rotate/disable/enable/revoke a write-only encrypted OAuth client secret without an environment file. Current-password reauthentication, safe statuses, callback derivation from `APP_BASE_URL`, and a real OAuth plus temporary Calendar create/read/delete verification gate protect User connections.
- Google verification passes 32/32 unit/foundation/migration checks, 153/153 production-like scenarios, 14/14 focused browser checks, and 159/159 browser checks across all eleven suites. The schema-v13 production bundle builds 62 pages; production remains unchanged.
- Microsoft OneDrive for Business/SharePoint delivery is implemented locally on schema v14. A Platform Administrator manages one write-only encrypted Entra application at `/platform/integration-setup`; it becomes Valid only after PKCE OAuth, required-scope, Graph identity, and temporary write/delete capability verification.
- Each company Owner/Admin connects its own delegated Microsoft account at `/settings/microsoft-storage`, chooses OneDrive for Business or SharePoint, and may change the future company root without moving existing Project mappings. Encrypted tenant/account/site/drive/root/refresh-token values never enter safe browser DTOs.
- Each Project's **Common and Private** tab supports retry-safe create or link, stable encrypted drive/item identifiers, new-tab open with display-name refresh, and recoverable renamed/missing/permission/disconnected/revoked states. Owner/Admin manage both; assigned Employee/External receives Common only; Private identifiers are omitted.
- Project lifecycle and company disconnect preserve folders and mappings. Dialoggg never grants Microsoft permissions and never automatically renames, moves, or deletes Microsoft content.
- Microsoft verification passes 33/33 unit/foundation/migration checks, 164/164 production-like scenarios, 16/16 focused browser checks, and 160/160 browser checks across all eleven suites. TypeScript, the 64-page production build, standalone packaging, and locked npm 10.8.2 production/full audits are green with zero vulnerabilities; production remains unchanged.
- All ten requirements-led UI modules have focused Playwright coverage, production builds, and visible human click QA; the original `GanttChart.tsx` remains the Plan foundation and now persists through the scheduling APIs.
- Fresh cross-module QA on September 16, 2026 passed 261/261 automated checks and visible Chrome click testing. Seven naming, lifecycle, action, calendar-context, modal-focus, and deployment-reliability defects were fixed; full evidence and remaining release gaps are recorded in `docs/QA_GAP_ANALYSIS_2026-09-16.md`

## Requirements validation

Scott completed all 55 original workshop questions and all 19 follow-up questions. The follow-up workshop is marked Completed at 100%; every follow-up selected the recommended choice and no follow-up comments were added. These decisions have been converted into acceptance criteria and applied across all ten UI review modules.

## Not complete Reboot v1 scope

- Live provider delivery for queued first-Owner invitations; Company Administration persistence, audit, authorization, suspension, and per-company Google pause state are implemented
- Final persistent Owner, Admin, Employee (Internal), and External/Client permissions; the complete UI review module is implemented
- Production deployment and live-volume verification of the locally complete Resource Management schema-v9 checkpoint; Google delivery remains a separate checkpoint
- Production deployment and live-volume verification of the locally complete Projects/lifecycle schema-v10, Gantt/cascade schema-v11, Events/Calendars schema-v12, Google Calendar schema-v13, and Microsoft/OneDrive schema-v14 checkpoints
- Production deployment and live-volume verification of the locally complete Project Templates checkpoint
- Live Google Cloud credential entry/verification, controlled production deployment, scheduled worker operation, and live-account smoke testing; OAuth, encrypted tokens, one-way delivery, mapping/retry/reconciliation, monitoring, disconnect, and resume are complete locally
- Real Microsoft Entra/Graph credential entry, controlled production deployment, and approved-tenant live OneDrive/SharePoint smoke testing; OAuth, encryption, root/folder mapping, create/link/open/recovery, lifecycle preservation, and authorization enforcement are complete locally
- Final mobile/touch pass and release browser matrix

The current application is a tested prototype and requirements platform, not the completed Reboot v1 release.
