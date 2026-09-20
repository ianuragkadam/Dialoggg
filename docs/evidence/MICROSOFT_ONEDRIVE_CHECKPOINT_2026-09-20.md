# Microsoft OneDrive / SharePoint Checkpoint Evidence — 20 September 2026

## Outcome

Microsoft OAuth/Graph application settings, company OneDrive for Business/SharePoint connections, company root selection, and recoverable per-Project Common/Private folder references are complete locally. The checkpoint uses schema v14, `microsoft_onedrive_delivery`, and leaves Railway/production unchanged. No real Microsoft credential, account, tenant, site, drive, folder, or API was used.

Dialoggg remains a link and scheduling system, not a file store or Microsoft permission authority. It never creates sharing permissions and never automatically renames, moves, or deletes Microsoft content because a Project or company changes lifecycle state.

## Delivered scope

- Permanent Platform Microsoft settings at `/platform/integration-setup`, reusing the schema-v8 provider-neutral configuration and credential-version store.
- Write-only Entra client secret with versioned, context-bound AES-256-GCM envelopes; safe configuration/status/fingerprint/version/timestamp reads only.
- Current-password reauthentication for save, rotation, disable, enable, and revoke; callback derived from `APP_BASE_URL`; `APP_ENCRYPTION_KEY` remains outside SQLite and source control.
- Platform authorization-code verification with PKCE, session-bound single-use state, exact callback, delegated `openid profile offline_access User.Read Files.ReadWrite`, Graph identity, root discovery, and temporary write/delete capability proof before company connections are enabled.
- New setup invitations are platform-provider only. Historical company-scoped links expose no platform credential and direct the operator to authenticated Settings → Microsoft Storage.
- Company Owner/Admin authorization through the verified platform application, with single-use PKCE state, encrypted refresh token, encrypted tenant/account/site/drive/root identifiers, expiry/scope metadata, and provider-safe connection health.
- OneDrive for Business or SharePoint site/library discovery. Personal OneDrive is excluded; broader tenant-wide application permissions and Dialoggg-managed sharing grants are not requested.
- Root choices and folder choices are short-lived opaque encrypted values. Changing the selected company root affects future automatic creation only and never moves an existing Project mapping.
- Exactly one Common and one Private mapping per Project. Owner/Admin may create or link either; create checks for an existing same-name child before POST so retries do not duplicate folders.
- Stable encrypted drive/item identifiers with display-name refresh on open/rename. Safe renamed, missing/moved, permission-denied, disconnected, revoked, and transient-provider states preserve the Project and mapping.
- Authorization boundaries: Owner/Admin manage Common and Private; assigned Employee/External may receive Common only; unassigned Users receive neither; Private identifiers, URL, and metadata are omitted from unauthorized DTOs, logs, audits, and errors.
- Disconnect preserves Microsoft folders and local mappings. Project rename, Complete, Archive, Restore, and permanent Delete do not invoke provider rename/move/delete.
- Permanent company settings and live Project UI replace the former previews. External/Client runtime uses the real Common-folder card and never renders the legacy simple-Gantt preview.

## Migration and rollback evidence

Before applying v14 locally, a verified schema-v13 rollback copy was created:

- Path: `data/backups/pre-microsoft-onedrive-2026-09-20.db`
- SHA-256: `A831FFBFF88A986753FDF839FC090D42D918E4EBCF33F23B7EA03D60550EA786`
- Integrity: `ok`
- Foreign-key violations: `0`
- Latest migration: v13, checksum `1e2ab249d75875607f873c09660dd71108926e02e5e0c70b0b52318bbb2af872`

The restore command was exercised in `.tools/microsoft-onedrive-restore-verification`, reproduced a schema-v13 database, and reopened with integrity `ok` and zero foreign-key violations.

Migration v14 completed locally in 54 ms. Its full checksum is `10453485526b9b738e72a98fec364fdaceea08c6f5edae60d66f507d5739ed84`. The final database contains migration row 14, reports integrity `ok`, and has zero foreign-key violations.

The migration:

- allows one platform-scoped `microsoft_platform` configuration while preserving the upgrade path for legacy `microsoft_company` rows;
- binds Platform OAuth state to its provider and adds company Microsoft OAuth state;
- extends company connections with membership, scope, expiry, selected-root display, and safe health/error timestamps;
- binds Project folder mappings to the owning connection and adds encryption version, verification, and safe error fields; and
- adds indexes/triggers enforcing company, active Project, connection, and mapping scope.

## Automated verification

