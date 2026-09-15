# Company Administration UI Module

Last verified: September 15, 2026

## Delivery boundary

This is a detailed UI-only module for Platform Administrator review. It demonstrates company discovery, provisioning review, company operational metadata, and reversible suspension. Preview actions do not create a company, send an invitation, change access, pause synchronization, or alter production records. All preview state resets on refresh.

Scott completed all 19 follow-up questions before this module was finalized. The module therefore uses approved decisions rather than provisional assumptions.

## Requirement traceability

| Requirement | UI coverage |
| --- | --- |
| `DG-TEN-001`, `DG-TEN-006`, `DG-TEN-010` | Company records are presented as distinct tenant boundaries. Tenant Admins receive a restricted state and no platform company data. Final server persistence and authorization remain deferred. |
| `DG-TEN-002`, `DG-ROL-002` | Platform Administrator is treated as a separate platform role. Its navigation contains Companies, Account, and Help, and omits tenant Projects, Users, Resources, calendars, Project Types, and Project Templates. |
| `DG-TEN-003`, `DG-TEN-004` | The private Platform Administrator area contains the only Add Company journey. Company Admins cannot open any platform administration route. |
| `DG-TEN-005` | Add Company collects Company Name, required IANA Company Time Zone, and first Owner first name, last name, and login email. Empty and invalid values are blocked before review. |
| `DG-TEN-012`, `FUP-001` | Scott approved company-management-only platform access. The detail screen exposes operational metadata and integration health only, never tenant Projects, Tasks, Events, User activity, Resources, clients, or file contents. |
| `DG-TEN-013`, `DG-TEN-014`, `FUP-012` | Scott approved suspension that locks company Users out, pauses Google synchronization, preserves all Dialoggg data, leaves Microsoft folders untouched, and can be restored. Both list and detail confirmations repeat the impact. |
| `DG-AUT-003`, `DG-AUT-004`, `FUP-015` | The provisioning UI explains that the first Owner receives a single-use 72-hour invitation and that the Platform Administrator never chooses or sees the Owner's password. |
| `DG-AUT-007` | No self-registration path is presented from Company Administration. Retiring the existing public Register page/API remains a backend authentication task. |
| `DG-OPS-003` | The final confirmation states that connected provisioning must record an audit event. Audit persistence is deferred with the backend. |
| `DG-UX-001`, `DG-UX-009`, `FUP-019` | The routes use approved product language, associated labels, keyboard-operable controls, modal semantics, visible focus, non-color status text, and responsive reflow aligned with Scott's WCAG 2.2 AA target. |

## Routes and access

| Route | Purpose | Signed out | Company Admin/Employee | Platform Administrator |
| --- | --- | --- | --- | --- |
| `/platform/companies` | Search, filter, review, suspend, and restore companies | Redirect to Login | Restricted state with no company data | Full UI preview |
| `/platform/companies/new` | Review a new company and first Owner setup | Redirect to Login | Restricted state | Full UI preview |
| `/platform/companies/[id]` | Inspect one company's operational metadata and lifecycle state | Redirect to Login | Restricted state | Full UI preview; unknown IDs are 404 |

Signed-in Platform Administrators entering `/` or `/login` are routed to `/platform/companies`. Company Users continue to enter through Projects.

## Companies list states

- Summary cards show total Companies, Active, Suspended, and Active Projects.
- Search matches Company Name, first Owner name, and first Owner email without case sensitivity.
- Status filter offers All statuses, Active, and Suspended.
- A no-results state explains the filter outcome and provides **Clear filters**.
- Each company row shows status, created date, time zone, first Owner, and aggregate User/Resource/Project counts.
- **View** opens the metadata-only detail route.
- **Suspend** and **Restore** open exact impact confirmations.
- Preview lifecycle changes update the affected row, summary totals, action label, and accessible status message without persistence.

## Add Company states

1. **Empty form** — required Company, time zone, first Owner name, and valid email errors appear together; focus moves to Company Name.
2. **Duplicate Company Name** — names are trimmed and compared case-insensitively against the preview list.
3. **Review** — a modal repeats exact Company Name, Company Time Zone, first Owner name, and invitation email before the preview can continue.
4. **Back to edit** — closes review without losing entered values.
5. **Escape** — closes the review modal without losing entered values.
6. **Leave company setup?** — protects a changed form; Keep editing preserves it, while Discard and leave returns to Companies.
7. **Company setup preview complete** — clearly states that no company or User was created and no email was sent.

## Company detail and privacy

The detail screen contains only operational metadata: Company Name, Time Zone, first Owner, internal company identifier, aggregate counts, and connection-health labels. It intentionally does not provide a support-mode entrance into tenant content. This implements Scott's `FUP-001` choice and avoids implying that platform access grants company membership.

## Lifecycle confirmations

The suspend confirmation states that:

- company Users are locked out;
- all Dialoggg records remain stored;
- Google synchronization pauses;
- OneDrive/SharePoint folders are not renamed or deleted; and
- a Platform Administrator can restore access later.

Restore states that company access returns and integration health should be reviewed before paused synchronization resumes. Cancel is initially focused, Escape and backdrop click close safely, body scrolling is locked while open, and focus returns to the initiating control.

## QA evidence

- Production build and TypeScript validation passed with 32 generated application routes.
- Foundation suite passed 11 of 11 checks.
- Isolated application suite passed 85 of 85 scenarios, including Platform Administrator routing, tenant denial, signed-out redirects, all three routes, and unknown-company handling.
- Focused Company Administration Playwright suite passed 14 of 14 scenarios.
- Human-click QA covered Login, platform-only navigation, search/no-results recovery, suspension impact/cancel, metadata-only detail, empty-form validation, exact setup review, and non-persistent success.
- The first browser run found a 37-pixel mobile overflow at a 390-pixel viewport. The shared authenticated header was corrected and the entire 14-scenario suite then passed.
- The existing original `GanttChart` was not edited or replaced.

## Data wiring intentionally deferred

The next backend phase must add persistent companies and memberships, retire public company registration, create invitation/audit records, enforce suspension on every session/request, pause and resume sync safely, and enforce Platform Administrator authorization server-side. None of those production mutations are represented as complete by this UI-only module.
