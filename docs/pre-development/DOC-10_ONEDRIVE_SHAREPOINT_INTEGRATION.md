# DOC-10 — OneDrive for Business and SharePoint Integration Design

**Version:** 0.1  
**Status:** Microsoft tenant setup and technical spike required  
**Requirements:** `DG-ODR-001`–`DG-ODR-014`

## Product contract

- Dialoggg stores no Project files.
- Supported targets are OneDrive for Business and SharePoint document libraries.
- Owner/Admin connects company storage and chooses one company root.
- Each Project has one Common and one Private folder mapping.
- Owner/Admin can create folders or link existing folders.
- Dialoggg controls link visibility only; Microsoft controls actual file permissions.
- Common is visible to Owner/Admin, assigned Employees, and assigned External/Clients.
- Private is visible only to Owner/Admin.
- Dialoggg never automatically renames, moves, or deletes Microsoft folders because of Project lifecycle changes.

## Official API research

Microsoft Graph represents folders as `driveItem` resources and creates a folder below a stable drive/item parent with `POST /drives/{drive-id}/items/{parent-item-id}/children`. Name conflicts have explicit behavior. See [Create folder](https://learn.microsoft.com/en-us/graph/api/driveitem-post-children?view=graph-rest-1.0) and [driveItem](https://learn.microsoft.com/en-us/graph/api/resources/driveitem?view=graph-rest-1.0).

The integration should request least privilege. Microsoft documents delegated `Files.ReadWrite` as least privilege for some drive-item permission operations, with broader scopes depending on the selected site/library and operation. The spike must validate the actual root-selection and folder workflows before scopes are fixed. Dialoggg will not create sharing permissions in v1. See [driveItem permission API](https://learn.microsoft.com/en-us/graph/api/driveitem-post-permissions?view=graph-rest-1.0).

## Proposed connection model

- Company-level delegated OAuth Authorization Code flow with PKCE, performed by Owner/Admin, requesting `offline_access` for server-side folder operations after initial consent.
- Store tenant ID, account/object ID, site ID if applicable, drive ID, selected root item ID, root display metadata, token envelope, state, and last health result.
- Store Project mapping by stable `driveId + itemId`; display name and web URL are refreshable metadata, not identity.
- Encrypt tokens and protect mapping identifiers as company-confidential values.

Microsoft recommends authorization-code flow with PKCE and a supported authentication library; refresh tokens are returned only when `offline_access` is requested and can expire or be revoked, so reconnect is a normal recovery state. See [Microsoft authorization-code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow).

Start the proof of concept with delegated `Files.ReadWrite` for OneDrive for Business. SharePoint discovery/root selection may require a broader site/file permission depending on the exact tenant/library flow. Do not approve `Files.ReadWrite.All` or `Sites.ReadWrite.All` until the spike demonstrates why a narrower permission cannot satisfy create/link/resolve under the selected root. Microsoft recommends least privilege: [Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference).

## Setup flow

1. Owner/Admin chooses OneDrive for Business or SharePoint library.
2. Server creates bound OAuth state/PKCE and performs consent.
3. Callback validates identity, company, state, and tenant.
4. User selects permitted site/drive/library/root through server-proxied, company-scoped options.
5. Exact review displays service, tenant/site/library, and selected root.
6. Save connection; no Project folders are automatically changed unless separately confirmed.

## Project folder flows

### Create new

- Use deterministic suggested names based on approved Project folder naming.
- Before creating, query for an existing intended mapping/name and require an explicit conflict choice.
- Store returned stable identifiers.
- Repeated commands with the same idempotency key must not create duplicates.

### Link existing

- Validate selected item is a folder within the connected drive/library and permitted root policy.
- Require exact Common/Private review.
- Do not alter Microsoft permissions.
- A Private mapping must never be serialized to Employee or External/Client clients.

## Runtime/open behavior

The server authorizes link eligibility, resolves current mapping health, and returns a short-lived/open-safe redirect or approved `webUrl` only to eligible roles. Microsoft then performs its own authentication and permission decision in a new browser tab. Permission denied is not treated as a Dialoggg authorization grant failure.

## Recovery states

- Renamed/moved: stable item ID still resolves; refresh display metadata.
- Missing/deleted: show unavailable; Owner/Admin may relink; do not recreate silently.
- Permission denied: explain Microsoft access requirement; do not reveal Private details.
- Connection revoked/expired: require Owner/Admin reconnect.
- Company suspended: preserve all mappings; block company access.
- Project complete/archive/delete/restore/rename: preserve folder and mapping; never rename/delete Microsoft item.

## Security tests

- Cross-company drive/item substitution.
- Employee/External response contains no Private URL or ID, including errors/logs.
- Unassigned Employee/External cannot obtain Common link.
- OAuth state replay, tenant mismatch, revoked consent.
- Link target changed/missing/permission-denied behavior.
- Duplicate create command and name conflict.
- Project deletion emits no Graph delete/rename request.

## Inputs required before build

- Client-owned Microsoft Entra application and tenant test access.
- Approved delegated/application-consent model and minimum scopes.
- Test OneDrive for Business and SharePoint library.
- Authorized redirect URIs and support/privacy ownership.
- Named Microsoft 365 administrator for permission issues.
