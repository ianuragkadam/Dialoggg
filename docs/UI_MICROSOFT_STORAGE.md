# OneDrive / SharePoint and Project Folders UI Module

Last verified: September 20, 2026

## Delivery boundary

The approved UI is now backed by the local schema-v14 Microsoft domain. A Platform Administrator configures one encrypted Microsoft OAuth/Graph application; each company Owner/Admin authorizes its own OneDrive for Business or SharePoint connection; and Project Common/Private cards create, link, resolve, and open stable Microsoft folder references. Dialoggg's retired in-app file storage remains absent, Microsoft remains the permission authority, and no Project/company lifecycle action automatically mutates Microsoft content.

## Routes and entry points

| Route / location | Purpose |
| --- | --- |
| `/platform/integration-setup` | Platform Administrator write-only Entra application settings, callback, capability verification, rotation, disable, enable, and revoke |
| `/settings/microsoft-storage` | Owner/Admin company connection, root-location, health, reconnect, and disconnect review |
| `/projects/[id]#folders` | **Common and Private** Project tab for authorized internal Users |
| `/projects/[id]` External/Client view | Assigned External/Client Common entry with no Private identifier or link |

## Requirement traceability

| Requirement | UI coverage |
| --- | --- |
| `DG-ODR-001` | States that files remain in Microsoft 365 and Dialoggg is not an in-app file browser. |
| `DG-ODR-002` | Offers SharePoint document library or OneDrive for Business and explicitly excludes personal OneDrive. |
| `DG-ODR-003`, `FUP-014` | Owner/Admin selects one company root; changing it applies to future automatic creation and never moves existing Project folders. |
| `DG-ODR-004` | Owner/Admin-only connect/reconnect UI; Employee receives a restricted screen and External has no settings entry. |
| `DG-ODR-005` | Every Project review has exactly one Common and one Private reference with explicit unavailable states. |
| `DG-ODR-006` | Folder dialog offers retry-safe automatic creation or linking an existing validated Microsoft folder. |
| `DG-ODR-007` | Repeated boundary: Dialoggg controls eligible link visibility; Microsoft 365 administrators control real access. |
| `DG-ODR-008` | Common is available to Owner/Admin and assigned Employees; assigned External/Clients receive Common in their safe Project view. |
| `DG-ODR-009` | No anonymous link behavior; External/Client must authenticate with Microsoft and handles Microsoft denial safely. |
| `DG-ODR-010` | Private is Owner/Admin-only; Employee and External states omit its URL and stable item identifier. |
| `DG-ODR-011` | An authorized open action resolves the current stable item, refreshes safe display metadata, and returns the provider URL only to the eligible caller for a new browser tab. |
| `DG-ODR-012` | Company and Project copy states that rename, Complete, Archive, Restore, Delete, root change, and disconnect never rename/move/delete Microsoft folders. |
| `DG-ODR-013` | Connected, revoked/attention, disconnected, renamed, missing/moved, and permission-denied states provide safe recovery guidance. |
| `DG-ODR-014` | Protected company-scoped tenant/drive/library/root identifiers, no tokens in browser/logs, and least-required Graph scope are explicit. |

## Dialog and state inventory

1. Connected · healthy company connection.
2. Action needed after revoked consent or unreachable site/library/root.
3. Not connected.
4. Connect/Reconnect Microsoft Storage — SharePoint or OneDrive for Business, protected identifier scope, and permission-boundary acknowledgement.
5. Change company folder root? — future automatic creation only, with existing-folder preservation acknowledgement.
6. Disconnect Microsoft Storage? — links stop, but Microsoft folders/files/permissions/audit history remain untouched.
7. Set up Common folder — Create automatically or Link existing folder, exact Project/folder review, and acknowledgement gate.
8. Set up Private folder — same safe setup with the Owner/Admin-only boundary.
9. Project folder states: Available, Renamed in Microsoft, Missing or moved, Microsoft permission denied, and Company connection unavailable.
10. Open Common/Private — resolves the protected mapping, refreshes renamed display metadata, and opens the Microsoft URL in a new tab only for an eligible User.

## Role matrix

| Role / assignment | Company setup | Common | Private |
| --- | --- | --- | --- |
| Owner | Manage | Visible | Visible |
| Admin | Manage | Visible | Visible |
| Assigned Employee (Internal) | Restricted | Visible | Omitted |
| Unassigned Employee (Internal) | Restricted | Omitted | Omitted |
| Assigned External/Client | No settings entry | Visible in safe Project view | Omitted |
| Unassigned External/Client | No Project access | Omitted | Omitted |

## Local implementation evidence

- Schema v14 persists provider-bound single-use PKCE state, company connection health, encrypted refresh tokens and stable Microsoft identifiers, root selection, and Project folder mappings.
- Platform verification requires the delegated scope plus Graph identity and temporary write/delete capability checks before company connection starts are enabled.
- Company connection and root/folder choices are authorized, short-lived, and opaque to the browser. Folder creation checks by name before creating so retries do not duplicate a folder.
- Safe DTOs omit raw tenant/site/drive/root/item IDs, refresh tokens, provider payloads, and Private metadata for Employee/External roles.
- Automated verification covers connected/renamed/missing/permission/disconnected/revoked recovery, tenant isolation, CSRF, lifecycle preservation, mobile layout, signed-out routing, and console errors. See `docs/evidence/MICROSOFT_ONEDRIVE_CHECKPOINT_2026-09-20.md`.

## Remaining controlled deployment work

- Enter or rotate the real client-owned Entra application only after the dependency-ordered schema-v7–v14 release and verified mounted-volume backup.
- Complete provider-owned OAuth/consent in an approved Microsoft 365 test tenant and validate OneDrive for Business plus the intended SharePoint site/library/root.
- Run live create/link/open/rename/move/missing/permission/revocation smoke tests without granting permissions or deleting provider content.
- Record deployment, provider-scope, readiness/log, role/tenant, and rollback evidence before release sign-off.
