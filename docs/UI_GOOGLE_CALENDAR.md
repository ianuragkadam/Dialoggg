# Google Calendar Integration UI Module

Last verified: September 15, 2026

## Delivery boundary

This is a UI-only review of personal Google Calendar connection, delivery rules, managed-item content, synchronization health, failure/retry states, restore/resume handling, and disconnect cleanup choices. No Google OAuth request, token, calendar, mapping, managed item, queue job, or production record is created or changed.

## Routes

| Route | Purpose |
| --- | --- |
| `/account` | Personal Account Settings summary and **Manage Google Calendar** entry |
| `/account/google-calendar` | Personal Google connection, schedule-delivery, health, and disconnect review |

## Requirement traceability

| Requirement | UI coverage |
| --- | --- |
| `DG-GGL-001`, `DG-GGL-002` | Prominent one-way Dialoggg → Google and Dialoggg-source-of-truth explanation. |
| `DG-GGL-003`, `DG-GGL-004` | Personal connect/reconnect/disconnect review and platform-wide OAuth application/company-isolation explanation. |
| `DG-GGL-005` | Dedicated managed calendar named **Dialoggg**; primary Google calendar explicitly excluded. |
| `DG-GGL-006`, `DG-GGL-007` | Internal delivery uses a Resource linked one-to-one to the User inside the company. |
| `DG-GGL-008` | External/Client delivery covers externally visible Project Tasks/Events and excludes Master-only internal Events. |
| `DG-GGL-009`, `DG-GGL-010` | Safe payload preview uses Project Name — Task/Event Name and a managed-by-Dialoggg warning; sensitive fields are listed as excluded. |
| `DG-GGL-011`–`DG-GGL-013` | Health rows show create/update/remove mapping outcomes and idempotent no-duplicate behavior. |
| `DG-GGL-014`, `DG-GGL-015` | Calendar module recurrence scope/end rules feed the Google design; preview shows company-time-zone timed delivery. |
| `DG-GGL-016` | Payload preview uses the User's Google default reminders. |
| `DG-GGL-017` | Resource reassignment explains removal from the old User and creation for the new User. |
| `DG-GGL-018` | Disconnect confirmation requires Remove managed items or Retain existing items, with stale-data warning. |
| `DG-GGL-019` | Security boundary states tokens are protected at rest and absent from browser code and logs. |
| `DG-GGL-020`, `FUP-016` | Normal two-minute target, actionable health, idempotency, and transient retry for up to 24 hours. |
| `IC-002` | Restored company remains paused until the User explicitly reviews health and chooses Resume. |

## Dialog and state inventory

1. Connected · healthy.
2. Action needed after revoked/invalid authorization.
3. Paused after company restoration.
4. Not connected.
5. Connect/Reconnect Google Calendar — personal scope, dedicated calendar purpose, and acknowledgement gate.
6. Disconnect Google Calendar? — remove/retain choices and stop-sync acknowledgement.
7. Resume Google synchronization? — connection-health checklist and explicit resume.
8. Safe Google item preview — title, description, timing, reminders, and excluded data.

## Deferred implementation

- Google Cloud OAuth application and consent-screen configuration.
- Encrypted refresh-token storage, rotation, revocation detection, and secret handling.
- Dedicated calendar creation and stable mapping IDs.
- Idempotent background queue, two-minute target, 24-hour retry, reconciliation, and monitoring.
- Task/Event/Resource/External eligibility listeners and recurring-event synchronization.
- Actual disconnect cleanup and retained-item behavior.

