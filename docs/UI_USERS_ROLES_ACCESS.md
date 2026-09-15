# Users, Roles, Invitations, and Project Access UI Module

Last verified: September 15, 2026

## Delivery boundary

This is a detailed UI-only review module for company User administration. It demonstrates the approved fixed Roles, invitation setup, User details, lifecycle confirmations, and Project-assignment rules. Preview actions do not create or modify identities, memberships, Resources, Project access, sessions, invitation tokens, emails, notifications, calendars, or Microsoft links. State resets on refresh.

Scott completed all 19 follow-up questions before this module was finalized. The UI therefore applies approved decisions, including one Role per company membership, optional Resource creation, one-to-one User/Resource linkage, preservation on deactivation, and 72-hour invitations.

## Requirement traceability

| Requirement | UI coverage |
| --- | --- |
| `DG-AUT-003`, `DG-AUT-004`, `FUP-015` | Invite User explains that the recipient sets their own password through a single-use 72-hour link. Resend replaces the previous link; cancel invalidates it. The Admin never enters or sees the password. |
| `DG-AUT-008`, `DG-AUT-009` | Deactivation confirms immediate access loss and session revocation. Final server enforcement is deferred. |
| `DG-ROL-001`, `FUP-002` | Every company membership displays exactly one of Owner, Admin, Employee (Internal), or External/Client. No custom-permission builder is offered. |
| `DG-ROL-003`–`DG-ROL-005`, `DG-ROL-009`, `DG-ROL-010` | Admin may manage Employee and External/Client memberships but cannot promote, edit, deactivate, or change Project access for an Owner/Admin. Owner-only choices are visibly locked. Final-active-Owner enforcement remains a backend Owner workflow. |
| `DG-ROL-006`, `DG-USR-005` | Employee (Internal) copy states that schedule visibility spans the company while Project assignment controls team membership, Common-link eligibility, and relevant notifications. |
| `DG-ROL-007`, `DG-ROL-008`, `DG-USR-004` | External/Client is explicitly limited to selected Projects and cannot be reviewed with zero Project assignments. The client-facing scope is explained without exposing Private access. |
| `DG-ROL-011` | All four routes perform a server-side Admin check. Employee direct navigation returns a restricted state without preview directory data; signed-out access returns to Login. Final API permission enforcement remains pending. |
| `DG-USR-001`–`DG-USR-003` | Invite User collects separate First Name, Last Name, globally unique Login Email, and one company Role. Duplicate preview emails are rejected case-insensitively. Cross-company identity attachment is described but not connected. |
| `DG-USR-006` | Project-access UI supports exact additions/removals and explains atomic authorization, link, notification, and audit behavior. |
| `DG-USR-007`, `FUP-010` | “Also add as a Resource” is optional and describes one Resource linked to one User in the current company. |
| `DG-USR-008` | Permitted User details and Employee/External Role changes have validation and review dialogs. Owner/Admin editing is locked for an Admin. |
| `DG-USR-009`, `DG-USR-010`, `FUP-011` | Deactivation preserves historical Project, Task, Event, and Resource associations, excludes the User from new activity, and keeps the linked Resource separate. Restore is available. |
| `DG-USR-011`, `DG-UX-001` | Approved capitalization and names are used across headings, fields, options, errors, buttons, statuses, and confirmations. |
| `DG-UX-004`, `DG-UX-007`, `DG-UX-009`, `FUP-019` | Directory cards reflow at phone width with no horizontal page overflow. Controls are labelled, keyboard operable, focus-visible, and use dialog/alertdialog semantics and non-color status text. |

## Routes and access

| Route | Purpose | Signed out | Employee | Owner/Admin |
| --- | --- | --- | --- | --- |
| `/users` | Search/filter company Users and review lifecycle actions | Redirect to Login | Restricted state, no directory data | Full UI preview |
| `/users/new` | Configure and review a User invitation | Redirect to Login | Restricted state | Full UI preview |
| `/users/[id]` | Review profile, membership, Role, invitation, lifecycle, and assignments | Redirect to Login | Restricted state | Full UI preview; unknown IDs are 404 |
| `/users/[id]/projects` | Review exact Project-assignment additions/removals | Redirect to Login | Restricted state | Employee/External editable preview; Owner/Admin read-only for an Admin; unknown IDs are 404 |

