# Local Setup

## Prerequisites

- Node.js 22.22.2 or newer in the Node 22/24 release lines
- npm 10.8.2 (declared in `package.json`)
- Windows PowerShell, macOS Terminal, or a POSIX shell

## Install and run

```powershell
git clone <approved-repository-url>
Set-Location dialoggg
Copy-Item .env.example .env.local
npm install
npm run dev
```

Visit <http://localhost:3030>. Run the migration command before first startup, then provision a local Platform Administrator/company through the approved administrative workflow or isolated test fixtures. Public self-registration is disabled; do not use shared or production credentials for local development.

```powershell
npm run db:migrate
```

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | Local/server port; defaults to the platform value or 3030 for development |
| `RAILWAY_VOLUME_MOUNT_PATH` | Production | Directory containing `dialoggg.db`; `/data` on Railway |
| `APP_BASE_URL` | Production | Canonical HTTPS origin used to derive exact OAuth callback URIs and one-time private links |
| `APP_ENCRYPTION_KEY` | Production | Base64 encoding of exactly 32 random bytes; root key for transactional-email and integration credential envelopes |
| `REQUIREMENTS_FORM_TOKEN` | Production workshop | Private client questionnaire bearer token |
| `REQUIREMENTS_REVIEW_TOKEN` | Production workshop | Separate internal review bearer token |
| `FOLLOW_UP_REQUIREMENTS_FORM_TOKEN` | Follow-up workshop | Private client bearer token for the 19 detailed follow-up questions |
| `FOLLOW_UP_REQUIREMENTS_REVIEW_TOKEN` | Follow-up workshop | Separate internal review bearer token for follow-up responses |

Generate different high-entropy values for the two tokens and store them only in the deployment secret manager. Restart the app after changing environment variables.

Google, Microsoft, and Resend setup values are entered through the scoped secure workshop and encrypted in the database; they are not copied into environment files. See [Secure Integration Setup Operations](INTEGRATION_SETUP_OPERATIONS.md). `INTEGRATION_PROVIDER_MODE=fake` is reserved for isolated automated tests and must never be configured in production.

## Production-like local check

```powershell
npm run build
npm start
```

Run `npm test` before handing a change to another developer or deploying it.

## Database upgrades

Before applying a new migration to an existing database, create and verify a rollback copy:

```powershell
npm run db:backup -- data/backups/pre-change.db
npm run db:migrate
```

Exercise `npm run db:restore -- <backup.db> --confirm` only against an explicitly isolated data directory during routine verification. Production restore is an incident/change-controlled operation. Schema v9 adds the [Resource Management invariants](evidence/RESOURCE_MANAGEMENT_CHECKPOINT_2026-09-19.md). Schema v10 adds the [Project lifecycle invariants](evidence/PROJECTS_LIFECYCLE_CHECKPOINT_2026-09-19.md), including durable audit history through permanent deletion. Schema v11 adds the [persistent Gantt and cascade invariants](evidence/GANTT_CASCADE_CHECKPOINT_2026-09-20.md); deploy it only after v7-v10 and a verified schema-v10 mounted-volume backup.
