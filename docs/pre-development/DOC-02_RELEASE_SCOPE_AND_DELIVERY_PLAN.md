# DOC-02 — Release Scope and Delivery Plan

**Version:** 0.1  
**Status:** Draft  
**Scope:** Dialoggg Reboot v1

## Release objective

Deliver a secure multi-company scheduling application in which authorized users manage Projects, Resources, Tasks, dependencies, Events, calendars, Project Types, Templates, Google delivery, and Microsoft folder links under the approved role model.

## Release 1 scope

| Increment | Capability | Entry condition | Exit evidence |
| --- | --- | --- | --- |
| R1.1 | Identity, company membership, sessions, invitations, password reset | DOC-01, DOC-04–07 reviewed | Auth/API tests; tenant isolation; invite/reset delivery |
| R1.2 | Company, Users, roles, Project access, audit | R1.1; permission matrix approved | Positive/negative role tests; last-Owner protection; audit evidence |
| R1.3 | Project Types, Resources, Projects, lifecycle | Target model/API approved | CRUD/lifecycle tests; derived dates; assignment enforcement |
| R1.4 | Gantt and Project Templates | DOC-08 approved; golden cases agreed | Algorithm tests; original-Gantt regression; Template instantiation tests |
| R1.5 | Events and all calendars | Recurrence/time-zone model approved | Calendar rollup, recurrence, conflict, drag-confirmation tests |
| R1.6 | Google Calendar | DOC-09 approved; Google project available | OAuth, mapping, retry, privacy, reconciliation tests |
| R1.7 | OneDrive/SharePoint | DOC-10 approved; Microsoft tenant available | OAuth, root/folder mapping, role visibility, recovery tests |
| R1.8 | Operational readiness and UAT | DOC-11–18 release gates satisfied | UAT sign-off, restore drill, release record, handover |

## Explicitly excluded from v1

- Marketing landing page.
- Discussion boards or messaging forum.
- Gallery/photo management.
- Dialoggg-hosted file storage.
- Custom fields or custom-role builder.
- Billing, payments, plans, coupons, and subscription administration.
- Google Drive integration.
- Import from Google Calendar or any two-way synchronization.
- Native iOS or Android application.
- Automatic Microsoft permission grants, folder renames, or folder deletion.
- Legacy-data or spreadsheet import unless separately approved through change control.

## Delivery principles

- Preserve the original Gantt component and validate behavior with characterization tests before modifying scheduling logic.
- Enforce authorization server-side; UI hiding is only a usability layer.
- Keep Dialoggg as source of truth for Google-synchronized items.
- Treat Microsoft folder identity as external mapping; Microsoft remains the access-control authority.
- Ship vertical slices with schema, API, UI, authorization, audit, tests, and documentation together.
- Use feature flags or inaccessible routes for incomplete integrations; do not display fake success.

## Dependency chain

```text
Identity → Company Membership → Authorization → Project Access
                                      ↓
Project Types → Projects → Tasks/Dependencies → Calendars → Google
Resources ───────────────→ Task/Event assignment ────────────┘
Projects → Microsoft folder mappings
Projects + Gantt → Templates
```

## Definition of Ready

A work item is ready when it has Requirement IDs, approved behavior, data ownership, permission rules, API/schema impact, error/failure states, acceptance tests, dependencies, and no unresolved critical decision.

## Definition of Done

A work item is done only when code review, migrations, server authorization, validation, audit behavior, unit/API/browser tests, accessibility checks, documentation, deployment verification, and traceability are complete. UI-only demonstration is not Done for a functional requirement.

## Risks and mitigations

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| Owner authorization differs across current routes | Incorrect access | Central policy service; exhaustive matrix tests |
| Current global `user.company_id` conflicts with multi-company memberships | Data-model rework | Implement identity + membership before more role logic |
| SQLite allows one writer at a time | Locks under jobs/UI writes | Short transactions, queue serialization, load test, documented Postgres trigger |
| Gantt changes regress original experience | Core product failure | Characterization/golden tests and isolated calculation engine |
| OAuth/vendor setup arrives late | Schedule delay | Obtain test tenants/apps before module start |
| Client UI changes during backend work | Rework | Build stable foundations first; gate workflow modules on review |

## Schedule policy

No calendar estimate is asserted until the technical spikes in DOC-05, DOC-08, DOC-09, and DOC-10 are complete. Estimates must include testing, migration, operations, UAT, and rework—not only coding.

