# Product Status

Last verified: September 15, 2026

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

## Requirements validation

Scott completed all 55 original workshop questions and all 19 follow-up questions. The follow-up workshop is marked Completed at 100%; every follow-up selected the recommended choice and no follow-up comments were added. These decisions are now being converted into acceptance criteria and applied to each remaining UI module.

## Not complete Reboot v1 scope

- Company Administration persistence, first-Owner invitation delivery, audit records, suspension enforcement, and synchronization control; the complete UI review module is implemented
- Final persistent Owner, Admin, Employee (Internal), and External/Client permissions; the complete UI review module is implemented
- Project Types persistence/API/Project integration and complete project-access behavior; the UI review module is complete
- Project Templates persistence, APIs, live source-Project loading, and Template instantiation; the complete UI review module is implemented
- Complete weekend-aware Gantt cascade rules
- Full Event management and approved calendar behavior
- Google Calendar API synchronization
- Microsoft OneDrive Common and Private folders
- Final mobile/touch pass and release browser matrix

The current application is a tested prototype and requirements platform, not the completed Reboot v1 release.
