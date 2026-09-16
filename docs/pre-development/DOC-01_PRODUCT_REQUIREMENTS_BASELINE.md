# DOC-01 — Product Requirements Baseline

**Version:** 0.1  
**Status:** Under review  
**Product owner/approver:** Scott Grote  
**Technical custodian:** Development team  
**Authoritative detailed catalog:** `D:\Scott\Dialoggg_Requirements_Baseline_v1.md`

## Objective

Establish one controlled, testable v1 definition for Dialoggg Reboot. The detailed baseline remains authoritative for every `DG-*` Requirement ID; this document records approval scope, source reconciliation, critical conclusions, and change control.

## Research performed

- Reconciled the Full Product Specification and Condensed Scope of Work.
- Incorporated 55 completed original workshop answers, including five comments.
- Incorporated all 19 completed follow-up decisions.
- Compared the requirements with the existing schema, routes, Gantt/calendar implementation, and ten UI review modules.
- Reviewed the post-follow-up analysis and fresh QA gap report.
- Treated legacy `planning/` material as historical because it includes explicitly removed functionality.

## Approved product conclusions

- Dialoggg is an authenticated web application; there is no public landing page in v1.
- Successful tenant login opens Projects. Platform Administrator opens company administration.
- Platform Administrator is separate from company membership and cannot inspect tenant business content without a separate membership.
- Company roles are Owner, Admin, Employee (Internal), and External/Client.
- A global identity may belong to multiple companies, with role stored per company membership.
- Owner has all Admin capabilities plus Owner-only company management.
- Employee is read-only across the company schedule; Project assignment has team/folder/notification meaning, not schedule-visibility meaning.
- External/Client is read-only and limited to explicitly assigned Projects and safe fields.
- The original Gantt interaction model remains the Project Plan foundation.
- Tasks drive Project, Master, and Resource calendars; Events are calendar-only.
- Google Calendar is one-way from Dialoggg to a dedicated calendar in each connected user's account.
- Dialoggg links to OneDrive for Business or SharePoint; it does not store Project files.
- Discussion, Gallery, in-app file storage, custom-field builder, Billing, Google Drive, two-way calendar synchronization, and a native mobile app are excluded from v1.

## Delivery interpretation

The current application is a tested UI review prototype plus a limited working foundation. A completed UI route is not equivalent to completed persistence, authorization, integration, or production behavior. Delivery status must distinguish:

- UI review complete.
- Data model/API complete.
- Authorization complete.
- Automated verification complete.
- UAT accepted.
- Released.

## Known implementation clarifications

`IC-001` through `IC-003` remain non-blocking only while their documented safe defaults do not conflict with Scott's review feedback. If a clarification affects visible behavior, data ownership, authorization, or integration payloads, it becomes a formal decision before the affected module starts.

## Acceptance of this baseline

Scott should confirm:

1. The detailed `Dialoggg_Requirements_Baseline_v1.md` is the controlling v1 product baseline.
2. The exclusions above are correct.
3. UI feedback changes only the identified Requirement IDs and does not silently reopen unrelated decisions.
4. Workflow-specific backend work may proceed after the corresponding design document is approved.

## Change control

Every baseline change must record:

- Change ID and date.
- Requester and approver.
- Affected Requirement IDs.
- Previous and proposed wording.
- Reason and alternatives.
- UI, schema, API, security, test, schedule, cost, and deployment impact.
- Acceptance-test changes.

## Approval record

| Version | Decision | Approver | Date | Exceptions |
| --- | --- | --- | --- | --- |
| 0.1 | Pending | Scott Grote | — | — |

