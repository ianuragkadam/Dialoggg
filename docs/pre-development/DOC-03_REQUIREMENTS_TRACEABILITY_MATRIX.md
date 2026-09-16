# DOC-03 — Requirements Traceability Matrix

**Version:** 0.1  
**Status:** Active draft  
**Detailed requirement source:** `D:\Scott\Dialoggg_Requirements_Baseline_v1.md`

## Purpose

Maintain an auditable path from every approved `DG-*` requirement to design, implementation, automated evidence, UAT, and release.

The controlled baseline contains **263 functional/non-functional Requirement IDs across 19 requirement families**. The family totals below were verified directly from the baseline during the deep QA pass. `DG-RB-001` and `DG-DR-002` are document/register identifiers and are not counted as product requirements.

| Family | Exact range | Count |
| --- | --- | ---: |
| Application entry | `DG-SCP-001`–`DG-SCP-006` | 6 |
| Companies/tenancy | `DG-TEN-001`–`DG-TEN-014` | 14 |
| Authentication | `DG-AUT-001`–`DG-AUT-010` | 10 |
| Roles | `DG-ROL-001`–`DG-ROL-012` | 12 |
| Users/access | `DG-USR-001`–`DG-USR-011` | 11 |
| Resources | `DG-RES-001`–`DG-RES-011` | 11 |
| Projects | `DG-PRJ-001`–`DG-PRJ-018` | 18 |
| Project Types | `DG-TYP-001`–`DG-TYP-006` | 6 |
| Gantt | `DG-GNT-001`–`DG-GNT-034` | 34 |
| Templates | `DG-TPL-001`–`DG-TPL-013` | 13 |
| Calendars | `DG-CAL-001`–`DG-CAL-013` | 13 |
| Events | `DG-EVT-001`–`DG-EVT-014` | 14 |
| Google | `DG-GGL-001`–`DG-GGL-020` | 20 |
| Microsoft | `DG-ODR-001`–`DG-ODR-014` | 14 |
| UX/accessibility | `DG-UX-001`–`DG-UX-009` | 9 |
| Security/privacy | `DG-SEC-001`–`DG-SEC-009` | 9 |
| Non-functional | `DG-NFR-001`–`DG-NFR-012` | 12 |
| Operations/handover | `DG-OPS-001`–`DG-OPS-019` | 19 |
| Exclusions | `DG-OOS-001`–`DG-OOS-018` | 18 |
| **Total** |  | **263** |

## Required row-level columns

| Column | Rule |
| --- | --- |
| Requirement ID | Stable ID from the detailed baseline |
| Requirement summary | Short testable statement; never replace the source wording |
| Priority/state | Must/Should and Approved/Baseline/Team baseline/Excluded |
| Design document | DOC or UI specification section |
| Data entities | Tables/objects affected |
| API/route | Contract operation and UI route |
| Authorization | Named policy/matrix cell |
| Implementation | File/module/commit after development |
| Automated tests | Test IDs and latest result |
| UAT scenario | UAT ID and result |
| Delivery state | Approved, Designed, Implemented, Tested, UAT Accepted, Released |
| Evidence/release | Deployment, screenshot/report where useful, approver/date |

## Module-level control matrix

| Requirement family | Design authority | Primary UI evidence | Backend state | Mandatory test families |
| --- | --- | --- | --- | --- |
| `DG-SCP-*` | DOC-01, DOC-02, DOC-06 | Login, Projects, AppShell | Partial | entry routing, exclusions, cross-module flow |
| `DG-TEN-*` | DOC-04–07 | `UI_COMPANY_ADMINISTRATION.md` | Major gaps | company isolation, switcher, suspension, platform boundary |
| `DG-AUT-*` | DOC-04, DOC-07, DOC-11 | Login/Account UI | Partial | login, enumeration, rate limit, invite/reset, sessions |
| `DG-ROL-*` | DOC-04 | all role states | Major gaps | allow/deny matrix, direct URL/API, field filtering |
| `DG-USR-*` | DOC-04, DOC-05, DOC-07 | `UI_USERS_ROLES_ACCESS.md` | UI-focused | identity/membership, invitations, assignments, deactivation |
| `DG-RES-*` | DOC-05, DOC-07 | `UI_RESOURCES.md` | Partial | fixed categories, linkage, conflicts, lifecycle |
| `DG-PRJ-*` | DOC-04, DOC-05, DOC-07 | `UI_PROJECTS.md` | Partial | lifecycle, assignments, derived dates, safe deletion |
| `DG-TYP-*` | DOC-05, DOC-07 | `UI_PROJECT_TYPES.md` | UI-only | uniqueness, use protection, rename, tenant scope |
| `DG-GNT-*` | DOC-08 | `UI_PROJECT_PLAN_GANTT.md` | Foundation only | golden date cases, cycles, cascades, hierarchy, concurrency |
| `DG-TPL-*` | DOC-05, DOC-07, DOC-08 | `UI_PROJECT_TEMPLATES.md` | UI-only | relative dates, copies, optional exact Resources, atomicity |
| `DG-CAL-*` | DOC-05, DOC-07, DOC-12 | `UI_CALENDARS_EVENTS.md` | Partial | rollup, filters, role scope, time zones |
| `DG-EVT-*` | DOC-05, DOC-07 | `UI_CALENDARS_EVENTS.md` | Data foundation only | recurrence, occurrence exceptions, drag, conflicts |
| `DG-GGL-*` | DOC-09, DOC-11 | `UI_GOOGLE_CALENDAR.md` | UI-only | OAuth, mapping, idempotency, retry, privacy, disconnect |
| `DG-ODR-*` | DOC-10, DOC-11 | `UI_MICROSOFT_STORAGE.md` | UI-only | OAuth, identifiers, visibility, recovery, no-delete boundary |
| `DG-UX-*` | DOC-12, DOC-13 | ten UI specs | Strong prototype | WCAG, responsive, browser/device, terminology |
| `DG-SEC-*` | DOC-04, DOC-11 | restricted states | Partial | authn/authz, tenant attacks, CSRF, secrets, logging |
| `DG-NFR-*` | DOC-12 | QA report | Targets incomplete | load, performance, availability, capacity, recovery |
| `DG-OPS-*` | DOC-13–18 | runbooks | Partial | CI, deploy, backup, restore, incident, handover |
| `DG-OOS-*` | DOC-01, DOC-02 | navigation/routes | Retired/absent | route absence, schema absence, terminology scan |

## Initial evidence already available

- Both requirements workshops completed at 100%.
- Ten module-level UI specifications with Requirement-ID mappings.
- 261/261 automated checks passed in the September 16 QA run.
- Visible browser QA completed across all ten modules.
- Production deployment `861b045c-d8ca-4e96-b0d0-b09f8587be36` verified.
- Original `src/components/GanttChart.tsx` remained unchanged during UI work.

## Matrix maintenance workflow

1. Add or update rows during refinement, before coding.
2. Link design and permission decisions before implementation begins.
3. Add implementation commit and tests in the same pull request.
4. QA records result and defect links.
5. UAT records acceptance or exception.
6. Release manager records deployment evidence.
7. Any requirement change triggers impact review of all linked cells.

## Release gate

No Must requirement may be released with a blank authorization, implementation, automated-test, or acceptance cell. Exclusions require negative evidence showing the prohibited feature is absent or inaccessible.

This document currently supplies design-family coverage and the row schema. Implementation/test/UAT cells cannot truthfully be completed before the corresponding backend exists. The 263-row delivery ledger must be instantiated from the authoritative baseline at the start of implementation and maintained in pull requests; a family range is not accepted as release evidence for an individual Requirement ID.
