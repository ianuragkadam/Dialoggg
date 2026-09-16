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
| Project Types settings/list | — | M | M | — | — |
| Template Library/details/actions | — | M | M | — | — |
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

## Implementation defaults from the approved baseline

- There is no generic company-settings permission. Each setting has an explicit policy: Microsoft Storage is Owner/Admin; Owner/Admin management is Owner-only; Platform company lifecycle is Platform Administrator-only.
- Employee and External/Client cannot open Project Types settings or the Template Library/details. A Project may display the already-selected Project Type/Template-derived result where needed without exposing management routes.
- Owner receives company audit visibility. Admin receives audit entries for operational objects/actions it is permitted to manage, but not Owner-only membership/security administration.
- External simple Gantt exposes only externally visible Task name, Start, End/Duration, progress, hierarchy needed for comprehension, and safe connector display. It excludes lag values, internal notes, Resources/private people data, internal-only Tasks, and editing controls.

These are conservative implementation rules derived from the approved role and privacy requirements. Any request to broaden access requires change control rather than an informal UI exception.

## Test minimum

For every matrix cell, test one allowed and one denied path where applicable, including direct URL, API ID substitution, cross-company ID, unassigned Project, archived/completed state, suspended company, deactivated membership, and stale session.