All gates passed on the final source tree:

- TypeScript: clean (`tsc --noEmit`)
- Unit/foundation/migration: 33/33
- Production-like API scenarios: 164/164
- Secure Integration Setup browser: 16/16
- Focused Microsoft browser: 16/16
- Focused Google browser after the shared Platform page extension: 14/14
- Complete browser regression: 160/160 across eleven suites
- Next.js 15.5.24 production build: 64 generated pages/routes
- Standalone public/static packaging: passed
- Locked npm 10.8.2 production audit: 0 vulnerabilities
- Locked npm 10.8.2 full audit: 0 vulnerabilities

The scenario suite proves Platform credential encryption/redaction and Graph capability gating; missing-scope, wrong-callback, outage, retry, rotation, disable/enable; company OAuth and encrypted tokens/identifiers; opaque root/folder choices; retry-safe create/link; tenant and Role boundaries; rename/open refresh; missing, permission, disconnect, and recovery behavior. The focused browser suite additionally proves permanent UI behavior, CSRF rejection, lifecycle preservation, mobile overflow, signed-out routing, and browser-console cleanliness.

The full regression found and corrected three integration-only stale assumptions: old company-scoped workshop fields, an External simple-Gantt label after the live Common-folder card replaced that preview, and unscoped Google selectors after the Microsoft Platform card was added. These were test alignment changes; all final suites passed. Visible QA found and fixed one real stale operator surface: the invitation issuer still offered empty company/combined scopes. New issuance is now platform-only in both UI and API, with company authorization routed to authenticated settings.

## Visible browser QA

Visible Chrome QA used a separate schema-v14 database and the local standalone server at `127.0.0.1`. A Platform Administrator:

1. opened the permanent Integration Settings page;
2. confirmed the exact Microsoft callback, delegated-scope explanation, write-only secret field, and disabled pre-verification controls;
3. saved an isolated fake credential and observed **Saved—verification required** with only a fingerprint/version returned;
4. completed the isolated fake Graph identity/write/delete callback and observed **Valid** plus a verification time; and
5. confirmed the corrected workshop notice exposes Platform Google/Microsoft/Resend only and routes company storage to authenticated settings.

A separate company Admin then opened Settings → Microsoft Storage, reviewed the permission/no-delete boundary, chose OneDrive for Business, accepted the explicit consent gate, completed isolated company OAuth, and observed **Connected · healthy** with root `Projects`. In `Human Microsoft Court`, the Admin created both **Common** and **Private** through the explicit permission acknowledgement. Both became **Available** with safe display names and protected stable-ID copy. No real provider or production system was contacted. The QA browser, server, and temporary database were closed and removed.

## Requirement traceability

- `DG-ODR-001`–`DG-ODR-004`: external-file boundary, supported business targets, stable company root, and Owner/Admin company management.
- `DG-ODR-005`–`DG-ODR-007`: one Common/Private mapping, retry-safe create/link, and Microsoft permission ownership.
- `DG-ODR-008`–`DG-ODR-010`: assignment-aware Common visibility and Owner/Admin-only Private omission.
- `DG-ODR-011`–`DG-ODR-014`: protected open behavior, no lifecycle mutation, recovery states, encrypted stable identifiers, and least-required delegated Graph scope.
- `FUP-012`: suspension preserves Microsoft folders/mappings.
- `FUP-014`: Owner/Admin selects the company root and root changes do not move existing mappings.

## Controlled deployment requirements

This checkpoint is deployment order 11, behind schema v7 through v13. A future authorized release must:

1. verify the exact Railway project/environment/service and configuration names without printing secret values;
2. create and verify a mounted-volume schema-v13 backup;
3. deploy dependency-ordered migrations through v14 and verify readiness/logs;
4. enter or rotate the real Entra Web application through Platform settings and configure the displayed exact callback;
5. complete real Platform OAuth identity/scope/write/delete verification and confirm only the approved delegated scopes;
6. connect an approved company OneDrive for Business and the intended SharePoint site/library/root with an authorized Owner/Admin;
7. run live create/link/open/rename/move/missing/permission/revocation/disconnect/lifecycle/Employee/External/tenant smoke tests without granting permissions or deleting provider content; and
8. record deployment ID, scope/consent evidence, readiness/log results, live smoke results, and rollback position before advancing to email delivery.

SharePoint tenant policy can require administrator consent or a scope adjustment for the selected site/library workflow. Any broader permission remains blocked until a live spike proves the narrower delegated flow cannot satisfy the approved operations and the change is separately reviewed.
