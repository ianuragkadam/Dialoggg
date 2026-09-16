# Dialoggg Reboot — QA Gap Analysis and Bug Report

**Document ID:** DG-QA-003  
**Date:** 16 September 2026  
**Scope:** All ten requirements-led UI modules, shared application foundation, and release-readiness gaps  
**Requirements baseline:** `DG-RB-001` version 1.1 (263 requirements)  
**Result:** UI regression passed after fixes; the application remains a requirements-complete UI prototype rather than a production-complete Reboot v1 release.

## 1. Executive conclusion

The current UI is coherent enough for continued stakeholder review. All ten planned UI modules are present, the original `GanttChart.tsx` was not modified, the production build succeeds, and the complete automated suite passes **260 of 260** checks.

This audit found six reproducible UI defects. All six were fixed and protected by regression tests. No additional product-behavior question for Scott was discovered. The remaining gaps are implementation gaps: persistence, complete server authorization, real invitation/reset delivery, scheduling enforcement, Google/Microsoft integrations, production backup operations, and formal release evidence.

This result must not be interpreted as approval for production launch. Several Must requirements still have only review UI or partial foundations.

## 2. QA method and evidence

The audit used four complementary passes:

1. **Requirement-to-interface trace:** compared the 263-requirement baseline and current Product Status against available routes, role states, confirmations, and documented exclusions.
2. **Static/code review:** searched for sample/default naming leakage, dead controls, role/lifecycle inconsistencies, unimplemented preview actions, accessibility weaknesses, and accidental changes to the retained Gantt.
3. **Automated verification:** ran the production build, foundation tests, end-to-end scenarios, and all ten focused Playwright suites.
4. **Visible human click QA:** opened a temporary local review harness in Chrome and manually exercised modal focus, Escape dismissal, custom company/project naming, Project Calendar context, and the External/Client folder action. The temporary route and server were removed after verification.

### Automated result

| Suite | Passed | Failed |
|---|---:|---:|
| Foundation | 18 | 0 |
| Cross-application scenarios | 96 | 0 |
| Project Types | 12 | 0 |
| Project Templates | 12 | 0 |
| Company Administration | 14 | 0 |
| Users and Project Access | 20 | 0 |
| Resources | 17 | 0 |
| Projects | 15 | 0 |
| Project Plan / Gantt workflow | 13 | 0 |
| Calendars and Events | 15 | 0 |
| Google Calendar | 13 | 0 |
| Microsoft Storage | 15 | 0 |
| **Total** | **260** | **0** |

## 3. Defects found and fixed

| Finding ID | Severity | Requirements affected | Defect | Resolution and verification |
|---|---|---|---|---|
| DG-QA-BUG-001 | Medium | DG-UX-001, DG-UX-002, DG-ODR-005 | Every Project folder card displayed `Reading Residence Court` even when the current Project had another name. | Folder cards now receive and display the actual Project name. A non-sample Project regression test verifies Common and Private names and rejects the leaked sample name. |
| DG-QA-BUG-002 | Medium | DG-UX-001, DG-UX-002, DG-ODR-003 | Microsoft Storage displayed `Sport Court Operations / Projects` for every tenant, including the root selector and setup review. | The company display and selectable roots now use the signed-in company name. Project-level setup uses neutral `configured company root` wording because that component does not own the root record. Tests reject the old sample-company string. |
| DG-QA-BUG-003 | High | DG-PRJ-004, DG-PRJ-011, DG-ODR-006 | Owner/Admin could still see Change/Relink folder controls on Completed or Archived Projects although those Projects are read-only. | Folder visibility and folder editing are now separate permissions. Owner/Admin may still open preserved Common/Private links, but editing controls require an Active Project. A Completed Project regression test verifies both preserved links and zero Change/Relink actions. |
| DG-QA-BUG-004 | Medium | DG-ODR-011 | The External/Client `Open Common` button had no click handler and gave no result. | The button now produces the same explicit protected-new-tab preview status as the internal folder view. Automated and visible click tests verify the response and confirm the current page does not navigate. |
| DG-QA-BUG-005 | High | DG-PRJ-001, DG-CAL-003, DG-CAL-005, DG-CAL-008 | Project Calendar Task details, resource-conflict text, and the fixed Project selector could show `Reading Residence Court` or a blank selection instead of the current Project. | Task details and conflict copy now use the current Project. The disabled Project selector now includes the actual Project as its selected option. A non-sample Project test verifies the details and form value. |
| DG-QA-BUG-006 | Medium | DG-UX-009 | Microsoft and Project-folder confirmation dialogs could open while keyboard focus remained behind the modal. | The safe Cancel action receives initial focus. Automated focus assertions and visible keyboard/Escape testing pass. |

## 4. Remaining production gaps

### 4.1 Release-blocking identity, company, and authorization work

- **Company and membership model:** DG-TEN-002 through DG-TEN-014 still require the production Platform Administrator identity, company-only creation, first-Owner provisioning, multi-company memberships, company switcher, membership-level roles, suspension enforcement, and last-Owner protection.
- **Invitations and recovery:** DG-AUT-003 through DG-AUT-006 need single-use 72-hour invitation tokens, one-hour password-reset tokens, email delivery, sender/service ownership, retry behavior, and audit evidence.
- **Role enforcement:** current role-aware screens are not a substitute for a complete server-side action matrix. DG-ROL, DG-USR, DG-SEC-001 through DG-SEC-003, and DG-OPS-013 require adversarial API/feed/background-job coverage, especially External/Client serialization and cross-company identifier substitution.
- **Public registration decision already resolved:** company creation belongs to Platform Administration. The current public registration foundation must be retired or restricted before release; this does not need another Scott question.

