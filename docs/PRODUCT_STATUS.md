# Product Status

Last verified: September 16, 2026

## Complete foundations

- Authentication-first entry with Projects after Login
- Project, Gantt, Resource, Project Calendar, Master Calendar, and Resource Calendar prototype foundations
- Retirement of Discussion, Gallery, in-app storage, Billing, Google Drive, and other confirmed exclusions
- Approved interface language for the currently implemented roles and screens
- Original and follow-up private requirements workshops with autosave, examples, comments, completion state, response review, and Markdown export
- Local Git repository, setup/deployment runbooks, tested backup/restore commands, automated test pipeline, and security/maintenance guidance

## Complete UI review modules

- Project Types management UI at `/settings/project-types`
- Admin navigation and Employee restricted-access state
- Create, rename, duplicate validation, search, empty results, safe delete, blocked delete, unsaved-change protection, responsive cards, and accessible dialogs
- UI-only demonstration state is clearly labelled and does not change production Project records
- Project Templates UI at `/templates`, `/templates/new`, `/templates/[id]`, and `/templates/[id]/use`
- Template Library, source-Project save workflow, read-only Plan detail, start-from-Template setup, exact confirmations, role restriction, and responsive states
- The existing original Gantt remains unchanged and is the planned destination for instantiated Project Tasks
- Company Administration UI at `/platform/companies`, `/platform/companies/new`, and `/platform/companies/[id]`
- Platform-only navigation, tenant-safe restricted states, company search/filtering, operational metadata, first-Owner provisioning review, and approved suspension/restore confirmations
- Scott's approved `FUP-001`, `FUP-002`, `FUP-012`, and `FUP-015` choices are reflected in the platform boundary, lifecycle behavior, per-company role direction, and 72-hour invitation language
- Users, Roles, Invitations, and Project Access UI at `/users`, `/users/new`, `/users/[id]`, and `/users/[id]/projects`
- Approved fixed Roles, search/filtering, invitation review, optional linked Resource, lifecycle confirmations, exact Project-access changes, External/Client minimum access, and Owner/Admin locks
- Focused automated and human-click QA completed; the incorrect Owner-screen Employee explanation found manually was fixed and regression-tested
- Resources and fixed Resource Categories UI at `/resources`, `/resources/new`, and `/resources/[id]`
- Five fixed Categories, searchable directory, create/edit review, one-to-one User linkage, Task/Event schedule, explicit conflict acknowledgement, independent lifecycle confirmation, and Employee read-only states
- Focused automated and human-click QA completed; ambiguous lifecycle-control names and stakeholder-specific conflict copy found manually were fixed and regression-tested
- Projects, role-based Project views, and lifecycle UI at `/projects`, `/projects/new`, `/projects/[id]`, and `/projects/[id]/edit`
- Complete required-field review, derived End Date rule, Template/blank Plan choice, User assignments, Start Date rebase, Complete/Reopen, Archive/Restore, Owner-only permanent deletion, Employee visibility, and External/Client safe view
- The existing original Gantt remains the internal Project Plan; automated and human-click QA fixed External navigation leakage and direct Completed/Archived edit access
- Project Plan/Gantt workflow UI above the unchanged original Gantt, including complete Task fields, Header/root rules, all dependency types, multiple predecessors, lag, working-day examples, cascade/drag behavior, and safe deletion
- Project, Master, and Resource Calendar UI with Day/Week/Month states, Task/Event distinction, full Event editor, recurrence/end/scope choices, Event drag confirmation, conflicts, history, and Project Plan routing
- Personal Google Calendar UI at `/account/google-calendar` with one-way delivery, a dedicated **Dialoggg** calendar, safe item previews, health/retry/failure states, disconnect choices, and explicit post-restoration resume
- Company Microsoft Storage UI at `/settings/microsoft-storage` plus each Project's **Common and Private** tab, approved role boundaries, create/link choices, company root, new-tab behavior, and graceful folder failure/recovery states
- All ten requirements-led UI modules have focused Playwright coverage, production builds, and visible human click QA; the original `GanttChart.tsx` remains unchanged
- Fresh cross-module QA on September 16, 2026 passed 261/261 automated checks and visible Chrome click testing. Seven naming, lifecycle, action, calendar-context, modal-focus, and deployment-reliability defects were fixed; full evidence and remaining release gaps are recorded in `docs/QA_GAP_ANALYSIS_2026-09-16.md`

## Requirements validation

Scott completed all 55 original workshop questions and all 19 follow-up questions. The follow-up workshop is marked Completed at 100%; every follow-up selected the recommended choice and no follow-up comments were added. These decisions have been converted into acceptance criteria and applied across all ten UI review modules.

## Not complete Reboot v1 scope

- Company Administration persistence, first-Owner invitation delivery, audit records, suspension enforcement, and synchronization control; the complete UI review module is implemented
- Final persistent Owner, Admin, Employee (Internal), and External/Client permissions; the complete UI review module is implemented
- Resource persistence, fixed-Category enforcement, User linkage, Event assignment, and lifecycle enforcement; the complete UI review module is implemented
- Project field/lifecycle persistence, Project Type/assignment wiring, External access enforcement across APIs, Template instantiation, derived End Date, and working-day rebase; the complete UI review module is implemented
- Project Types persistence/API/Project integration and complete project-access behavior; the UI review module is complete
- Project Templates persistence, APIs, live source-Project loading, and Template instantiation; the complete UI review module is implemented
- Complete weekend-aware Gantt persistence/cascade enforcement; the detailed UI review is complete and retains the original Gantt
- Event persistence, recurrence calculations, assignments, authorization, and downstream calendar writes; the detailed Event/Calendar UI review is complete
- Google OAuth, token protection, background synchronization, mapping/retry/reconciliation, and monitoring; the detailed Google Calendar UI review is complete
- Microsoft OAuth/Graph, protected company/folder identifiers, real folder create/link/open/recovery, and authorization enforcement; the detailed Common/Private UI review is complete
- Final mobile/touch pass and release browser matrix

The current application is a tested prototype and requirements platform, not the completed Reboot v1 release.
