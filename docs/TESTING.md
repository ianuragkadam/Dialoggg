# Testing

## Standard command

```powershell
npm test
```

The command runs three gates:

1. `npm run test:unit` uses the built-in Node.js test runner for naming policy, retired-module boundaries, security configuration, and a real SQLite backup verification.
2. `npm run build` performs the production Next.js build and TypeScript checks.
3. `npm run test:scenarios` starts the standalone production server with a temporary database and exercises authentication, tenant separation, role restrictions, Projects, tasks, links, resources, calendars, retired routes, and the private requirements workflow.

Scenario data is isolated in the operating system's temporary directory and removed after the run. Tests must never point `RAILWAY_VOLUME_MOUNT_PATH` at production.

## Change expectations

- Interface terminology: update the language test.
- API or permission behavior: add an authenticated scenario for allowed and denied roles.
- Database change: test a fresh database and migration from the previous schema.
- Gantt calculation: add focused dependency, lag, weekend, cascade, and cycle cases.
- Deployment/configuration change: build standalone output and smoke-test its headers and startup.

Before release, perform browser checks at desktop and narrow/mobile widths for Login, Projects, project tabs, Gantt, and calendar views. Record the command output and Railway deployment identifier in the progress file.

## Final release security and browser matrix

`tests/release-security.test.mjs` inventories all API routes and fails when a new read or mutation handler is added without the reviewed actor/session or origin/CSRF boundary. It also enforces the central non-cache policy and rejects forwarded-host/protocol trust anywhere in application source.

After a successful build and standalone packaging, run the release matrix with a Playwright package path:

```powershell
$env:DIALOGGG_PLAYWRIGHT_PATH = '<playwright-package-directory>'
node scripts/test-release-matrix-ui.mjs
```

The script uses an isolated migrated database and synthetic accounts. It exercises company and Platform Administration routes in installed Chrome and Edge at desktop (1440×1000) and phone (390×844) widths, checks HSTS, keyboard entry, page overflow, fatal responses, page errors, and console/server failures, then removes the temporary data. It never calls Railway, Google, Microsoft, or Resend.

## Project Types UI Playwright check

The UI-only Project Types module has a focused browser script at `scripts/test-project-types-ui.mjs`. It starts the built application against a temporary database, creates isolated test Users, and checks the complete Admin and Employee experience at desktop and mobile widths.

Install Playwright in the development environment or point `DIALOGGG_PLAYWRIGHT_PATH` to an existing Playwright package directory, then run:

```powershell
node scripts/test-project-types-ui.mjs
```

The check never points at the production database and removes its temporary database after completion.

## Project Templates UI Playwright check

The Project Templates UI has a focused browser script at `scripts/test-project-templates-ui.mjs`. It verifies the Template Library, search, rename validation, unsaved-change protection, delete confirmation, Template details, save-from-Project workflow, start-from-Template confirmation, keyboard Escape, responsive overflow, role restriction, and signed-out routing.

With Playwright installed or `DIALOGGG_PLAYWRIGHT_PATH` set, run:

```powershell
node scripts/test-project-templates-ui.mjs
```

The script creates only temporary local Users and data and removes its database after completion. It does not call production APIs or modify the existing Gantt.

## Company Administration UI Playwright check

The Company Administration UI has a focused browser script at `scripts/test-company-admin-ui.mjs`. It verifies platform-only navigation, tenant denial, search/filter/no-results recovery, both lifecycle dialogs, metadata privacy, every provisioning validation, exact review values, keyboard Escape, non-persistent success, mobile overflow, signed-out routing, and unknown-role boundaries.

With Playwright installed or `DIALOGGG_PLAYWRIGHT_PATH` set, run:

```powershell
node scripts/test-company-admin-ui.mjs
```

The script creates a temporary local Platform Administrator and company Admin, promotes only the isolated test identity to the platform role, and deletes its temporary database afterward. It never reads or mutates production company records.

## Users, Roles, Invitations, and Project Access UI Playwright check

