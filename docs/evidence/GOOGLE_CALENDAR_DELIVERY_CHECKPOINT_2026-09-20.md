# Google Calendar Delivery Checkpoint Evidence — 20 September 2026

## Outcome

Google Calendar one-way delivery and permanent Platform Google OAuth application settings are complete locally. The checkpoint uses schema v13, `google_calendar_delivery`, and leaves Railway/production unchanged. Microsoft delivery work has not started.

Dialoggg remains the source of truth. Each connected company membership receives one secondary calendar named **Dialoggg**; managed items are never written to the primary calendar and Google edits are not imported.

## Delivered scope

- Permanent Platform Google settings at `/platform/integration-setup`, reusing the schema-v8 provider-neutral configuration and credential-version store.
- Write-only Google OAuth client secret with versioned, context-bound AES-256-GCM envelopes; safe configuration/status/fingerprint/version/timestamp reads only.
- Current-password reauthentication for save, rotation, disable, enable, and revoke; safe retry and provider-status handling.
- Callback URI derived from `APP_BASE_URL`; `APP_ENCRYPTION_KEY` remains outside SQLite and source control.
- Platform OAuth authorization-code verification with PKCE, session-bound single-use state, exact callback, least-privilege `calendar.app.created` scope, and temporary Calendar create/read/delete capability proof before the configuration becomes Valid.
- Personal OAuth authorization with PKCE, hashed single-use state, encrypted verifier, ten-minute expiry, offline consent, encrypted refresh token, and encrypted dedicated-calendar ID.
- Company/membership-scoped connections and tenant-safe eligibility: linked-Resource assignments for Owner/Admin/Employee, and assigned-Project plus external-visibility rules for External/Client.
- Safe Task/Event occurrence payloads with stable deterministic Google event IDs and unique source/occurrence mappings. Sensitive client, site, note, dependency, private Resource, and Microsoft-link fields are excluded.
- Create/update/delete reconciliation, unchanged-payload skipping, missing dedicated-calendar/managed-item recreation, token refresh, Google 404/410 cleanup, and retry-safe mapping reuse.
- Mutation hooks for Events/exceptions, Tasks/Resources, Projects/lifecycle, Resource lifecycle/linkage, and User Project assignments.
- Outbox worker command `npm run google:process`, exponential backoff with jitter, 24-hour transient retry window, dead-letter state, safe run counters/error codes, manual retry, and health summaries.
- Company suspension pause, restoration that remains paused, and explicit Owner/Admin resume of all healthy company connections even when the reviewing manager has no personal connection.
- Explicit disconnect choice: delete the dedicated calendar/mappings or retain stale managed copies; queued work is cancelled and the local refresh-token envelope is revoked.

## Migration and rollback evidence

Before applying v13 locally, a verified schema-v12 rollback copy was created:

- Path: `data/backups/pre-google-calendar-2026-09-20.db`
- SHA-256: `A2FEC700EB27E4720ACBAD5CFF92AD9E32F4C3B8ADC245E3A443C2AAF4E37D23`
- Integrity: `ok`
- Foreign-key violations: `0`

The restore command was exercised in `.tools/google-calendar-restore-verification`, reproduced the same SHA-256, and reopened at schema v12 with integrity `ok` and zero foreign-key violations.

Migration v13 completed locally in 11 ms. Its full checksum is `1e2ab249d75875607f873c09660dd71108926e02e5e0c70b0b52318bbb2af872`. The final database contains migration row 13, reports integrity `ok`, and has zero foreign-key violations.

The migration:

- upgrades legacy Google connections/mappings into company/membership-scoped rows and demotes legacy healthy connections to reconnect-required;
- adds `disabled_at` for provider control;
- adds User and Platform single-use OAuth state tables;
- adds connection/source/occurrence and Google-event uniqueness;
- adds sync-run health and supporting indexes; and
- enforces active company/membership scope plus immutable connection identity/company/membership.

## Automated verification

All gates passed on the final source tree:

- TypeScript: clean (`tsc --noEmit --incremental false`)
- Unit/foundation/migration: 32/32
- Production-like API scenarios: 153/153
- Focused Google browser: 14/14
- Complete browser regression: 159/159 across eleven suites
- Next.js 15.5.24 production build: 62 generated pages/routes
- Standalone public/static packaging: passed
- Locked npm 10.8.2 production audit: 0 vulnerabilities
- Locked npm 10.8.2 full audit: 0 vulnerabilities

The scenario suite proves Platform credential encryption/redaction and capability verification, personal single-use state, encrypted refresh-token/calendar-ID storage, tenant isolation, eligible delivery, stable idempotent mappings, manager-without-connection resume, and retained disconnect behavior. The focused browser suite additionally proves reauthentication, rotation, disable/enable/retry/revoke, CSRF rejection, consent gating, safe preview, manual health/sync, Employee isolation, mobile overflow, and signed-out routing.

## Visible browser QA

Visible Chrome QA used a separate schema-v13 database and the local standalone server at `127.0.0.1`. A Platform Administrator opened the permanent settings page, confirmed the derived callback and least-privilege explanation, saved a write-only fake credential, observed **Saved—verification required**, completed the fake OAuth capability callback, and observed **Valid** with a verification time.

A separate company Admin opened Account → Google Calendar, reviewed the one-way source-of-truth and delivery/health rules, accepted the explicit personal-consent gate, completed the isolated fake callback, and observed **Connected · healthy**. The safe Google item preview displayed the managed warning, company-zone time, default reminders, and the explicit excluded-data list. Chrome reported no console errors. The local QA server and database were then stopped and removed.

No real Google credential, Google account, provider calendar, Railway service, production variable, or production database was touched.

## Controlled deployment requirements

This checkpoint is deployment order 10, behind schema v7 through v12. A future authorized release must:

1. verify the exact Railway project/environment/service and configuration names without printing secret values;
2. create and verify a mounted-volume schema-v12 backup;
3. deploy dependency-ordered migrations through v13;
4. enter/rotate the real Google Web OAuth application through Platform settings and configure the displayed exact callback in Google Cloud;
5. complete a real Platform OAuth capability check and confirm only `calendar.app.created` is granted;
6. configure a supervised scheduler for `npm run google:process` and monitoring for pending/retry/dead jobs;
7. run live personal connect, Task/Event create/update/delete, Resource reassignment, disconnect remove/retain, company suspend/restore/resume, Role, and tenant smoke tests; and
8. record deployment ID, readiness/log evidence, live smoke results, and rollback position before advancing to Microsoft.

Recurring Event series are currently materialized as stable eligible occurrences within the bounded reconciliation horizon rather than written as one native Google RRULE. That behavior is deterministic and covered by the shared Event engine, but live Google recurrence behavior should still be included in the controlled smoke pass.
