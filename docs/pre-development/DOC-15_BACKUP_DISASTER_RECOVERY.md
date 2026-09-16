# DOC-15 — Backup, Disaster Recovery, and Business Continuity

**Version:** 0.1  
**Status:** Partial implementation; operating destination/automation pending  
**Approved direction:** Daily backups, 30-day retention, quarterly restore exercise, four-hour restore target

## Scope of protected state

- Primary application database and migration metadata.
- Audit records, invitations/sessions where appropriate, questionnaire data, integration connections/mappings, and job state.
- Deployment/configuration inventory and encrypted secret-recovery procedure; secrets are not copied into this document.
- Source repository and release artifacts.
- Microsoft/Google external content is not backed up by Dialoggg; only Dialoggg mappings/state are included.

## Objectives

| Objective | Target/status |
| --- | --- |
| Backup frequency | Daily plus pre-migration/pre-destructive-change |
| Retention | 30 days minimum |
| RTO | 4 hours |
| RPO | Proposed 24 hours; owner must approve or tighten |
| Restore exercise | Quarterly and before major data-platform migration |
| Backup location | Encrypted, access-controlled, outside the Railway volume |

## Backup design

- Use SQLite's online backup facility rather than copying a live database file without coordinating WAL state. SQLite documents that its online backup API can copy a live database while other access continues: [SQLite backup API](https://www.sqlite.org/backup.html).
- Existing `npm run db:backup` creates a timestamped backup and runs integrity checking.
- Compute and record a cryptographic checksum, source environment, application/schema version, record counts, operator/job ID, destination, and retention expiry.
- Copy the verified result off the `dialoggg-data` volume; a same-volume copy does not protect against volume loss.
- Alert when the backup, integrity check, checksum, upload, or retention cleanup fails.

### PostgreSQL target path

If ADR-004 is approved, replace the SQLite-specific production procedure with three layers: scheduled Railway volume backups for routine recovery, point-in-time recovery for incidents between snapshots, and encrypted portable `pg_dump` copies outside the project/provider boundary. Railway notes that deleting a volume also deletes its volume backups, so logical offsite dumps remain necessary. Restore drills must test `pg_restore`, migration compatibility, application smoke tests, and measured RPO/RTO. See [Railway PostgreSQL backup and restore](https://docs.railway.com/guides/postgres-backups-restores).

## Restore procedure

1. Declare incident/maintenance and stop all application/job writers.
2. Identify the exact environment, recovery point, backup checksum, application/schema version, and approval.
3. Preserve the failed/current database as a restricted forensic/rollback copy where safe.
4. Restore into an isolated directory/environment first when time permits.
5. Verify checksum, SQLite integrity, foreign keys, migration version, and critical row counts.
6. Install the restored database with only one writer/service instance.
7. Start the compatible application release.
8. Test Login, company isolation, memberships, Projects, Gantt/tasks/links, calendars, questionnaire totals, and integration mapping health.
9. Reconcile/inspect pending external jobs before resuming workers.
10. Record actual RPO/RTO, result, data loss window, and acceptance.

For PostgreSQL, replace SQLite integrity/foreign-key commands with dump/restore validation, schema migration/version checks, constraint checks, row-count/business reconciliation, and application-level tests. The recovery record must identify whether the source was volume snapshot, PITR, or logical dump.

## Disaster scenarios

| Scenario | Recovery action |
| --- | --- |
| Bad deployment, no data change | Roll back deployment/config and smoke-test |
| Failed migration | Tested forward-fix or restore pre-migration backup |
| Accidental Project/User deletion | Restore to isolated environment; selectively recover only with approved tooling, otherwise full recovery decision |
| Corrupt SQLite/volume | Provision clean volume, restore verified off-volume backup, validate |
| Railway regional/service outage | Follow provider status; redeploy/restore to approved alternative only with owner authorization |
| OAuth token compromise | Revoke/rotate vendor credentials, invalidate connections, preserve source data |
| Ransomware/account compromise | Isolate access, rotate credentials, select clean recovery point, security incident process |

## Quarterly exercise evidence

- Exercise ID/date and participants.
- Backup chosen, age, checksum, and location.
- Clean target and application version.
- Start/finish times and measured RTO.
- Integrity/foreign-key and row-count results.
- Functional smoke/UAT subset.
- Integration/job reconciliation result.
- Problems, corrective actions, owners, and due dates.

## Required ownership decisions

- Off-volume provider/location and encryption-key owner.
- Backup operator and failure-alert recipient.
- Final RPO and whether more frequent/PITR-style protection is required.
- Authority to initiate a production restore.
- Retention/legal-hold exceptions and secure deletion.
