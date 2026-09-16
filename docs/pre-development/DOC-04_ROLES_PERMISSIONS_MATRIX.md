# DOC-04 — Roles, Permissions, and Data-Visibility Matrix

**Version:** 0.1  
**Status:** Approval required  
**Requirement families:** `DG-TEN-*`, `DG-AUT-*`, `DG-ROL-*`, `DG-USR-*`, `DG-SEC-*`

## Identity and scope model

- **Platform Administrator:** platform identity; creates/suspends/restores companies and initiates first-Owner setup. It has no tenant business-data access without a separate company membership.
- **Owner:** company membership role; includes every Admin capability plus Owner/Admin role management and Owner-only company controls.
- **Admin:** company membership role; operational management across company Projects, schedules, Users within allowed role boundaries, Resources, Types, and Templates.
- **Employee (Internal):** read-only company schedule access. Project assignment controls team/folder/notification eligibility, not schedule visibility.
- **External/Client:** read-only access only to explicitly assigned Projects and an approved safe subset of data.

The target model stores role on company membership. The current `user.user_type` and `user.company_id` structure is transitional and must not be extended as the permanent authorization model.

## Permission legend

- **M:** Manage/create/update.
- **V:** View.
- **S:** Safe/sanitized view only.
- **A:** View only when explicitly assigned.
- **O:** Owner only.
- **P:** Platform only.
- **—:** No access; server must deny.

## Core matrix

| Resource/action | Platform Admin | Owner | Admin | Employee | External/Client |
| --- |:---:|:---:|:---:|:---:|:---:|
| Company list/create/suspend/restore | P | — | — | — | — |
| Tenant business records without membership | — | — | — | — | — |
| Company settings/time zone | — | M | V where required | V only where explicitly useful | — |
| Promote member to Admin | — | O | — | — | — |
| Add/deactivate another Owner | — | O; last Owner protected | — | — | — |
| Invite/manage Employee or External | — | M | M | — | — |
| Change/deactivate Admin or Owner | — | O | — | — | — |
| Project list | — | V all | V all | V all | A only |
| Create/edit/complete/archive Project | — | M | M | — | — |
| Permanently delete Project | — | O with confirmation | — | — | — |
| Internal Project Plan/Gantt | — | M | M | V | S/A if enabled per Project |
| External safe Project task list | — | V | V | V | A/S |
| Project Types | — | M | M | V/reference only | — |
| Templates | — | M | M | V/reference only if approved UI requires | — |
| Resources/categories | — | M | M | V | No private resource detail |
| Create/edit Tasks and dependencies | — | M | M | — | — |
| Project Calendar | — | M | M | V | A/S |
| Master Calendar | — | M | M | V | — |
| Resource Calendar | — | M | M | V | — |
| Create/edit Events | — | M | M | — | — |
| Common Microsoft link | — | V | V | V only if assigned | A only |
| Private Microsoft link/identifier | — | V | V | — | — |
| Company Microsoft connection/root | — | M | M | — | — |
| Personal Google connection | — | Own account | Own account | Own account | Own account |
| Audit history | — | V company | V operational subset; approval needed | — | — |

## Field-level External/Client policy

Allowed for assigned Projects:

- Project name and approved public status.
- Simplified externally visible Tasks, dates, and progress.
- Project Calendar entries marked externally visible.
- Optional simple read-only Gantt when enabled for that Project.
- Common link, subject to Microsoft authentication and permission.

Never serialize:

- Internal notes or private descriptions.
- Dependency lag/configuration detail unless separately approved.
- Other Users, private Resource contact/detail, or company-wide schedules.
- Private folder URL, item ID, drive ID, site ID, or error detail.
- Unassigned Project identifiers, names, counts, search matches, feeds, or calendar items.

## Lifecycle rules

- Suspended company: company sessions rejected; Google sync paused; Dialoggg data and Microsoft mappings preserved.
- Deactivated membership: access revoked on next request; relevant sessions invalidated; history preserved.
- Last active Owner: cannot be deactivated or demoted.
- Archived/completed Project: readable according to the same role scope; writes blocked except approved reopen/restore actions.
- Removed External assignment: Project disappears from list, direct routes, APIs, feeds, and future Google delivery.

## HTTP denial policy

- `401 Unauthorized`: no valid session.
- `403 Forbidden`: authenticated but lacks a general action capability, where revealing the resource is safe.
- `404 Not Found`: tenant/object assignment mismatch or any case where existence would leak another company/Project.
- UI restricted states may explain role boundaries, but the server result remains authoritative.

## Engineering requirements

- Centralize decisions as `can(actor, action, resource)` or equivalent policy functions.
- Load active identity, active membership, company state, Project assignment, and object ownership before returning data.
- Use role-specific DTOs/queries; never fetch sensitive data and rely on CSS to hide it.
- Do not trust company, role, or assignment IDs from the request body.
- Apply the same policy to pages, APIs, feeds, jobs, exports, integration mappings, and support tools.

## Required approval points

1. Whether Admin may view company settings read-only or only the specific settings it manages.
2. Whether Employee may open Template details or only see Template name on Projects.
3. Exact audit-history visibility for Admin.
4. Exact fields permitted in the External simple Gantt.

These refinements do not change the approved high-level role model but must be fixed before their APIs are built.

## Test minimum

For every matrix cell, test one allowed and one denied path where applicable, including direct URL, API ID substitution, cross-company ID, unassigned Project, archived/completed state, suspended company, deactivated membership, and stale session.

