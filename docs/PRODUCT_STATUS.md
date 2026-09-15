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

## Requirements validation

Scott completed all 55 workshop questions at the latest release verification, with five question comments saved. The answers and comments must now be reviewed and converted into acceptance criteria before implementing the remaining modules.

## Not complete Reboot v1 scope

- Platform Administrator and company provisioning
- Final Owner, Admin, Employee (Internal), and External/Client permissions
- Project Types persistence/API/Project integration and complete project-access behavior; the UI review module is complete
- Project Templates persistence, APIs, live source-Project loading, and Template instantiation; the complete UI review module is implemented
- Complete weekend-aware Gantt cascade rules
- Full Event management and approved calendar behavior
- Google Calendar API synchronization
- Microsoft OneDrive Common and Private folders
- Final mobile/touch pass and release browser matrix

The current application is a tested prototype and requirements platform, not the completed Reboot v1 release.
