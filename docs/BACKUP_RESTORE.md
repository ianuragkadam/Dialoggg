# Backup and Restore

SQLite data is production data. The Railway service must retain its `dialoggg-data` volume at `/data`, and backups must also be copied to storage outside that volume so a volume loss does not remove both the database and its backups.

## Create a verified backup

The application may remain running for the online SQLite backup operation:

```powershell
npm run db:backup
```

By default, the command writes a timestamped file beneath `<data-directory>/backups` and runs `PRAGMA integrity_check` on the result. An explicit destination can be supplied:

```powershell
npm run db:backup -- D:\secure-backups\dialoggg-2026-09-14.db
```

Copy verified production backups to encrypted, access-controlled storage outside Railway. Record the time, environment, file checksum, operator, and retention date.

## Restore

Restoration is intentionally explicit and must be performed during a maintenance window.

1. Stop the application and confirm no replica or other process is using the database.
2. Preserve the current volume and identify the exact verified backup.
3. Set `RAILWAY_VOLUME_MOUNT_PATH` to the target data directory.
4. Run the restore command with the required confirmation flag:

```powershell
npm run db:restore -- D:\secure-backups\dialoggg-2026-09-14.db --confirm
```

The script verifies the source, checkpoints the stopped live database, retains it as a timestamped `dialoggg-pre-restore-*.db` rollback copy, installs the replacement, and verifies the restored database.

5. Start one application replica.
6. Test Login, tenant access, Projects, and the requirements response totals.
7. Retain the pre-restore copy until the restored system has been formally accepted.

## Recovery exercise

At least quarterly, restore the newest production backup into an isolated non-production directory and run the smoke tests. A backup that has never been restored is not considered proven.
