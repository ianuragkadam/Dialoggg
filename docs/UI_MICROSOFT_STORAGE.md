# OneDrive / SharePoint and Project Folders UI Module

Last verified: September 15, 2026

## Delivery boundary

This is a detailed UI-only review of the company OneDrive for Business/SharePoint connection and each Project's Common and Private folder references. It never starts Microsoft OAuth, stores a token, creates or links a folder, changes Microsoft permissions, opens an external location, or modifies production data. Dialoggg's retired in-app file storage remains absent.

## Routes and entry points

| Route / location | Purpose |
| --- | --- |
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
| `DG-ODR-011` | Open preview explains that production opens the protected Microsoft location in a new browser tab; UI review does not navigate externally. |
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
10. Open Common/Private preview — records the intended new-tab behavior without navigating to a fake or unsafe destination.

## Role matrix

| Role / assignment | Company setup | Common | Private |
| --- | --- | --- | --- |
| Owner | Manage | Visible | Visible |
| Admin | Manage | Visible | Visible |
| Assigned Employee (Internal) | Restricted | Visible | Omitted |
| Unassigned Employee (Internal) | Restricted | Omitted | Omitted |
| Assigned External/Client | No settings entry | Visible in safe Project view | Omitted |
| Unassigned External/Client | No Project access | Omitted | Omitted |

## Deferred implementation

- Microsoft Entra application registration, OAuth consent, Graph scopes, protected token storage, refresh, and revocation detection.
- Stable tenant/site/drive/library/root and per-Project item-ID persistence with strict company isolation.
- Microsoft folder picker, object/location validation, retry-safe create/link operations, and reconciliation.
- Authorization filtering on every HTML response, API payload, log, error, and cache boundary.
- Real new-tab links and graceful handling of renamed, moved, missing, permission-denied, disconnected, and revoked locations.
- Audit records, monitoring, and production integration tests against approved Microsoft 365 test tenants.
