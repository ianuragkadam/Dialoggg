# Company Administration UI Module

Last verified: September 17, 2026

## Delivery boundary

This module is connected to persistent, Platform Administrator-only APIs. It provides company discovery, transactional provisioning, tenant-safe operational metadata, global-identity context switching, and reversible lifecycle enforcement. Creating or changing a company is a live operation and no longer resets on refresh.

Scott completed all 19 follow-up questions before this module was finalized. The module therefore uses approved decisions rather than provisional assumptions.

## Requirement traceability

| Requirement | UI coverage |
| --- | --- |
| `DG-TEN-001`, `DG-TEN-006`, `DG-TEN-010` | Company records persist as distinct tenant boundaries. Tenant Admins receive a restricted state and platform APIs return 403 without company metadata. Queries expose only company-scoped operational counts. |
| `DG-TEN-002`, `DG-ROL-002` | Platform Administrator is treated as a separate platform role. Its navigation contains Companies, Account, and Help, and omits tenant Projects, Users, Resources, calendars, Project Types, and Project Templates. |
| `DG-TEN-003`, `DG-TEN-004` | The private Platform Administrator area contains the only Add Company journey. Company Admins cannot open any platform administration route. |
| `DG-TEN-005` | Add Company collects Company Name, required IANA Company Time Zone, and first Owner first name, last name, and login email. Empty and invalid values are blocked before review. |
| `DG-TEN-012`, `FUP-001` | Scott approved company-management-only platform access. The detail screen exposes operational metadata and integration health only, never tenant Projects, Tasks, Events, User activity, Resources, clients, or file contents. |
| `DG-TEN-013`, `DG-TEN-014`, `FUP-012` | Suspension immediately revokes company-context sessions and pauses per-company Google synchronization while preserving Dialoggg and Microsoft mapping records. Restore re-enables access but keeps Google paused for review. |
| `DG-AUT-003`, `DG-AUT-004`, `FUP-015` | The provisioning UI explains that the first Owner receives a single-use 72-hour invitation and that the Platform Administrator never chooses or sees the Owner's password. |
| `DG-AUT-007` | No self-registration path is presented from Company Administration. Retiring the existing public Register page/API remains a backend authentication task. |
| `DG-OPS-003` | Create, suspend, and restore actions persist request-correlated audit events without secrets. |
| `DG-UX-001`, `DG-UX-009`, `FUP-019` | The routes use approved product language, associated labels, keyboard-operable controls, modal semantics, visible focus, non-color status text, and responsive reflow aligned with Scott's WCAG 2.2 AA target. |

## Routes and access

| Route | Purpose | Signed out | Company Admin/Employee | Platform Administrator |
| --- | --- | --- | --- | --- |
| `/platform/companies` | Search, filter, review, suspend, and restore companies | Redirect to Login | Restricted state with no company data | Live operations |
| `/platform/companies/new` | Create a company and pending first Owner invitation | Redirect to Login | Restricted state | Live transactional provisioning |
| `/platform/companies/[id]` | Inspect one company's operational metadata and lifecycle state | Redirect to Login | Restricted state | Live metadata/lifecycle; unknown IDs are 404 |

Signed-in Platform Administrators entering `/` or `/login` are routed to `/platform/companies`. Company Users continue to enter through Projects.

## Companies list states

- Summary cards show total Companies, Active, Suspended, and Active Projects.
- Search matches Company Name, first Owner name, and first Owner email without case sensitivity.
- Status filter offers All statuses, Active, and Suspended.
- A no-results state explains the filter outcome and provides **Clear filters**.
- Each company row shows status, created date, time zone, first Owner, and aggregate User/Resource/Project counts.
- **View** opens the metadata-only detail route.
- **Suspend** and **Restore** open exact impact confirmations.
- Lifecycle changes persist through protected APIs and update the affected row, summary totals, action label, and accessible status message.

## Add Company states

1. **Empty form** — required Company, time zone, first Owner name, and valid email errors appear together; focus moves to Company Name.
2. **Duplicate Company Name** — the server trims names and enforces case-insensitive database uniqueness.
3. **Review** — a modal repeats exact Company Name, Company Time Zone, first Owner name, and invitation email before creation.
4. **Back to edit** — closes review without losing entered values.
5. **Escape** — closes the review modal without losing entered values.
6. **Leave company setup?** — protects a changed form; Keep editing preserves it, while Discard and leave returns to Companies.
7. **Company created** — confirms the company boundary and that the encrypted 72-hour Owner invitation was queued, with links to detail and list views.

## Company detail and privacy

The detail screen contains only operational metadata: Company Name, Time Zone, first Owner, internal company identifier, aggregate counts, and connection-health labels. It intentionally does not provide a support-mode entrance into tenant content. This implements Scott's `FUP-001` choice and avoids implying that platform access grants company membership.

## Lifecycle confirmations

The suspend confirmation states that:

- company Users are locked out;
- all Dialoggg records remain stored;
- Google synchronization pauses;
- OneDrive/SharePoint folders are not renamed or deleted; and
- a Platform Administrator can restore access later.

Restore states that company access returns while Google remains paused until integration health is reviewed. Cancel is initially focused, Escape and backdrop click close safely, body scrolling is locked while open, and focus returns to the initiating control.

## QA evidence

- Production build, standalone packaging, and TypeScript validation passed with all five Company Administration API routes present.
- Foundation suite passed 22 of 22 checks.
- Production-like application suite passed 117 of 117 scenarios, including persistent create/invite, uniqueness, tenant denial, immediate suspension, record preservation, restoration, audit, and unknown-company handling.
- Focused Company Administration Playwright suite passed 15 of 15 scenarios, including real platform/company switching and live mutations.
- Full live Chromium regression passed 147 of 147 checks across ten suites.
- Mobile validation covers the 390-pixel company list with the context selector visible and no horizontal overflow.
- The existing original `GanttChart` was not edited or replaced.

## Remaining integration wiring

Live provider delivery remains gated on Resend credentials and a verified sender. Future Google workers must check `company_google_sync_state` before sending updates and require an explicit health-review resume action after restoration. The wider v1 module backends and final UAT remain separate checkpoints.
