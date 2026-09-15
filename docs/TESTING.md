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
