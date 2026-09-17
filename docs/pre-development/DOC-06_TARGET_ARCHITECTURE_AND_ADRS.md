# DOC-06 — Target Architecture and Architecture Decision Records

**Version:** 0.1  
**Status:** Architecture decision required

## Current architecture

- Next.js 15 App Router, React 19, and TypeScript in one deployable service.
- Route Handlers provide the HTTP API.
- `better-sqlite3` stores data on the Railway volume at `/data` with WAL, foreign keys, and a 30-second busy timeout.
- DHTMLX Gantt provides Project Plan rendering and interaction.
- FullCalendar provides calendar views.
- Cookie-backed opaque sessions are stored in the database.
- Railway `dialoggg-web` is the production service with one persistent volume.

## Target logical architecture

```text
Browser
  ↓ HTTPS
Next.js pages + Route Handlers
  ├─ Application services
  │   ├─ Authorization policy
  │   ├─ Project/schedule service
  │   ├─ Calendar/event service
  │   ├─ User/onboarding service
  │   └─ Integration orchestration
  ├─ Data access layer / DTO serializers
  ├─ Primary database
  ├─ Transactional outbox / job runner
  ├─ Transactional email provider
  ├─ Google Calendar API
  └─ Microsoft Graph

Operations: structured logs + metrics/alerts + backup destination + deployment healthcheck
```

## Architectural boundaries

- Pages and UI components never decide authorization alone.
- Route handlers validate input then call application services.
- Application services own transactions, policies, audit events, and outbox records.
- Data access is company-scoped by construction.
- Integration adapters translate internal commands into vendor APIs; domain logic never stores vendor response objects directly.
- Background jobs are idempotent and may be replayed.
- Role-specific DTOs prevent sensitive fields reaching unauthorized clients.

## Initial ADR register

| ADR | Decision | State | Rationale/next evidence |
| --- | --- | --- | --- |
| ADR-001 | Keep Next.js App Router monolith for v1 | Proposed accept | Current fit; one team/repo; avoid premature services |
| ADR-002 | Separate global identity from company membership | Accepted; implemented locally | Approved multi-company/per-membership role requirements; migrations 2–3 and authentication scenarios provide evidence |
| ADR-003 | Centralize authorization in server policy functions | Required | Current `isAdmin()` is insufficient and misclassifies Owner |
| ADR-004 | Migrate target backend to Railway PostgreSQL before new identity/membership implementation | Recommended; approval pending | Multi-company writes/jobs/recovery outweigh early migration cost; SQLite exception requires benchmark and explicit acceptance |
| ADR-005 | Use transactional outbox for email and external sync | Accepted; email path implemented locally | Prevent source commit without delivery record; encrypted payload, idempotent retry, and dead-letter behavior implemented for transactional email |
| ADR-006 | Dialoggg remains Google source of truth | Approved product decision | One-way sync requirement |
| ADR-007 | Store stable Microsoft IDs; do not manage permissions | Approved product decision | Links only; Microsoft authorization remains external |
| ADR-008 | Preserve DHTMLX Gantt component; isolate calculation engine | Proposed accept | Core original UX with testable deterministic rules |
| ADR-009 | Use date-only domain values for Tasks and zoned instants for timed Events | Proposed accept | Avoid device-zone shifts; preserve local Event time |
| ADR-010 | Use Resend for transactional invitations/resets | Selected for adapter; live/commercial approval pending | Adapter, templates, idempotency, and retry exist; verify domain/account ownership, data terms, support, pricing, region, and controlled live delivery before release |

## Email-provider R&D

Resend exposes per-send idempotency keys retained for 24 hours and signed webhooks that can be verified before processing. This aligns with single-use invitation/reset delivery, outbox retries, and duplicate prevention. Postmark is a credible alternative with mature transactional streams, suppressions, and verified webhook setup, but its official webhook guidance uses HTTPS plus Basic authentication/IP allowlisting rather than a native payload signature. On the current evidence, Resend is the simpler security/integration fit; final selection requires account ownership, sending-domain DNS, data-processing, volume, pricing, and support approval. Sources: [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Resend webhook verification](https://resend.com/docs/webhooks/ingester), and [Postmark webhooks](https://postmarkapp.com/developer/webhooks/webhooks-overview).

## Failure design

- Database unavailable/locked: return safe retryable errors; jobs back off; alert repeated lock/latency.
- Email unavailable: identity/membership transaction remains consistent; invitation remains pending and retryable.
- Google unavailable/rate-limited: source save succeeds; outbox retries with backoff for approved 24-hour window; health visible.
- Microsoft unavailable: Project remains usable; folder card shows connection/recovery state; no mapping is silently discarded.
- Deployment fails healthcheck: new deployment does not receive traffic where Railway permits; volume-backed deployment may still have brief downtime.
- Migration fails: stop promotion, preserve backup, use tested rollback or forward-fix plan.

## Railway implications

Railway healthchecks are deployment-time gates rather than continuous monitoring. A service with an attached volume cannot have two simultaneous deployments mounted to that volume, so brief deployment downtime is expected. Continuous uptime monitoring must therefore be external to the Railway deployment healthcheck. See [Railway healthchecks](https://docs.railway.com/deployments/healthchecks).

## Required diagrams before implementation approval

- System context and deployment diagram.
- Login/session/company-switch sequence.
- User invitation and reset sequence.
- Project/Task update transaction plus cascade/outbox sequence.
- Google sync sequence and failure/retry path.
- Microsoft connection/folder mapping sequence.
- Backup/restore and release migration sequence.

## Architecture review checklist

- Every component has an owner and trust boundary.
- Every external call has timeout, retry, idempotency, and observability behavior.
- Every write has authorization, validation, transaction, audit, and concurrency behavior.
- No secret or token enters browser state, logs, source, or audit metadata.
- The selected database supports the documented load and recovery objectives.