The User-management UI has a focused browser script at `scripts/test-users-access-ui.mjs`. It verifies the approved four Role labels, directory search/filter/no-results recovery, lifecycle impact and cancel paths, fixed Role boundaries, invitation validation and exact review, 72-hour security language, optional one-to-one Resource linkage, External/Client minimum Project access, exact assignment additions/removals, Owner/Admin locks, Employee restriction, signed-out redirects, keyboard Escape, non-persistent success states, and phone-width overflow.

With Playwright installed or `DIALOGGG_PLAYWRIGHT_PATH` set, run:

```powershell
node scripts/test-users-access-ui.mjs
```

The script creates only isolated local Admin and Employee test identities in a temporary database and removes the database after completion. It never mutates production Users, Project access, invitations, sessions, Resources, or company records.

## Resources UI Playwright check

The Resources UI has a focused browser script at `scripts/test-resources-ui.mjs`. It verifies CSRF and custom-Category rejection, cross-tenant and External denial, Task/Event assignment persistence, inactive assignment rejection, the five fixed Categories, search/filter recovery, persisted create/edit/User-link/lifecycle actions, duplicate validation, conflict acknowledgement, retained history, linked-User independence, Employee read-only access, signed-out redirects, and phone-width overflow.

With Playwright installed or `DIALOGGG_PLAYWRIGHT_PATH` set, run:

```powershell
node scripts/test-resources-ui.mjs
```

The script creates isolated local Admin, Employee, External, and second-company fixtures in a temporary database, performs real browser and API writes there, and removes the database after completion. It never reads or mutates production Resources, Users, assignments, calendars, feeds, or company records. The September 19 checkpoint passed 14/14 focused checks and 155/155 checks across all eleven UI suites.

## Projects UI Playwright check

The Projects UI has a focused browser script at `scripts/test-projects-ui.mjs`. It verifies directory filters, all required setup fields, real Template and User choices, keyboard Escape, persisted create/reload, original Project Plan presence, persisted complete/reopen/archive/restore, date-only Task preservation, unfinished-Task working-day shifts, completed-history protection, Owner-only exact-name deletion, Completed/Archived direct-edit guards, Employee company visibility, External assigned-only/safe-view boundaries, signed-out routing, and phone-width overflow.

With Playwright installed or `DIALOGGG_PLAYWRIGHT_PATH` set, run:

```powershell
node scripts/test-projects-ui.mjs
```

The script creates isolated local Admin, Owner, Employee, and External/Client identities plus temporary Projects/Tasks, performs real writes only in that temporary database, and removes it afterward. It never mutates production Projects, Tasks, calendars, Google items, Microsoft links, Users, or assignments. The September 19 checkpoint passed 16/16 focused checks and 156/156 checks across all eleven UI suites.

## Persistent Project Plan / Gantt checks

`tests/gantt-engine.test.mjs` runs `scripts/test-gantt-engine.mts` against a migrated temporary database. It covers inclusive working days, independent weekends, FS/SS/FF/SF constraints, non-negative lag, multiple-predecessor latest constraint, earlier/later cascade, cycle rejection, linked drag, root/Header roll-ups, protected deletion, atomic Resource assignment, Project End Date, and stale Plan/Task versions. `tests/migrations.test.mjs` separately proves the schema-v11 root, hierarchy, dependency, Resource, and completed-history triggers.

`scripts/test-project-plan-ui.mjs` performs a real Task write through the retained DHTMLX Gantt, reloads the page, and queries the isolated database to prove persistence. It also covers the scheduling-reference states, Employee read-only access, phone layout, and signed-out routing. Run it with Playwright installed or `DIALOGGG_PLAYWRIGHT_PATH` set:

```powershell
node scripts/test-project-plan-ui.mjs
```

The production-like scenario suite also verifies CSRF/Role/tenant boundaries, Plan and Task concurrency, cascade/cycle behavior, External DTO reduction, and weekend-aware dates shared by Project/Master Calendar responses. The September 20 checkpoint passes 143/143 scenarios, 14/14 focused Project Plan browser checks, and 157/157 browser checks across all eleven UI suites.

## Persistent Events and Calendars checks

