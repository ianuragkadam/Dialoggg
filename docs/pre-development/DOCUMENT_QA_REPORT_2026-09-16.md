# Dialoggg Pre-Development Documents — Deep QA and R&D Report

**Date:** September 16, 2026  
**Reviewed set:** DOC-01 through DOC-18 plus documentation index  
**Review type:** Requirements, architecture, security, operations, vendor-research, and document-quality audit  
**Result:** Documents corrected and suitable for formal stakeholder/technical review; implementation evidence and named approvals remain pending

## 1. Executive result

The documentation set is materially complete as a pre-development draft and is consistent with the approved product direction after the corrections in this review. No live credential or demo password was found. No evidence supports describing the backend as complete or the documents as client-approved.

The review found no new product workshop is required. It did find launch-critical engineering work and ownership decisions that must be completed before production backend release:

1. Replace the current global User/Role model with global identity plus per-company membership.
2. Centralize Owner/Admin/Employee/External authorization and enforce it in every server path.
3. Adopt the target database decision; PostgreSQL is recommended before the new membership schema.
4. Replace schema-on-import changes with versioned explicit migrations and complete relational constraints.
5. Implement secure invitation/reset/session/rate-limit/CSRF behavior.
6. Build and verify outbox/background-job behavior for email, Google, and Microsoft operations.
7. Populate the 263-row RTM with implementation, test, UAT, and release evidence during development.

## 2. Evidence reviewed

- Full requirements baseline with 263 `DG-*` product requirements.
- Follow-up review containing 19 approved decisions and three safe implementation clarifications.
- Ten UI module specifications and September 16 UI/code QA report.
- Current package versions, database schema/initialization, session/auth guard, API Route Handlers, deployment, backup, security, testing, and maintenance documents.
- Historical planning documents for comparison only.
- Current live deployment/role-test evidence recorded in the project progress file.
- Official documentation for Next.js authentication, SQLite WAL/foreign keys/backup, Railway healthchecks/PostgreSQL/backups, Google OAuth/Calendar/recurrence/quotas, Microsoft identity/Graph/files, OWASP ASVS 5.0.0, and WCAG 2.2.

## 3. Automated/document checks

| Check | Result |
| --- | --- |
| Expected DOC-01–DOC-18 present | Pass |
| Index present and links resolve | Pass |
| One H1 and status metadata on controlled docs | Pass |
| Markdown code fences balanced | Pass |
| Demo passwords absent | Pass |
| No live token/secret intentionally embedded | Pass by text review; dedicated secret scanner remains CI work |
| Requirement families inventoried | Pass: 263 requirements across 19 families |
| Follow-up decisions inventoried | Pass: 19/19 explicitly traced after correction |
| Implementation clarifications inventoried | Pass: 3/3 explicitly traced after correction |
| Foundation/policy test suite | Pass: 19/19 |

## 4. Requirement coverage audit

The requirement count is:

| Family | Count |
| --- | ---: |
| Scope 6; Tenancy 14; Authentication 10; Roles 12; Users 11 | 53 |
| Resources 11; Projects 18; Project Types 6 | 35 |
| Gantt 34; Templates 13; Calendars 13; Events 14 | 74 |
| Google 20; Microsoft 14 | 34 |
| UX 9; Security 9; NFR 12; Operations 19; Exclusions 18 | 67 |
| **Total** | **263** |

DOC-03 maps every family/range to its controlling designs and defines the row-level evidence fields. The actual 263 implementation rows are not marked complete because the backend, tests, UAT, and releases do not yet exist. This is correct at pre-development stage, but the row-level ledger is a mandatory development/release control.

## 5. Findings and dispositions

### QA-01 — Current identity schema conflicts with approved multi-company membership

**Severity:** Launch critical  
**Evidence:** Current `user` stores one `company_id` and global `user_type`; `FUP-002` requires one identity with a separate role in each company.  
**Disposition:** DOC-04, DOC-05, DOC-06, and DOC-17 require identity plus `company_membership` migration before further role expansion. Implementation pending.

### QA-02 — Owner authorization is not consistently implemented

**Severity:** Launch critical  
**Evidence:** Current `isAdmin()` returns true only for `admin`; shared write guard therefore rejects Owner even though Owner must include every Admin permission.  
**Disposition:** DOC-04 requires resource/action policies and exhaustive matrix tests. Do not patch by changing one boolean alone; implement active membership/company/object policy centrally.

