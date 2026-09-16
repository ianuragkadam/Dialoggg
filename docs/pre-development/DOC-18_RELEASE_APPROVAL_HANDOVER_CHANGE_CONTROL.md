# DOC-18 — Release Approval, Handover, and Change Control

**Version:** 0.1  
**Status:** Draft

## Release approval pack

Every candidate release contains:

- Approved scope/version and Requirement-ID changes.
- RTM showing implementation, automated test, UAT, and exception status.
- Architecture/data/API document versions and ADRs.
- Migration plan/rehearsal and verified backup.
- Test summary: unit, API, integration, browser, accessibility, performance, security, recovery.
- Dependency/security finding disposition.
- Known limitations, deferred scope, open defects, workarounds, owners, and dates.
- Deployment/rollback plan and environment/configuration review.
- UAT sign-off and release/no-release decision.

## Release checklist

| Gate | Owner | Result/evidence |
| --- | --- | --- |
| Scope and requirements approved | Product owner | |
| Design/ADRs approved | Technical owner | |
| Permission/threat review passed | Security/technical owner | |
| Migration rehearsal and backup passed | Engineering/operations | |
| CI and release test suite passed | QA | |
| Performance/accessibility/browser targets met | QA/product | |
| UAT accepted | Scott/client approver | |
| Known risks accepted | Product/technical owner | |
| Deployment and rollback ready | Release manager | |
| Support/monitoring/backup ready | Operations | |

## UAT acceptance record

| Field | Value |
| --- | --- |
| Release/version | |
| Environment/build/deployment | |
| Requirements/UAT set | |
| Accepted scenarios | |
| Rejected/exception scenarios | |
| Known limitations | |
| Client approver/date | |
| Release conditions | |

## Handover inventory

- Git repository under approved client/team organization with branch protection and access list.
- Railway workspace/project/service/environment/volume ownership and least-privilege members.
- Domain/DNS and certificate ownership.
- Email provider/domain and templates.
- Google Cloud OAuth project and verification ownership.
- Microsoft Entra application, tenant consent, and SharePoint/OneDrive administrator.
- Backup destination/encryption/restore authority.
- Monitoring/alert destinations and support escalation contacts.
- Source, setup, architecture, schema, API, security, tests, deployment, recovery, incident, onboarding, and release documents.
- Secrets transferred through an approved password manager, never embedded in the handover document.
- Demonstrated setup, test, deployment, rollback, backup, restore, monitoring, and incident procedures.

## Change request template

| Field | Required content |
| --- | --- |
| Change ID/title | Unique ID and concise name |
| Requester/date | Person and timestamp |
| Problem/outcome | Why change is needed |
| Affected Requirement IDs | Exact `DG-*` IDs or proposed new IDs |
| Current/proposed behavior | Testable before/after |
| Alternatives | Including no change |
| Impact | UI, data, API, permissions, security, integrations, tests, docs, schedule/cost |
| Risk/rollback | Failure modes and reversibility |
| Decision | Approve/reject/defer, approver/date |
| Delivery evidence | Commit, tests, UAT, release |

## Change classes

- **Correction:** clarifies wording without changing observable behavior; custodian review.
- **Minor:** localized behavior with no security/data-contract effect; product + technical approval.
- **Major:** scope, permissions, data model, Gantt math, external integration, privacy, or release target; client/product, technical, QA, and security impact review.
- **Emergency:** production containment/restoration; incident authority acts first within runbook, then retrospective change record.

## Versioning and records

- Approved documents are immutable snapshots; later edits create a new version and change log.
- Release notes list added, changed, fixed, security/operations, migrations, known limitations, and rollback considerations.
- Keep approvals, UAT evidence, deployment records, restore drills, incidents, and change decisions in the agreed controlled repository/location.

## Final acceptance statement

The release is not complete because the UI appears finished. It is complete only when approved requirements are implemented, role/data boundaries are enforced, tests and UAT pass, operations can recover/support it, ownership is transferred, and the named authorities record acceptance.

