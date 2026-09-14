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

Visit <http://localhost:3030>. A fresh database is initialized automatically. Register the first company and Admin through the application; do not use shared or production credentials for local development.

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | Local/server port; defaults to the platform value or 3030 for development |
| `RAILWAY_VOLUME_MOUNT_PATH` | Production | Directory containing `dialoggg.db`; `/data` on Railway |
| `REQUIREMENTS_FORM_TOKEN` | Production workshop | Private client questionnaire bearer token |
| `REQUIREMENTS_REVIEW_TOKEN` | Production workshop | Separate internal review bearer token |

Generate different high-entropy values for the two tokens and store them only in the deployment secret manager. Restart the app after changing environment variables.

## Production-like local check

```powershell
npm run build
npm start
```

Run `npm test` before handing a change to another developer or deploying it.
