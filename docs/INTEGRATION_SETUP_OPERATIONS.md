# Secure Integration Setup Operations

## Purpose and access boundary

The private setup workshop at `/integration-setup` onboards operational credentials for:

- platform Google OAuth configuration, shared by all companies;
- platform Resend sender configuration, shared by all companies; and
- one company Microsoft OneDrive for Business or SharePoint configuration.

Only a Platform Administrator can issue links, at `/platform/integration-setup`. Company Owners and Admins cannot open or issue platform-scoped credential links. A company-only invitation exposes Microsoft setup only. Selecting platform or combined scope requires a separate explicit authorization checkbox.

Each issue/rotation creates two different random links: a writable workshop and a read-only internal review. The administrator's browser generates the raw bearers and sends only their SHA-256 hashes to the issuance API; the API never returns a raw token. The raw bearer is after `#token=` in the private URL fragment, so browsers do not send it in HTTP request targets, referrers, server-rendered HTML, or server access logs. The recipient's browser exchanges it in a same-origin POST body for an eight-hour HttpOnly session, then removes the fragment from its address bar. Only the SHA-256 invitation and session hashes are stored.

## Required deployment configuration

| Variable | Requirement |
| --- | --- |
| `APP_BASE_URL` | Canonical HTTPS production origin, without a trailing slash. Google and Microsoft callback URIs are derived from it. |
| `APP_ENCRYPTION_KEY` | Exactly 32 random bytes encoded as base64. Store only in the deployment secret manager. It is the root key for AES-256-GCM envelopes. |
| `RAILWAY_VOLUME_MOUNT_PATH` | Persistent SQLite directory; `/data` in the current Railway topology. |

`INTEGRATION_PROVIDER_MODE=fake` is test-only. Never set it in a deployed environment. Google, Microsoft, and Resend credential values are entered in the workshop and encrypted in SQLite; they are not deployment variables.

Schema migration v8, `secure_integration_setup_workshop`, adds scoped invitations, short-lived workshop sessions, provider-neutral configuration, immutable credential versions, validation attempts, and single-use OAuth state. Schema v13, `google_calendar_delivery`, adds permanent Platform Google state, membership-scoped personal connections, encrypted personal authorization context, mappings, and sync-run health. Back up and migrate the production database in dependency order before serving either checkpoint.

## Permanent Platform Google settings

A Platform Administrator can manage the active Google OAuth application at `/platform/integration-setup` without issuing a workshop invitation or editing an environment file. The same provider-neutral configuration and versioned AES-256-GCM credential store is reused; there is no second secret system.

Save, secret rotation, disable, enable, and revoke require the current Platform Administrator password. The client secret field is write-only. Safe reads show configured state, credential fingerprint/version, non-secret Google Cloud metadata, callback URI, last verification, disabled state, and a provider-safe status only. Saving or enabling demotes the configuration to verification required. **Valid** requires a fresh OAuth callback and Calendar capability check. Revoke retires the active credential locally; complete provider-side revocation in Google Cloud when ending the application credential.

## Issuing Scott's links

1. Sign in in the separate Platform Administrator context.
2. Open **Companies → Integration setup access**.
3. Choose the active company.
4. Choose **Platform Google/Resend + company Microsoft** only when Scott is explicitly authorized to handle both platform and Sport Court company credentials.
5. Check the platform-credential authorization acknowledgement.
6. Issue the links, copy them once, and send each link through an approved private channel. Keep the review link internal.

Issuing a new pair revokes the previous unrevoked pair with the same scope and company. Links expire after the selected period, currently one to thirty days. A reviewer cannot mutate configuration.

## Provider verification

Google uses an authorization-code flow with PKCE, a one-time hashed state, the exact derived callback URI, offline access, and the narrow `calendar.app.created` scope. Platform verification exchanges the code and creates, reads, and deletes a temporary Calendar; its authorization tokens are discarded. A personal User authorization separately stores an encrypted refresh token, creates or reuses that connection's dedicated `Dialoggg` calendar, and starts reconciliation.

Microsoft uses authorization code with PKCE and delegated `openid profile offline_access User.Read Files.ReadWrite`. OneDrive verification discovers the root. SharePoint verification also discovers the configured site. Both perform a temporary small write and immediate delete. Broader tenant-wide SharePoint application permissions are not requested.

Resend validation performs a read-only domain listing with the stored API key and requires the From address domain to exactly match a provider-reported verified domain. A test message is a separate, explicitly confirmed action with an idempotency key; validation never sends mail automatically.

## Rotation, revocation, and recovery

- Replacing a secret creates a new AES-256-GCM credential version and retires the former ciphertext. Secret values never return to the browser after save.
- Changing non-secret provider fields demotes the provider to **Saved, needs verification**.
- Revocation retires the active credential and returns the provider to **Not started**. Provider-side revocation should also be completed in Google Cloud, Entra, or Resend.
- If `APP_ENCRYPTION_KEY` is lost, stored credentials cannot be recovered. Generate a new root key, revoke provider credentials, and re-enter every credential through freshly issued links.
- If a workshop link is disclosed, rotate its invitation pair immediately and inspect `audit_event` plus safe validation history. Raw tokens and secrets must never be copied into tickets or logs.
- OAuth/provider failures are reduced to safe codes. Retry only after correcting the provider configuration; repeated attempts are rate-limited.

## Retention and limitations

Company-scoped Microsoft setup cascades when the company is deleted. Invitation sessions and OAuth states cascade with their parent invitations. Credential history is retained as ciphertext for rotation evidence; retired plaintext is never recoverable. A future retention job may purge expired sessions, OAuth states, validation details, and retired ciphertext after the approved audit window.

The workshop and permanent Platform page verify configuration and capabilities. Personal Google Calendar token refresh, Task/Event eligibility, stable mappings, outbox reconciliation, retry/dead-letter health, disconnect cleanup/retention, and explicit post-restoration resume are implemented locally in schema v13. Microsoft Project-folder mapping, Resend outbox delivery migration, and provider webhooks remain separate product integration modules. Production worker scheduling and live Google account smoke testing remain controlled deployment work.
