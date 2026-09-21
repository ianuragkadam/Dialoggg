# Transactional Email Delivery Checkpoint Evidence — 20 September 2026

## Outcome

Durable Resend-backed delivery for invitations, password resets, and operational notifications is complete locally on schema v15, `transactional_email_delivery`. Permanent Platform Resend settings, write-only credential rotation, read-only DNS/SPF/DKIM verification, explicit test delivery, delivery health, and password-protected manual retry are integrated at `/platform/integration-setup`.

No real Resend credential, sending domain, recipient, email, or provider API was used during local verification. Production remains on the already released schema-v14 checkpoint until this exact checkpoint commit passes the controlled Railway backup/deployment gate.

## Delivered scope

- Existing invitation and password-reset producers now persist explicit expiries while preserving the original encrypted email envelope format, so pre-v15 queued ciphertext remains decryptable.
- Operational notifications share the same durable queue contract.
- Recipient addresses and action URLs remain encrypted. Operational health exposes only recipient domain, status, attempt counts, safe error codes, HTTP status, and timestamps.
- The worker claims jobs and creates attempt rows atomically, attributes the configuration and credential version, encrypts provider message receipts, and commits the terminal queue/attempt state atomically.
- Retryable provider/network failures use bounded backoff; permanent failures and exhausted jobs dead-letter; expired work cancels without sending; absent, disabled, or unverified configuration defers without consuming a delivery attempt.
- Stale worker locks are recovered after fifteen minutes and the interrupted immutable attempt is closed with `EMAIL_WORKER_LOCK_EXPIRED` before a new attempt begins.
- Resend's idempotency key is the stable outbox idempotency key, so a provider acceptance followed by a process crash can be retried without intentionally creating a duplicate message.
- Permanent Resend settings reuse the provider-neutral, versioned AES-256-GCM credential store. API and webhook secrets never return to the browser; a webhook-only rotation merges with the active API key instead of discarding it.
- Live domain validation follows Resend's current OpenAPI contract: list domains to find the exact name, retrieve that domain by ID, then derive readiness from its SPF and DKIM record states. The list response is not assumed to contain DNS records.
- Save/rotate, disable/enable, revoke, and manual retry require current-password reauthentication. Validation is read-only; a test email requires a separate explicit confirmation. Tenant Admins cannot call Platform APIs.
- Test-email history is retained separately from domain-validation evidence, so a test does not erase DNS/SPF/DKIM status or incorrectly demote a valid configuration on a recipient-specific failure.

## Migration and rollback evidence

Before schema v15 was applied locally, a verified schema-v14 rollback copy was created and restored in isolation:

- Backup: `data/backups/pre-email-delivery-2026-09-20.db`
- Restore verification: `.tools/email-restore-verification/dialoggg.db`
- SHA-256 for both: `1FDE122216D46901498F2DADF530F7DE71B4681ED7D110346C306123001D9197`
- Latest migration: v14, checksum `10453485526b9b738e72a98fec364fdaceea08c6f5edae60d66f507d5739ed84`
- Integrity: `ok`
- Foreign-key violations: `0`

Migration v15 applied in the isolated final QA database in 15 ms. Its checksum is `aa2dc0024a644975d293354bacb0dea84f6ee34238f0c3c21145ca9e6f58bfc0`; the schema-v15 database reports integrity `ok` and zero foreign-key violations.

The migration adds delivery metadata to `outbox_job`, an immutable `email_delivery_attempt` ledger, ready/company-status indexes, an insert guard requiring expiry and redacted recipient-domain metadata, and an update guard that makes the encrypted payload and delivery identity immutable. Legacy invitation/reset rows receive conservative expiry and `legacy.invalid` display-domain metadata without decrypting or rewriting their payloads.

## Automated verification

All final local gates passed on the checkpoint tree:

- TypeScript: clean (`tsc --noEmit`)
- Unit/foundation/migration: 35/35
- Production-like API scenarios: 167/167
- Secure Integration Setup browser: 17/17
- Complete browser regression: 161/161 across eleven suites
- Next.js 15.5.24 production build: 65 generated pages/routes
- Standalone public/static packaging: passed
- Locked npm 10.8.2 production audit: 0 vulnerabilities
- Locked npm 10.8.2 full audit: 0 vulnerabilities

