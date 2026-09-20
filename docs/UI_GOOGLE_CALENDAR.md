# Google Calendar Delivery

Last verified: September 20, 2026

## Delivery boundary

Personal one-way Google Calendar delivery is implemented locally on schema v13. Dialoggg remains the source of truth and creates one secondary calendar named **Dialoggg** for each connected company membership; it never writes managed items to the User's primary Google calendar and never imports Google edits.

The production/Railway service has not been changed. Automated tests use the isolated fake provider transport; no real Google credential or account was used for the checkpoint.

## Routes and worker

| Route or command | Purpose |
| --- | --- |
| `/account` | Personal Account Settings summary and **Manage Google Calendar** entry |
| `/account/google-calendar` | Personal connection, health, retry/resume, safe preview, and disconnect controls |
| `/platform/integration-setup` | Permanent Platform Google OAuth application settings for the Platform Administrator |
| `/api/google-calendar` | Authenticated, company-scoped personal connection and reconciliation actions |
| `/api/v1/platform/integration-settings/google` | Platform-only write-only credential management and safe status reads |
| `/api/integrations/oauth/google/callback` | Platform and personal authorization-code callbacks with PKCE and single-use state |
| `npm run google:process` | Process due `google_calendar_reconcile` outbox jobs |

## Security and provider setup

- Platform settings store the Google client secret as a versioned AES-256-GCM envelope authenticated to its configuration/version context. The secret is never returned by an API or written to audit metadata.
- Saving, rotating, disabling, enabling, and revoking requires current Platform Administrator password reauthentication. The UI shows only safe configuration, fingerprint/version, verification time, callback URI, and health.
- A Platform configuration becomes **Valid** only after an authorization-code callback and a minimal create/read/delete Calendar capability check. The callback URI is derived from `APP_BASE_URL`; `APP_ENCRYPTION_KEY` remains a deployment secret.
- Personal authorization uses PKCE, a random state stored only as a hash, an encrypted verifier bound to the current auth session/membership, a ten-minute expiry, and atomic single-use consumption.
- The requested Google scope is only `https://www.googleapis.com/auth/calendar.app.created`, with offline access for refresh-token delivery.
- Personal refresh tokens and dedicated calendar IDs are encrypted with context-bound AES-256-GCM envelopes. Browser/API health responses contain no token, calendar ID, client secret, or provider payload.

## Delivery and reconciliation rules

- Owner, Admin, and Employee delivery is driven by the active Resource linked one-to-one to that membership. Assigned Tasks and Resource Events are eligible.
- External/Client delivery is limited to assigned Projects and Tasks/Events explicitly marked externally visible. Master-only internal Events are excluded.
- Safe payloads include `Project Name — Task/Event Name`, schedule/time-zone data, Google default reminders, a managed-by-Dialoggg warning, and a stable private source marker. Client email, phone, site address, internal notes, dependency details, private Resource data, and Microsoft links are excluded.
- Each occurrence is reconciled with one stable mapping and deterministic Google event ID. Unchanged payloads are skipped; updates reuse the mapping; loss of eligibility or source deletion removes the managed event; Google 404/410 cleanup is complete rather than retried.
- Task/Event/Resource/Project-assignment mutations enqueue reconciliation for every healthy company connection. A worker claims due jobs, refreshes access, reconciles create/update/delete operations, and records safe run counters and errors.
- Transient/network/429 failures use exponential backoff with jitter for up to 24 hours before dead-lettering. Paused company jobs remain deferred rather than becoming dead letters. Health reports pending/retry, dead-letter, managed-item, attempt, success, and reconciliation state.
- Company suspension pauses delivery. Restoration alone does not resume it; an Owner/Admin must explicitly review and resume, after which every healthy connection is reconciled.
- Disconnect requires an explicit choice. **Remove managed items** deletes the dedicated calendar where safe and clears mappings. **Retain existing items** preserves stale copies, marks mappings retained, revokes the local token envelope, and cancels queued work.

## Requirement traceability

| Requirement | Implemented coverage |
| --- | --- |
| `DG-GGL-001`–`DG-GGL-005` | One-way source-of-truth behavior, personal OAuth, platform configuration, dedicated calendar, and primary-calendar exclusion |
| `DG-GGL-006`–`DG-GGL-008` | Internal Resource linkage and External assigned/visible eligibility boundaries |
| `DG-GGL-009`, `DG-GGL-010`, `DG-GGL-016` | Safe titles/descriptions, excluded sensitive fields, managed warning, and default reminders |
| `DG-GGL-011`–`DG-GGL-015`, `DG-GGL-017` | Stable idempotent mappings, recurring occurrence delivery, company-zone payloads, deletion, and reassignment cleanup |
| `DG-GGL-018`, `DG-GGL-019` | Remove/retain disconnect choices and encrypted secret/token handling |
| `DG-GGL-020`, `FUP-016`, `IC-002` | Outbox target, retry/dead-letter health, safe monitoring, pause, and explicit resume |

## Verification

- 32/32 unit/foundation/migration checks
- 153/153 production-like API scenarios
- 14/14 focused Google browser checks
- 159/159 browser checks across all eleven UI suites
- TypeScript clean and the schema-v13 production build generated 62 pages
- Schema-v12 backup/restore verified before applying v13

Focused browser coverage is in `scripts/test-google-calendar-ui.mjs`. The production-like scenarios verify encrypted secrets/tokens, safe redaction, single-use state, tenant isolation, eligible delivery, idempotency, and retained disconnect mappings.