### QA-03 — Platform, External, and assignment boundaries are incomplete in APIs

**Severity:** Launch critical  
**Evidence:** Current routes primarily use `requireAdmin()` or company filters; the target platform boundary and per-Project External DTO/query policy are not a central enforcement layer.  
**Disposition:** DOC-04, DOC-07, DOC-11, and DOC-13 define default-deny, role DTOs, 404 anti-enumeration behavior, and adversarial tests. Implementation pending.

### QA-04 — Public registration remains in the current API

**Severity:** High  
**Evidence:** `/api/auth/register` exists while `DG-AUT-007` requires public company self-registration disabled.  
**Disposition:** Retire/disable the route when the invitation/company-provisioning backend begins; add negative release test.

### QA-05 — Current schema lacks required target entities and constraints

**Severity:** Launch critical  
**Evidence:** No membership, invitation/reset, Project Type, Template, recurrence/exception, audit, OAuth/mapping, or outbox model. Several join/session relations lack explicit foreign keys in the current schema.  
**Disposition:** DOC-05 specifies target entities, constraints, indexes, and expand/contract migration. Field-level DDL and migration scripts remain implementation work.

### QA-06 — Schema initialization is not a production migration system

**Severity:** High  
**Evidence:** Tables/columns are currently created/altered during application import, and parallel builds previously caused `SQLITE_BUSY`.  
**Disposition:** DOC-05/DOC-14 require versioned, explicit, single-run migrations outside parallel module initialization.

### QA-07 — Database architecture decision required

**Severity:** High  
**R&D result:** Installed SQLite reports `3.53.1`, so the specific WAL-reset bug fixed in `3.51.3` is not present. SQLite still has one writer and the Railway volume constrains replicas/deployments. Approved scope adds multi-company writes and multiple background integrations.  
**Disposition:** Recommend Railway PostgreSQL before the new membership model. SQLite requires benchmark proof and explicit exception acceptance.

### QA-08 — Permission draft exposed Project Types/Templates too broadly

**Severity:** High documentation defect  
**Evidence:** Original DOC-04 implied Employee reference access; `DG-TYP-004`, `DG-TPL-001`, and `DG-TPL-009` limit management/library to Owner/Admin and existing UI uses restricted states.  
**Disposition:** Corrected to no Employee/External settings/library access. Project records may display the selected Type/result without granting management access.

### QA-09 — Invitation/reset token transport risk

**Severity:** High  
**Evidence:** Initial API table placed invitation token in the URL path, conflicting with the requirement that tokens not appear in logs/private bearer URLs.  
**Disposition:** DOC-07 now uses fragment-delivered token, HTTPS body submission, `no-referrer`, no third-party resources, history replacement, hashing, expiry, single use, and redaction.

### QA-10 — Session and authentication hardening incomplete

**Severity:** High  
**Evidence:** Current sessions store the bearer value directly, have 30-day lifetime, and lack rate limiting, invite/reset, and full privilege-change revocation.  
**Disposition:** DOC-05/DOC-11 require hashed bearer storage, rotation/revocation, generic responses, rate limits, and secure invite/reset flows.

### QA-11 — CSRF strategy was missing from the initial API document

**Severity:** High documentation defect  
**Disposition:** DOC-07 now requires approved-Origin validation and CSRF tokens for cookie-authenticated writes, with SameSite as defense in depth.

### QA-12 — Gantt lag/zero-lag semantics were under-specified

**Severity:** Core-product high  
**Evidence:** FS was approved; SS/FF/SF and positive lag anchors lacked sufficiently exact formulas.  
**Disposition:** DOC-08 now defines zero-lag anchors, additional lag-day counting on the successor calendar, forward normalization, backward duration derivation, and worked examples. Golden-test validation remains mandatory.

### QA-13 — Completed Tasks during Project rebase needed explicit control

**Severity:** High  
**Disposition:** `IC-001` is now explicit in DOC-01, DOC-08, and DOC-13: completed Tasks never move; date-only or explicit unfinished-only shift is offered.

### QA-14 — Google design required concrete API decisions