Focused engine coverage proves encryption/redaction, producer idempotency, provider receipt encryption, transient retry, manual retry, permanent dead-letter, expiry cancellation, configuration deferral without attempt consumption, stale-lock recovery, attempt-ledger closure, integrity, and foreign-key safety. Production-like scenarios additionally prove reauthentication, tenant-role denial, secret rotation and historical version monotonicity, webhook-only rotation preservation, read-only validation, test-send confirmation, safe recovery, disable/enable, and validation-evidence persistence.

## Visible browser QA

Visible Chrome QA used an isolated schema-v15 database, synthetic Platform Administrator, local production server, and fake provider mode. The administrator saved a synthetic API/webhook credential and sender, observed **Saved—verification required**, and confirmed that refresh returned only credential version/fingerprint with empty secret controls. Read-only validation reached **Valid** and displayed DNS ready, SPF verified, and DKIM verified after refresh.

The **Confirm and send one test** control stayed disabled until a synthetic recipient was entered and then presented the exact recipient in a JavaScript confirmation. The desktop browser bridge could display but not complete that native confirmation, so visible QA does not claim a manual send. The same fake-provider confirmed-send path completed in both the 17/17 focused browser suite and 167/167 scenario gate. The QA server and disposable database were stopped and removed.

## Requirement traceability

- `DG-AUT-003` and `FUP-015`: encrypted, single-use 72-hour invitation delivery with safe resend behavior.
- `DG-AUT-004`: encrypted one-hour password-reset delivery with expiry cancellation.
- `DG-AUT-005`: generic recovery responses and no plaintext bearer or recipient exposure in operational views.
- `DG-AUT-006`: provider adapter, verified sender/domain gate, idempotency, bounded retry/dead-letter behavior, redacted health, and audit evidence.
- `ADR-005`: transactional outbox prevents source mutations from depending on synchronous provider acceptance.
- `ADR-010`: Resend adapter and verified-domain workflow are implemented; live account, commercial/privacy, volume, and support approval remain external release gates.

## Controlled deployment requirements

This checkpoint is deployment order 12 after the live schema-v14 release. The authorized release must:

1. isolate the exact clean checkpoint commit, excluding unstaged/user-owned files and secrets;
2. verify the exact Railway workspace/project/environment/service and persistent `/data` volume;
3. create and verify a fresh production backup at schema v14 before migration;
4. deploy the exact archive, verify the automatic pre-migration backup, apply only migration v15, and confirm schema/readiness/integrity logs;
5. restart `dialoggg-web` and prove migration idempotency plus HTTP readiness;
6. verify existing sessions/data remain preserved and signed-out/API authorization remains fail-closed;
7. enter or rotate a real Resend credential only through the authenticated Platform page, after account/domain/data-processing approval, then perform one explicitly approved live recipient test; and
8. record deployment ID, image digest, backup identities, migration checksum, readiness/log results, live redaction/authorization/persistence results, and the remaining rollback position before cross-module hardening.

Provider webhooks and production worker scheduling/alerting remain operational release configuration. They are not prerequisites for the v15 schema migration itself and must not be represented as live until configured and verified.

## Production release evidence — 21 September 2026

The user authorized exactly commit `1c9fba8` and schema v14→v15. Railway backup `pre-v15-1c9fba8` (`78aea00b-0e02-4732-81c2-2c9d04b364e7`, external snapshot `vs_1789902997531_tsobpwcx5iw9hney`) was verified before mutation. The isolated archive SHA-256 was `C17E2D590F98B52D3A02FC04AF13756B4C6FA74A272C4821F0E64493F48C257E`.

Railway deployment `079691a9-89a8-4a9a-abf6-03b67065f5d9` reached `SUCCESS` with image digest `sha256:c0d2683e4dc8fdb7652d3f3cbaadcae265132127cb28abe27033cdd6e3544bb8`. Startup created and verified `/data/backups/pre-migration-v14-2026-09-21T04-09-59-392Z.db` with SHA-256 `80c5c872f465c629d2a578d5e52df5916b59c832f3a8794e53ecf5278d781f2e`, applied only migration 15 (`transactional_email_delivery`, checksum `aa2dc0024a644975d293354bacb0dea84f6ee34238f0c3c21145ca9e6f58bfc0`), and reported schema v15 current.

The authorized restart initially produced a transient Railway instance-start failure after the expected SIGTERM. A retry restored the same deployment and its replacement instance is `RUNNING`; restart logs report schema v15 already current, proving migration idempotency. `/api/health/ready` returned HTTP 200 with `{"status":"ready"}`. `/login` returned 200, `/projects` redirected to `/login`, `/api/v1/me` returned 401, and the Platform Resend settings API denied signed-out access. No stored credential was inspected and no authenticated production QA record or email was created.
