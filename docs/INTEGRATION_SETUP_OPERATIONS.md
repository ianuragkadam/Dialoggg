# Secure Integration Setup Operations

## Purpose and access boundary

The private setup workshop at `/integration-setup` onboards operational credentials for:

- platform Google OAuth configuration, shared by all companies;
- platform Microsoft OAuth/Graph application configuration, shared by all companies; and
- platform Resend sender configuration, shared by all companies.

Only a Platform Administrator can issue new links, at `/platform/integration-setup`. New links are platform-provider only and require a separate explicit authorization checkbox. Company Owners and Admins do not receive platform secrets; they authorize their own company Microsoft storage at `/settings/microsoft-storage` after the platform Microsoft application is Valid. Historical company-scoped invitations remain fail-closed: they expose no platform provider and direct the operator to authenticated company settings.

Each issue/rotation creates two different random links: a writable workshop and a read-only internal review. The administrator's browser generates the raw bearers and sends only their SHA-256 hashes to the issuance API; the API never returns a raw token. The raw bearer is after `#token=` in the private URL fragment, so browsers do not send it in HTTP request targets, referrers, server-rendered HTML, or server access logs. The recipient's browser exchanges it in a same-origin POST body for an eight-hour HttpOnly session, then removes the fragment from its address bar. Only the SHA-256 invitation and session hashes are stored.

Production may also use stable one-click links configured through separate `INTEGRATION_SETUP_FORM_TOKEN` and `INTEGRATION_SETUP_REVIEW_TOKEN` deployment secrets. Scott opens `/integration-setup#token=<form token>` and immediately receives the writable workshop; the team keeps `/integration-setup-review#token=<review token>` internal. The raw values remain URL fragments and are never stored in SQLite. On first use, Dialoggg creates or refreshes only their hashed invitation records. Rotating either deployment secret revokes the previous managed link. Both variables must be present and different or the managed links fail closed.

## Required deployment configuration

| Variable | Requirement |
| --- | --- |
| `APP_BASE_URL` | Canonical HTTPS production origin, without a trailing slash. Google and Microsoft callback URIs are derived from it. |
| `APP_ENCRYPTION_KEY` | Exactly 32 random bytes encoded as base64. Store only in the deployment secret manager. It is the root key for AES-256-GCM envelopes. |
| `RAILWAY_VOLUME_MOUNT_PATH` | Persistent SQLite directory; `/data` in the current Railway topology. |
| `INTEGRATION_SETUP_FORM_TOKEN` | Long random bearer for Scott's stable one-click workshop link. |
| `INTEGRATION_SETUP_REVIEW_TOKEN` | Different long random bearer for the internal read-only review link. |

`INTEGRATION_PROVIDER_MODE=fake` is test-only. Never set it in a deployed environment. Google, Microsoft, and Resend credential values are entered in the workshop and encrypted in SQLite; they are not deployment variables.

Schema migration v8, `secure_integration_setup_workshop`, adds scoped invitations, short-lived workshop sessions, provider-neutral configuration, immutable credential versions, validation attempts, and single-use OAuth state. Schema v13, `google_calendar_delivery`, adds permanent Platform Google state, membership-scoped personal connections, encrypted personal authorization context, mappings, and sync-run health. Schema v14, `microsoft_onedrive_delivery`, adds the Platform Microsoft provider, company OAuth state/connection health, and protected Project folder mappings. Schema v15, `transactional_email_delivery`, adds durable email metadata, encrypted provider receipts, an immutable attempt ledger, expiry, bounded retry/dead-letter health, and stale-lock recovery. Back up and migrate the production database in dependency order before serving these checkpoints.

## Permanent Platform Google, Microsoft, and Resend settings

A Platform Administrator can manage the active Google and Microsoft OAuth applications plus the shared Resend sender at `/platform/integration-setup` without issuing a workshop invitation or editing an environment file. All three reuse the provider-neutral configuration and versioned AES-256-GCM credential store; there is no second secret system.

Save, secret rotation, disable, enable, and revoke require the current Platform Administrator password. Manual Resend dead-letter retry also requires it. Secret fields are write-only. Safe reads show configured state, credential fingerprint/version, non-secret provider metadata, callback URI where relevant, last verification, disabled state, and provider-safe status only. Saving or enabling demotes the configuration to verification required. Google **Valid** requires a fresh callback and Calendar capability check; Microsoft **Valid** requires a fresh callback, required delegated scope, Graph identity, and temporary write/delete capability check; Resend **Valid** requires a read-only exact-domain/DNS/SPF/DKIM proof. Local revoke retires the active version; provider-side revocation must also be completed when ending an application credential.

