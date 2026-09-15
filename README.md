# Dialoggg

Dialoggg is a multi-company project scheduling and resource-coordination application. The current product opens at authentication, then takes signed-in users to Projects. Its working foundation includes Projects, Gantt tasks and links, Project and Master Calendars, Resources, user administration, and private requirements workshops with separate client and review links.

This repository is the source-of-truth handover package for the application. Product behavior still awaiting client decisions is identified in the project progress and security documentation; it is not presented here as complete.

## Quick start

Requirements: Node.js 22.22.2 or newer in the Node 22/24 release lines, plus npm 10.8.2.

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open <http://localhost:3030>. Create the first company and Admin through the Register screen. Local SQLite data is written to `data/dialoggg.db` unless `RAILWAY_VOLUME_MOUNT_PATH` is set.

## Verification

```powershell
npm test
```

The default test command runs the unit/foundation checks, a production build, and the isolated end-to-end scenario suite. See [Testing](docs/TESTING.md).

## Operations

- [Architecture](docs/ARCHITECTURE.md)
- [Local setup](docs/SETUP.md)
- [Railway deployment](docs/DEPLOYMENT.md)
- [Backup and restore](docs/BACKUP_RESTORE.md)
- [Security](docs/SECURITY.md)
- [Maintenance](docs/MAINTENANCE.md)
- [Contributing](CONTRIBUTING.md)

The repository-level delivery boundary is recorded in [Product Status](docs/PRODUCT_STATUS.md). The detailed working log remains in the separate project progress file maintained with the client documents.
