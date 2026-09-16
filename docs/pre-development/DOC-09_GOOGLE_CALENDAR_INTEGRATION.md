# DOC-09 — Google Calendar Integration Design

**Version:** 0.1  
**Status:** Vendor setup and technical spike required  
**Requirements:** `DG-GGL-001`–`DG-GGL-020`

## Product contract

- One-way from Dialoggg to Google; Google never modifies Dialoggg.
- Personal OAuth connection for each User.
- One platform-managed OAuth application serves all companies.
- Create/manage a secondary calendar named **Dialoggg** in each connected account.
- Internal delivery follows Task/Event Resource linked one-to-one to a User.
- External/Client delivery includes externally visible schedule items for assigned Projects.
- Titles contain Project Name and Task/Event Name; sensitive details are excluded.
- Changes normally arrive within two minutes; transient failures retry for up to 24 hours.
- Disconnect offers remove managed items or retain stale copies.

## Official API research

Google recommends requesting the narrowest possible OAuth scope and notes that public apps using sensitive scopes may require verification. The `calendar.app.created` scope is specifically intended for secondary calendars created by the app and their events, making it the recommended scope to validate first for this design. Broader calendar scope is not approved unless the proof of concept demonstrates a missing required operation. See [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth).

Google documents per-project and per-user quotas and recommends exponential backoff, traffic smoothing, and a separate test project. See [Calendar quotas](https://developers.google.com/workspace/calendar/api/guides/quota). All-day events use `start.date/end.date`; timed events use `dateTime`, per [Create events](https://developers.google.com/workspace/calendar/api/guides/create-events).

## Proposed OAuth flow

1. Authenticated User selects Connect.
2. Server creates short-lived, single-use signed state bound to identity/session and PKCE verifier.
3. Redirect to Google consent with minimal tested scope.
4. Callback validates state, issuer, redirect URI, and identity; exchanges code server-side.
5. Request offline access so background jobs can obtain access tokens while the User is absent; encrypt refresh/access token material at rest.
6. Create or locate the dedicated Dialoggg secondary calendar; store its stable ID.
7. Mark connection Healthy and enqueue reconciliation of currently eligible items.

Tokens and calendar IDs never appear in browser payloads or ordinary logs.

## Data and mapping

`google_connection`: identity, encrypted token envelope/key version, calendar ID, state, last success/error class, retry/reconciliation timestamps.

`google_item_mapping`: connection, source type/ID, occurrence key, Google event ID, last source version, payload hash, status. Unique key prevents duplicates.

Use a deterministic, Google-valid event ID derived from connection/source/occurrence plus a version-independent namespace when creating an item. Google explicitly permits client-supplied event IDs to prevent duplicate creation after an ambiguous failure. A `409 duplicate` triggers lookup/update, not creation with another random ID. See [Create events](https://developers.google.com/workspace/calendar/api/guides/create-events) and [Calendar error handling](https://developers.google.com/workspace/calendar/api/guides/errors).

## Payload rules

- Summary: `{Project Name} — {Task/Event Name}`.
- Description: managed-by-Dialoggg warning only plus approved non-sensitive context.
- Do not include address, client email/phone, internal notes, other Users, private Resource details, dependency/lag, or Microsoft links.
- Task: all-day event using inclusive domain dates translated to Google's exclusive end-date representation.
- Timed Event: dateTime with Company IANA time zone.
- Use Google default reminders; do not set conflicting overrides.

## Delivery pipeline

1. Source transaction writes an outbox command with source version and intended recipient.
2. Worker reads eligible connection and current source DTO.
3. Compute safe payload and hash.
4. Create/update/delete using mapping and idempotency key.
5. Persist result and health atomically where possible.
6. Retry 429/5xx/network errors with exponential backoff and jitter until 24-hour limit.
7. Treat remote 404 delete as successful cleanup; treat revoked consent as Connection Required.
8. Expose safe status and manual retry/reconnect paths.

## Reconciliation

Run reconciliation after connect/reconnect, deployment of mapping changes, company restoration, or detected drift. Compare eligible source set with mapping set; create missing, update stale, remove ineligible managed mappings. Never import arbitrary Google events.

After company restoration (`IC-002`), application access resumes first while Google delivery remains paused. An Owner/Admin reviews connection and queue health and explicitly selects Resume synchronization; reconciliation then runs before normal delivery.

## Recurrence decision

Use native Google recurrence for daily, weekly, and monthly series because the approved v1 operations are Entire series and This occurrence. Google supports RRULE series and individual instance exceptions identified by parent recurring event and original start. Maintain a parent-series mapping plus exception mappings where needed. Do not implement This and following; Google requires splitting a series for that operation, and it is explicitly outside the approved v1 scope. Validate all-day/timed DST behavior in the proof of concept. See [Recurring events](https://developers.google.com/workspace/calendar/api/guides/recurringevents).

## Security and privacy tests

- OAuth CSRF/state replay and account-binding failure.
- Token never present in client HTML/JSON/logs.
- Cross-user and cross-company mapping substitution.
- External safe-payload snapshots.
- Disconnect remove versus retain behavior.
- Revoked token, quota limit, retry exhaustion, duplicate job, missing remote event.

## Inputs required before build

- Client-owned Google Cloud project or agreed ownership.
- Authorized redirect domains and production domain.
- OAuth consent-screen identity, privacy/support URLs, and verification owner.
- Test Google accounts for all roles.
- Approval of minimal scope after spike.
