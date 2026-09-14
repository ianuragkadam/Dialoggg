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
