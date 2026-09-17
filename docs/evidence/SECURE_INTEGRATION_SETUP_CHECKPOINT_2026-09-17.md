# Secure Integration Setup Checkpoint — 17 September 2026

## Outcome

The secure operational workshop is complete and locally release-ready. It provides a private writable setup route, a separate read-only review route, and a Platform Administrator issuance/rotation route without exposing platform credentials to ordinary company roles.

| Item | Evidence |
| --- | --- |
| Workshop | `/integration-setup#token=<private-fragment-bearer>` |
| Internal review | `/integration-setup-review#token=<separate-private-fragment-bearer>` |
| Link issuance | `/platform/integration-setup` in the separate Platform Administrator context |
| API | `/api/integration-setup`, `/api/integration-setup/review`, `/api/integration-setup/session`, provider OAuth callbacks, and platform invitation issuance |
| Schema | v8 `secure_integration_setup_workshop` |
| Local rollback copy | `data/backups/pre-integration-setup-2026-09-17.db` at schema v7 |
| Rollback SHA-256 | `F470B55B5AD067035F86C08FAC68B663711EEC89CCA348A0B2D0CF134530E566` |

## Security and scope controls

- Google OAuth and Resend are platform-scoped; Microsoft storage is company-scoped. A company-only invitation cannot query or render either platform provider.
- Combined/platform invitations require a Platform Administrator's explicit platform-secret authorization. Ordinary Owner/Admin sessions cannot issue these links.
- The administrator browser generates two 256-bit bearers and sends only their SHA-256 hashes to the issuance API. The API does not return either raw bearer.
- The private link carries its raw bearer only in the URL fragment. It is exchanged by same-origin POST for an eight-hour HttpOnly session, removed from browser history, and never enters request targets, query strings, server-rendered HTML, browser storage, database plaintext, logs, or audit metadata.
- Provider secrets use AES-256-GCM with a deployment-managed 32-byte `APP_ENCRYPTION_KEY`, per-record random IVs, authenticated config/version context, immutable versions, active-version uniqueness, and retirement on replace/revoke.
- Secret values never return from APIs. Safe display metadata is limited to configured state, a 12-character fingerprint, last four, version, environment, and timestamps.
- Mutations enforce invitation scope, same-origin and CSRF validation, no-store responses, bounded rate limits, structured safe errors/request IDs, and audits without payloads.
- OAuth uses authorization code, PKCE S256, expiring single-use hashed state, the exact derived callback URI, and discarded capability-check tokens.
- Google begins with `calendar.app.created`; Microsoft begins with delegated `openid profile offline_access User.Read Files.ReadWrite`; Resend validation is read-only and an email is sent only after a second explicit confirmation.

## Verification

- Unit, migration, backup/restore, static security, and invariant tests: **27/27 passed**.
- API/end-to-end scenario regression: **136/136 passed**.
- Focused secure-workshop real-browser checks: **16/16 passed**.
- Existing company, types, templates, users/access, resources, projects, project-plan, calendars/events, Google UI, and Microsoft UI browser regression: **142/142 passed**.
- Combined browser result: **158/158 passed**.
- TypeScript validation: passed.
- Production build: passed on locked **Next.js 15.5.24**, including standalone trace generation and post-build asset preparation.
- Authoritative `npm@10.8.2 audit --omit=dev`: **0 vulnerabilities**.
- Authoritative full `npm@10.8.2 audit`: **0 vulnerabilities**.
- Local schema-v8 database: integrity `ok`, foreign-key violations `0`, and no seeded integration configuration.
- Schema-v7 rollback copy: integrity `ok`, foreign-key violations `0`, and no v8 integration tables.

Focused browser coverage includes first visit, fragment removal, no-store/CSRF rejection, save/refresh, no secret replay, fake Google OAuth failure/retry, Google secret rotation v1→v2, fake Microsoft OAuth capability verification, Resend exact-domain validation and confirmed test email, completion gating, review redaction, expired/revoked invitations, company-only isolation, ciphertext tampering, confirmed revocation, mobile layout, keyboard focus, and one-time Platform Administrator link issuance.

## Deployment inputs and judgment

No new provider credential environment variables are required. Production must retain:

- `APP_BASE_URL` as the exact canonical HTTPS origin; and
- `APP_ENCRYPTION_KEY` as the existing base64-encoded 32-byte external root key.

Do not set `INTEGRATION_PROVIDER_MODE=fake` outside isolated tests. Migration v8 is additive, but it depends on pending schema v7. The controlled release must back up schema v6, apply v7 then v8, verify both checksums, and run live Users/Access plus integration access-boundary smoke tests before links are issued.

The checkpoint is safe for a controlled deployment under those gates. It is not permission to enter real provider credentials automatically, send a live test email, or claim Google/Microsoft/Resend verified. Those require Scott/the authorized account owner to use the private workshop.

## Known boundary

This module onboards and verifies provider configuration. Ongoing personal Google synchronization, Microsoft Project-folder mapping, Resend outbox migration, provider webhooks, and background token refresh remain separate integration modules.