### 4.2 Core business persistence

- **Project Types:** persist tenant-specific Types, require exactly one per Project, wire Types to Project forms and multi-select Project/Master Calendar filters, enforce safe reassignment before deletion, and audit changes (DG-TYP-001 through DG-TYP-006).
- **Users and Project access:** persist invitations, fixed company roles, External/Client minimum Project access, exact assignment changes, deactivation/session revocation, optional one-to-one Resource link, and Owner-only Owner management.
- **Resources:** persist the five fixed Categories, Resource lifecycle, one-to-one User constraint, Task/Event assignment rules, and conflict acknowledgement.
- **Projects:** persist the complete approved field set, assignments, lifecycle changes, working-day Start Date rebase, derived End Date, External/Client privacy rules, and permanent-deletion cleanup/audit behavior.
- **Templates:** implement Template tables/APIs, save from the live Project Plan, preserve offsets/dependencies/weekend rules/colors/default Categories, instantiate ordinary Tasks, reset progress, and handle missing Resources safely (DG-TPL-001 through DG-TPL-013).

### 4.3 Scheduling engine and calendar correctness

- Preserve the existing original Gantt UI, but extend its backend/model to enforce independent Saturday/Sunday rules, working-day duration, all four dependency types, multiple predecessors, dependent-Task lag calendars, latest-constraint wins, drag-to-lag conversion, cascade atomicity, cycle rejection, Header date/progress derivation, root-derived Project End Date, and deletion safeguards (DG-GNT and DG-OPS-012).
- Persist Events and recurrence rather than only reviewing them in UI. Required work includes all-day/timed storage, company time zone, DST-safe recurrence, date/count/open-ended series, occurrence/series edits and deletes, Resource assignments, conflict detection, drag confirmation, Project/Master rollup, Completed history, and stale-duplicate prevention (DG-CAL, DG-EVT, DG-OPS-014).
- Confirm the final Task-selection deep link into the retained Gantt when the underlying Gantt API supports selecting a specific Task.

### 4.4 External integrations

- **Google Calendar:** implement platform OAuth registration, per-User connect/disconnect, protected refresh tokens, dedicated `Dialoggg` calendar creation, safe payload mapping, Internal and External/Client delivery rules, idempotent create/update/delete, recurrence exceptions, reassignment, retry/reconciliation for 24 hours, revocation handling, health monitoring, and controlled end-to-end tests (DG-GGL-001 through DG-GGL-020 and DG-OPS-015).
- **Microsoft Storage:** implement company OAuth/Microsoft Graph, protected company-scoped site/drive/library/root and item identifiers, retry-safe create/link flows, correct new-tab URLs, server-side Common/Private serialization, missing/moved/renamed/permission failure recovery, and integration tests proving Private identifiers never reach Employee/External responses (DG-ODR-002 through DG-ODR-014 and DG-OPS-016).

### 4.5 Security, accessibility, browser, and operations

- Add documented CSRF/origin protection and complete schema validation for every state-changing route (DG-SEC-005, DG-SEC-006).
- Prove production cookie flags, expiry/rotation, log/token redaction, secret handling, and External/Client query-level privacy. Run a dependency vulnerability review and resolve or formally accept high/critical findings.
- Complete formal WCAG 2.2 AA testing beyond the current labels, focus, keyboard, reflow, dialog, validation, and non-color checks. Include zoom, contrast, screen reader, focus containment/return, and error-summary navigation.
- Run the required release browser/device matrix: maintained Chrome, Edge, Safari, mobile Safari, and mobile Chrome. The automated suite currently uses Chrome/Chromium only.
- Implement phone Gantt compact-list/touch-timeline behavior (DG-UX-005).
- Configure daily integrity-checked production backup outside the live Railway volume with 30-day retention, exercise quarterly restore evidence against the four-hour target, and document rollback ownership (DG-OPS-009, DG-OPS-010).
- Confirm Scott/designated owner has remote repository access, enable branch protection/backup remote, introduce repeatable versioned database migrations, and complete integration credential handover/runbooks (DG-OPS-002 through DG-OPS-008 and DG-OPS-019).

## 5. Questions and decisions

No new functional follow-up question is recommended for Scott from this QA pass. The 55 original and 19 follow-up answers are sufficient to continue development.

The following are team/client onboarding inputs, not missing product requirements:

- who owns the production email, Google, and Microsoft app registrations;
- which remote Git organization/repository Scott should access;
- production domain/DNS and sender domain;
- Railway production database/volume, backup destination, alert recipient, and secret ownership;
- the supported-device list used to record the final browser matrix.

## 6. Exit recommendation

The UI may continue to be shown as a detailed prototype. Do not describe the Reboot as production-complete until every Must requirement has one of: a passed production-like test, an accepted manual verification, or an explicit approved exception in the Requirements Traceability Matrix. The next engineering sequence should be identity/tenant authorization, business persistence, scheduling/calendar backend, then Google and Microsoft integrations, followed by security/accessibility/browser and operational release evidence.