## User directory states

- Summary cards show Company Users, Active, Invitations pending, and External/Clients.
- Search matches First Name, Last Name, or Login Email without case sensitivity.
- Role filter contains only the four approved fixed Roles.
- Status filter contains Active, Invitation pending, and Deactivated.
- No matching Users explains the filter outcome and offers **Clear filters**.
- Every row exposes **View** plus only the lifecycle action permitted for the displayed Role and current session.
- Owner lifecycle is disabled with **Owner required**; the current Admin has no self-deactivation control.
- Deactivate and Restore confirmations repeat session, history, assignment, and linked-Resource effects.

## Invite User states

1. **Empty form** — First Name, Last Name, and valid Login Email errors appear together.
2. **Duplicate Login Email** — existing preview membership emails are rejected case-insensitively.
3. **Fixed Role choices** — Employee (Internal) and External/Client are available to Admin; Admin and Owner are disabled with **Owner required**.
4. **External/Client without a Project** — review is blocked until at least one Project is selected.
5. **Optional Resource** — the Admin may request a matching one-to-one linked Resource.
6. **Review** — exact User, Login Email, Role, Project assignments, and Resource choice are repeated before confirmation.
7. **Back to edit / Escape** — review closes without losing values.
8. **Leave invitation setup?** — protects a changed form and explains that no invitation was sent.
9. **Invitation preview complete** — explicitly confirms that nothing was created and no email was sent.

## User detail and lifecycle states

- Profile shows separate First Name, Last Name, Login Email, and Last active.
- Membership shows fixed Role, status, linked Resource, and assignment count.
- Employee/Internal and External/Client Role changes receive an impact review before the UI preview changes.
- Owner/Admin records show an Owner-approval notice and lock profile, Role, lifecycle, and Project-access controls for an Admin.
- Invitation pending exposes Resend 72-hour invitation and Cancel invitation confirmations.
- Deactivate, Restore, and Cancel invitation use alert-dialog semantics and default focus to the safe cancel action.
- All mutation feedback explicitly states that it is a UI preview.

## Project access states

- External/Client explains its restricted Project, simple view, Project Calendar, Common-link, and optional simple-Gantt boundary.
- Employee (Internal) explains that assignment affects team/Common/notifications rather than company schedule visibility.
- Owner/Admin direct access is read-only for an Admin and uses the correct Owner/Admin context, with every checkbox and save action disabled.
- Removing an External/Client's final Project is blocked with a plain-language error.
- Review lists exact **Add access** and **Remove access** names.
- Back to edit and Escape preserve selections.
- Cancel with unsaved changes opens **Leave Project access?** before discarding.
- Success explicitly states that no access, link, notification, calendar, or session state changed.

## QA evidence

- Production build and TypeScript validation passed with 52 generated application routes, including all four User-management routes.
- Foundation suite passed 12 of 12 checks.
- Isolated application suite passed 89 of 89 scenarios, including signed-out redirects, Admin access, Employee isolation, and unknown-User handling.
- Focused Users/Roles/Access Playwright suite passed 20 of 20 scenarios.
- Human-click QA covered Login, authenticated navigation, search/no-results recovery, lifecycle impact/cancel, required invitation fields, External Project validation, linked Resource selection, exact review, Escape preservation, non-persistent success, final-assignment protection, exact access changes, and Owner/Admin locks.
- Human testing found an incorrect **Employee (Internal) behavior** explanation on the read-only Owner route. It was replaced by **Owner/Admin assignment context**, a regression assertion was added, and the complete focused suite plus a second human browser pass succeeded.
- The existing original `GanttChart` was not edited or replaced.

## Data wiring intentionally deferred

The backend phase must separate global identity from company membership, persist fixed Roles and Project assignments, implement invitation/reset tokens and delivery, verify email changes, create optional linked Resources atomically, audit material changes, revoke sessions, enforce lifecycle and final-Owner rules, and apply the full Owner/Admin/Employee/External authorization matrix to every page, API, feed, calendar, Project, and Microsoft link. The current UI does not claim those production behaviors are complete.
