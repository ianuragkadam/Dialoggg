# Railway Deployment

## Approved production names

| Item | Name |
| --- | --- |
| Railway workspace | `Linkedin Automation` |
| Railway project | `dialoggg` |
| Railway service | `dialoggg-web` |
| Environment | `production` |
| Persistent volume | `dialoggg-data` mounted at `/data` |

## Required configuration

- Use a supported Node.js version from `package.json`.
- Build command: `npm run build`
- Start command: `npm start`
- Set `RAILWAY_VOLUME_MOUNT_PATH=/data`.
- Attach the persistent `dialoggg-data` volume at `/data` before serving traffic.
- Store both requirements tokens as Railway variables; never put their real values in source control.
- Keep one writable replica while SQLite is the application database.

## Release procedure

1. Confirm the exact project, service, environment, and volume names above.
2. Run `npm test` from a clean checkout.
3. Run `npm audit` and assess reachable production findings; do not apply forced upgrades without testing.
4. Create and verify a database backup using the backup runbook.
5. Deploy the reviewed commit to `dialoggg-web`.
6. Wait for the deployment to report success.
7. Smoke-test Login, Projects, the requirements links, authorization boundaries, and a read/write workflow.
8. Confirm the response count in the private review portal did not change unexpectedly.
9. Record the commit, Railway deployment identifier, tester, and result in the progress file.

Example commands after Railway CLI authentication and project linking:

```powershell
railway status
railway up --service dialoggg-web
railway logs --service dialoggg-web
```

## Rollback

Redeploy the last known-good commit. If the release changed data incompatibly, stop the service and follow [Backup and Restore](BACKUP_RESTORE.md). A code rollback alone must not be assumed to reverse a schema or data change.
