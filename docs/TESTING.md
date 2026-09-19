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
