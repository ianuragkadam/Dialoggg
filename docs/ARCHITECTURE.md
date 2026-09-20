# Architecture

## Runtime

Dialoggg is a Next.js 15 App Router application using React 19 and TypeScript. Server-rendered pages and route handlers share one deployable service. Tailwind CSS supplies the interface styling. DHTMLX Gantt powers the project plan, and FullCalendar powers the calendar views.

## Data

`better-sqlite3` stores application data in `dialoggg.db`. The database directory is selected by `RAILWAY_VOLUME_MOUNT_PATH`; local development falls back to `./data`. Foreign keys are enabled and the connection uses write-ahead logging. Railway must mount the persistent `dialoggg-data` volume at `/data`.

The application is company-scoped: users, projects, and resources are associated with a company. Every authenticated data route must enforce both authentication and company ownership. Admin-only writes use the shared authorization guard.

## Major areas

- `src/app`: pages and HTTP route handlers
- `src/components`: shared and interactive UI
- `src/db`: SQLite initialization and schema
- `src/lib`: authentication, authorization, approved product language, and requirements definitions
- `scripts`: production packaging, startup, database operations, and scenario tests
- `tests`: fast foundation and policy regression tests

The requirements workshop and its review portal use long URL tokens as bearer secrets. Their answers live in the same persistent SQLite database as the prototype application.

## Deployment shape

Next.js creates standalone output. The post-build script copies public and static assets into that output, and the production starter binds to all interfaces for Railway. The current SQLite design requires one writable application replica. Horizontal scaling requires moving application state to a server database or implementing a different storage topology.

## Current boundary

The local source now includes persistent Role/tenant enforcement, Project Types, Templates, Resources, Projects, the original Gantt scheduling engine, Events/Calendars, personal one-way Google Calendar delivery, and Microsoft OneDrive for Business/SharePoint folder references. Microsoft uses one encrypted platform Entra application plus a separate company-scoped delegated connection; Project mappings store encrypted stable drive/item identifiers and never make Dialoggg the file store or permission authority.

These later checkpoints remain pending controlled, dependency-ordered production deployment and live provider smoke testing. Resend-backed email delivery, final release-wide permission review, worker scheduling/monitoring, and final mobile/browser UAT remain release work. See `docs/PRODUCT_STATUS.md` and the pending deployment ledger before planning changes.
