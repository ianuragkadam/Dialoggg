# DOC-17 — Data Migration, Demo Data, and Client Onboarding

**Version:** 0.1  
**Status:** Draft  
**Current approved v1 boundary:** Manual entry; legacy/spreadsheet import is not required

## Migration scope

No legacy business-data import is required for v1 acceptance unless approved by change control. Technical schema migration of the current Dialoggg prototype database is required, including identity/membership conversion and preservation of requirements-workshop records.

## Technical migration controls

- Inventory source tables, versions, row counts, orphans, duplicates, and invalid enum/date values.
- Back up and rehearse against a sanitized production copy.
- Map old `user.company_id/user_type` to global `identity` plus `company_membership`.
- Map legacy `viewer` to Employee (Internal), preserving original value in migration evidence.
- Keep Platform Administrator outside company membership unless separately invited.
- Preserve Project, assignment, Task, dependency, Resource, Event, session/revocation decision, and questionnaire relationships.
- Reconcile source/target counts and exceptions; no silent drops.

## Demo environment/data

Current production review workspace:

- Company: **Dialoggg Demo Company**.
- Five role-specific accounts: Platform Administrator, Owner, Administrator, Employee (Internal), External/Client.
- Project: **Demo Court Project**, assigned to the External/Client account.
- All five login paths were verified on September 16, 2026.

Passwords are intentionally excluded from repository documentation. Demo credentials are distributed privately, rotated after exposure, and never reused for real users.

## Demo lifecycle policy

- Mark all demo identities/records explicitly.
- Maintain an owner, purpose, created date, last verified date, and expiry/review date.
- Do not mix client production records into the demo company.
- Reset only through a controlled, company-scoped procedure with backup where production-hosted.
- Remove or rotate demo credentials before launch; confirm no demo account has elevated access beyond its purpose.
- Platform demo access is especially sensitive and must be disabled when not actively required.

## Real company onboarding

1. Platform Administrator creates Company Name, IANA Time Zone, and first Owner name/email.
2. System creates inactive/pending membership and sends a 72-hour single-use invitation.
3. Owner sets password, accepts terms/policy where required, and signs in.
4. Owner confirms company settings and adds another Owner before risky ownership changes.
5. Owner/Admin configures fixed Resource Categories/Resources, Project Types, Templates, and initial Users/assignments.
6. Owner/Admin optionally connects Microsoft company storage.
7. Individual Users optionally connect Google accounts.
8. Onboarding checklist verifies roles, sample Project, calendars, permissions, backup/operations, and support contacts.

## Invitation/reset behavior

- Admin never creates a permanent password for another user.
- Invitation response is generic and tokens are hashed, single-use, and expire after 72 hours.
- Forgot-password request is generic; token expires after one hour.
- Accept/reset revokes relevant prior sessions and records a safe audit event.
- Resend invalidates prior live invite token and applies abuse limits.

## Client data collection template

- Legal/display company name and IANA time zone.
- First and backup Owner identities.
- Approved Users, roles, and Project assignments.
- Resources and fixed categories.
- Project Types and starting Templates.
- Microsoft tenant/site/library/root owner.
- Google Cloud/OAuth ownership if client-owned.
- Support, privacy, security, backup, and release contacts.
- Expected scale and availability/recovery needs.

## Sign-off

Before real-user onboarding, verify public registration disabled, email domain configured, invite/reset tested, permissions tested, audit operational, demo account policy executed, privacy/security contacts assigned, and client accepts the onboarding checklist.