## Issuing Scott's links

1. Sign in in the separate Platform Administrator context.
2. Open **Companies → Integration setup access**.
3. Review the notice that the workshop contains only Platform Google, Microsoft, and Resend credentials; company Microsoft connections stay in authenticated company settings.
4. Check the platform-credential authorization acknowledgement.
5. Issue the links, copy them once, and send each link through an approved private channel. Keep the review link internal.

Issuing a new pair revokes the previous unrevoked pair with the same scope and company. Links expire after the selected period, currently one to thirty days. A reviewer cannot mutate configuration.

## Provider verification

Google uses an authorization-code flow with PKCE, a one-time hashed state, the exact derived callback URI, offline access, and the narrow `calendar.app.created` scope. Platform verification exchanges the code and creates, reads, and deletes a temporary Calendar; its authorization tokens are discarded. A personal User authorization separately stores an encrypted refresh token, creates or reuses that connection's dedicated `Dialoggg` calendar, and starts reconciliation.

Microsoft Platform verification uses authorization code with PKCE and delegated `openid profile offline_access User.Read Files.ReadWrite`, proves Graph identity, discovers the drive root, and performs a temporary small write and immediate delete. A company Owner/Admin then performs a separate single-use PKCE authorization through that verified application, chooses OneDrive for Business or a SharePoint site/library, and stores only encrypted company-scoped authorization and stable identifiers. Broader tenant-wide SharePoint application permissions are not requested.

Resend validation performs a read-only domain listing with the stored API key and requires the From address domain to exactly match a provider-reported verified domain. A test message is a separate, explicitly confirmed action with an idempotency key; validation never sends mail automatically.

Run `npm run email:process` from one scheduled production worker to process due invitation, password-reset, and operational jobs. The worker defers without consuming an attempt when Resend is absent, disabled, or unverified; cancels expired work; retries transient failures with bounded backoff; dead-letters permanent or exhausted work; and records only provider-safe delivery metadata. Recipient addresses, action URLs, credential values, and provider message IDs never appear in the Platform health view. Alert on non-zero command exits, dead jobs, sustained retry growth, and stale-lock recovery. Do not run fake provider mode in production.

## Rotation, revocation, and recovery

- Replacing a secret creates a new AES-256-GCM credential version and retires the former ciphertext. Secret values never return to the browser after save.
- Changing non-secret provider fields demotes the provider to **Saved, needs verification**.
- Revocation retires the active credential and returns the provider to **Not started**. Provider-side revocation should also be completed in Google Cloud, Entra, or Resend.
- If `APP_ENCRYPTION_KEY` is lost, stored credentials cannot be recovered. Generate a new root key, revoke provider credentials, and re-enter every credential through freshly issued links.
- If a workshop link is disclosed, rotate its invitation pair immediately and inspect `audit_event` plus safe validation history. Raw tokens and secrets must never be copied into tickets or logs.
- OAuth/provider failures are reduced to safe codes. Retry only after correcting the provider configuration; repeated attempts are rate-limited.

## Retention and limitations

Company Microsoft connections and folder mappings cascade only when the company is actually deleted; disconnect and Project lifecycle actions preserve the mappings and never rename/move/delete provider content. Invitation sessions and OAuth states cascade with their parent invitations. Credential history is retained as ciphertext for rotation evidence; retired plaintext is never recoverable. A future retention job may purge expired sessions, OAuth states, validation details, and retired ciphertext after the approved audit window.

The workshop and permanent Platform page verify configuration and capabilities. Personal Google Calendar token refresh, Task/Event eligibility, stable mappings, outbox reconciliation, retry/dead-letter health, disconnect cleanup/retention, and explicit post-restoration resume are implemented in schema v13. Microsoft company authorization, root selection, stable Project Common/Private mappings, role filtering, open/refresh, recovery states, and lifecycle preservation are implemented in schema v14. Resend invitation/reset/operational delivery, expiry, retry/dead-letter health, encrypted receipts, and attempt evidence are implemented in schema v15. Provider webhooks, production worker scheduling/alerting, and approved live-account smoke testing remain controlled operational work.