`tests/events-calendar.test.mjs` runs `scripts/test-events-calendar-engine.mts` against a migrated temporary database. It covers daily/weekly/monthly recurrence, count/date/open horizons, company-local DST behavior, occurrence replacement/cancellation, Resource conflicts and acknowledgements, soft-deleted history, tenant/Role boundaries, and optimistic concurrency. `tests/migrations.test.mjs` separately proves schema-v12 Event-series, timing, recurrence, exception, Project, and Resource invariants.

`scripts/test-calendars-events-ui.mjs` performs real Event-series and exception writes through the retained Calendar UI, reloads the calendar, and queries its isolated database to prove persistence. It also covers live Project/Resource choices, Master-only versus Project rollup, all-day/timed validation, recurrence, conflict review, series versus occurrence changes, Employee read-only behavior, Task no-drag routing, phone layout, and signed-out routing. Run it with Playwright installed or `DIALOGGG_PLAYWRIGHT_PATH` set:

```powershell
node scripts/test-calendars-events-ui.mjs
```

The production-like scenario suite verifies invalid input, create/update/cancel, stale versions, Employee denial, Master-only isolation, durable conflict acknowledgement, shared Gantt Task dates, Project Type filters, tenant isolation, and company/Project/Resource feeds. The September 20 checkpoint passes 32/32 unit/foundation/migration tests, 149/149 scenarios, 16/16 focused Calendar/Event browser checks, and 158/158 browser checks across all eleven UI suites.

## Google Calendar delivery checks

`tests/migrations.test.mjs` proves the schema-v13 connection, single-use OAuth state, mapping, sync-run, index, trigger, and migration-history invariants. The production-like scenario suite saves a write-only encrypted Platform credential, performs the fake OAuth capability callback, authorizes a personal connection, proves encrypted refresh-token/calendar-ID storage and tenant isolation, reconciles eligible Task/Event items, reruns idempotently without duplicate mappings, replays state to prove single use, and verifies explicit retained disconnect behavior.

`scripts/test-google-calendar-ui.mjs` is a real browser suite against an isolated migrated database and the built standalone server. It covers Platform reauthentication, safe save, OAuth verification, secret rotation, disable/enable/retry/revoke, no plaintext in credential or audit rows, personal consent, CSRF rejection, Task/Event delivery, health, idempotent manual sync, safe payload exclusions, remove/retain choice gating, Employee isolation, mobile overflow, and signed-out routing. Run it with Playwright installed or `DIALOGGG_PLAYWRIGHT_PATH` set:

```powershell
node scripts/test-google-calendar-ui.mjs
```

The September 20 Google checkpoint passes 32/32 unit/foundation/migration tests, 153/153 scenarios, 14/14 focused Google browser checks, and 159/159 checks across all eleven UI suites. The suite uses `INTEGRATION_PROVIDER_MODE=fake` only in its temporary local server and never calls Google or production.

## Microsoft OneDrive / SharePoint delivery checks

`tests/migrations.test.mjs` proves the schema-v14 platform-provider, company connection, OAuth state, encrypted Project mapping, tenant/connection/Project trigger, index, and migration-history invariants. The production-like scenario suite verifies Platform reauthentication and credential redaction, OAuth/Graph capability gating, missing-scope/wrong-callback/outage recovery, credential rotation/disable/enable, company OAuth, opaque choices, root changes, retry-safe Common/Private create/link, tenant and Role boundaries, renamed/missing/permission states, disconnect, and lifecycle preservation.

`scripts/test-microsoft-storage-ui.mjs` is a real browser suite against an isolated migrated database and the built standalone server. It covers permanent Platform Microsoft settings, company OneDrive connection/root selection, Common/Private create/link/open, renamed display refresh, missing and permission recovery, assigned Employee/External Common-only access, CSRF, disconnect preservation, lifecycle handling, mobile overflow, signed-out routing, and browser-console cleanliness. Run it with Playwright installed or `DIALOGGG_PLAYWRIGHT_PATH` set:

```powershell
node scripts/test-microsoft-storage-ui.mjs
```

The September 20 Microsoft checkpoint passes 33/33 unit/foundation/migration tests, 164/164 scenarios, 16/16 focused Microsoft browser checks, and 160/160 checks across all eleven UI suites. The suite uses `INTEGRATION_PROVIDER_MODE=fake` only in its temporary local server and never calls Microsoft or production.