**Severity:** High  
**R&D result:** `calendar.app.created` is the recommended first scope; background delivery requires offline access; client-supplied event IDs support duplicate prevention; native recurrence supports entire-series and occurrence exceptions.  
**Disposition:** DOC-09 updated. Proof of concept must confirm scope sufficiency and DST/all-day recurrence.

### QA-15 — Google restoration behavior needed explicit control

**Severity:** Medium  
**Disposition:** `IC-002` is traced: restoring company access does not automatically resume Google; Owner/Admin reviews health and explicitly resumes/reconciles.

### QA-16 — Microsoft design required concrete OAuth and scope direction

**Severity:** High  
**R&D result:** Use delegated Authorization Code with PKCE and `offline_access`; start with least-privilege `Files.ReadWrite` for OneDrive. Broader SharePoint scopes require proof from the tenant/root-selection spike.  
**Disposition:** DOC-10 updated; Entra app/test tenant and admin ownership remain prerequisites.

### QA-17 — Transactional email provider was unresolved

**Severity:** Medium  
**R&D result:** Recommend Resend provisionally because it supports 24-hour idempotency keys and signed webhooks. Postmark remains viable but its webhook protection guidance relies on HTTPS with Basic authentication/IP allowlisting.  
**Disposition:** ADR-010 updated. Final choice depends on client ownership, domain DNS, data terms, volume/pricing, region, and support.

### QA-18 — NFR scale did not match the approved decision

**Severity:** High documentation defect  
**Evidence:** Initial draft used larger illustrative numbers without separating acceptance from stress testing.  
**Disposition:** DOC-12 now uses approved `FUP-017` values and `IC-003` ten simultaneous Users; 2× is labeled engineering stress only.

### QA-19 — Security standard required current versioning

**Severity:** Medium  
**R&D result:** OWASP ASVS 5.0.0 is the current stable verification reference.  
**Disposition:** DOC-11 targets applicable Level 2 controls and requires exact versioned control IDs during security review.

### QA-20 — Operational backup design depends on database choice

**Severity:** High  
**Disposition:** Existing SQLite online backup remains valid for the current prototype. If PostgreSQL is approved, DOC-15/DOC-14 must be instantiated with Railway volume backups/PITR plus portable offsite logical dumps and a timed restore drill.

## 6. R&D recommendations

| Decision | Recommendation | Confidence | Remaining validation |
| --- | --- | ---: | --- |
| Target database | Railway PostgreSQL before new membership schema | High | Migration spike, cost/ownership, benchmark |
| Application shape | Keep modular Next.js monolith for v1 | High | Load test and job-runner topology |
| Authorization | Central action/resource policy with role DTOs | High | Implement and adversarially test 263 requirements as applicable |
| Sessions | Opaque bearer cookie; hashed DB value; rotation/revocation | High | Security tests and exact expiry policy |
| Email | Resend provisional | Medium-high | Domain, DPA/region, pricing/volume, account owner |
| Google | Personal OAuth, `calendar.app.created` first, offline access, deterministic event IDs, native recurrence | Medium-high | Real test project and scope/recurrence spike |
| Microsoft | Delegated auth-code + PKCE/offline access; narrowest scope first | Medium | Client tenant/library spike and admin consent |
| Jobs | Transactional outbox with idempotent worker | High | Hosting/scheduler choice and failure test |
| Security | OWASP ASVS 5.0.0 applicable Level 2 | High | Select exact controls and perform verification |
| Accessibility | WCAG 2.2 AA primary workflows | Approved/high | Safari/mobile/manual assistive-tech evidence |

## 7. Remaining approvals and external inputs

These are not additional product-behavior questionnaire questions:

- Approve PostgreSQL target or explicitly accept/test SQLite constraints.
- Approve email provider/account ownership and sending domain.
- Provide/approve Google Cloud project ownership, consent identity, redirect domains, and test accounts.
- Provide/approve Microsoft Entra application, test tenant/library, consent administrator, and scope outcome.
- Approve final SLO/support hours and security/privacy ownership.
- Approve repository organization/remote and branch-protection ownership.

## 8. Final QA conclusion

After correction, the documents form a coherent pre-development control set and contain substantive R&D rather than generic templates. They are ready for product/technical review. They are not yet “Approved,” because the named approvals, external tenant/vendor proofs, migration/benchmark spikes, implementation, row-level evidence, security verification, and UAT have not occurred.

