# Dialoggg Reboot — Controlled Pre-Development Document Set

**Version:** 0.1  
**Prepared:** September 16, 2026  
**Status:** Draft documentation baseline  
**Controlling product source:** `D:\Scott\Dialoggg_Requirements_Baseline_v1.md`

## Purpose

This folder converts the approved product requirements and tested UI prototype into documents that engineering, QA, operations, and the client can review and sign off. These are implementation-control documents, not claims that the backend is complete.

## Source precedence

1. Scott's approved follow-up decisions.
2. Scott's original questionnaire decisions and comments.
3. Full Product Specification.
4. Condensed Scope of Work.
5. Team technical baseline where client sources are silent.

Historical planning files under `planning/` are evidence only. They contain superseded features such as Discussion, Gallery, local file storage, public registration, and global roles; those items do not override the current requirements baseline.

## Document register

| ID | Document | Gate | Status |
| --- | --- | --- | --- |
| DOC-01 | [Product Requirements Baseline](DOC-01_PRODUCT_REQUIREMENTS_BASELINE.md) | Before shared backend | Under review |
| DOC-02 | [Release Scope and Delivery Plan](DOC-02_RELEASE_SCOPE_AND_DELIVERY_PLAN.md) | Before shared backend | Draft |
| DOC-03 | [Requirements Traceability Matrix](DOC-03_REQUIREMENTS_TRACEABILITY_MATRIX.md) | All gates | Active draft |
| DOC-04 | [Roles, Permissions, and Data Visibility](DOC-04_ROLES_PERMISSIONS_MATRIX.md) | Before shared backend | Approval required |
| DOC-05 | [Domain Model, Data Dictionary, and Migrations](DOC-05_DOMAIN_MODEL_DATA_DICTIONARY_MIGRATIONS.md) | Before shared backend | Architecture decision required |
| DOC-06 | [Target Architecture and ADRs](DOC-06_TARGET_ARCHITECTURE_AND_ADRS.md) | Before shared backend | Architecture decision required |
| DOC-07 | [API Contract and Error Model](DOC-07_API_CONTRACT.md) | Shared conventions before backend; module detail before module | Draft |
| DOC-08 | [Gantt Scheduling Rules](DOC-08_GANTT_SCHEDULING_RULES.md) | Before Gantt backend | Approval required |
| DOC-09 | [Google Calendar Integration](DOC-09_GOOGLE_CALENDAR_INTEGRATION.md) | Before Google implementation | Vendor setup required |
| DOC-10 | [OneDrive and SharePoint Integration](DOC-10_ONEDRIVE_SHAREPOINT_INTEGRATION.md) | Before Microsoft implementation | Tenant setup required |
| DOC-11 | [Security, Privacy, and Threat Model](DOC-11_SECURITY_PRIVACY_THREAT_MODEL.md) | Core before backend; final before release | Active draft |
| DOC-12 | [Non-Functional Requirements](DOC-12_NON_FUNCTIONAL_REQUIREMENTS.md) | Targets before backend; proof before release | Approval required |
| DOC-13 | [Test Strategy and UAT](DOC-13_TEST_STRATEGY_UAT.md) | Before backend and release | Active draft |
| DOC-14 | [Deployment, Configuration, Secrets, and Migrations](DOC-14_DEPLOYMENT_CONFIG_SECRETS_MIGRATIONS.md) | Before release | Draft |
| DOC-15 | [Backup and Disaster Recovery](DOC-15_BACKUP_DISASTER_RECOVERY.md) | Before release | Partial implementation |
| DOC-16 | [Observability, Support, and Incident Response](DOC-16_OBSERVABILITY_SUPPORT_INCIDENTS.md) | Before release | Draft |
| DOC-17 | [Data Migration, Demo Data, and Client Onboarding](DOC-17_DATA_MIGRATION_DEMO_CLIENT_ONBOARDING.md) | Before real-user onboarding | Draft |
| DOC-18 | [Release Approval, Handover, and Change Control](DOC-18_RELEASE_APPROVAL_HANDOVER_CHANGE_CONTROL.md) | Before release/handover | Draft |

## Approval rules

- **Draft:** authoring or research remains.
- **Under review:** internally coherent and ready for named reviewers.
- **Approved:** implementation baseline signed off by the stated authority.
- **Superseded:** replaced by a newer version with a traceable change record.
- **Retired:** no longer applies, with rationale retained.

No document in this folder is client-approved merely because it exists. Approval requires reviewer name, date, version, and recorded exceptions.

## Minimum start gate

Backend foundation work should start only after DOC-01 and DOC-04 through DOC-07 have no unresolved launch-critical contradiction. DOC-03, DOC-11, DOC-12, and DOC-13 must be active and maintained from the first implementation change.

## QA and research evidence

The second-pass requirements, code/schema, security, vendor, operations, and document audit is recorded in [Deep QA and R&D Report — September 16, 2026](DOCUMENT_QA_REPORT_2026-09-16.md). It records corrections, launch-critical implementation gaps, official-source research, technical recommendations, and remaining approvals without representing draft decisions as client-approved.
