# DOC-14 — Deployment, Configuration, Secrets, and Migration Runbook

**Version:** 0.1  
**Status:** Draft  
**Production:** Railway workspace `Linkedin Automation`, project `dialoggg`, service `dialoggg-web`, environment `production`

## Environment policy

Use separate Local, Test/CI, UAT, and Production data and credentials. Vendor OAuth applications or redirect configurations may share ownership only when vendor rules permit, but production tokens and client data never enter lower environments.

## Configuration register

| Category | Examples | Storage rule |
| --- | --- | --- |
| Runtime | `NODE_ENV`, `PORT`, volume mount | Railway/config; non-secret values documented |
| Database | connection/path, migration version | Environment; never point tests at production |
| Sessions | cookie name/policy, encryption/signing keys if added | Secret manager/Railway variables |
| Email | API key, sender/domain | Secret manager; least privilege |
| Google | client ID/secret, redirect, encryption key | Secret manager; platform owned |
| Microsoft | tenant/client IDs, secret/certificate, redirect | Secret manager; ownership documented |
| Workshops | client/review bearer tokens | Secret variables; rotate if disclosed |
| Monitoring/backup | endpoints, keys, destination credentials | Secret manager |

Never record secret values in source, Markdown, tickets, logs, screenshots, or test fixtures.

## Pre-deployment checklist

1. Approved scope/change record and reviewed commit.
2. Requirements traceability updated.
3. CI/release suites pass; dependency/security findings dispositioned.
4. Migration tested against the previous production schema and representative data.
5. Verified off-volume backup created for data-affecting releases.
6. Exact Railway workspace/project/service/environment/volume confirmed.
7. Configuration diff reviewed without revealing values.
8. Rollback or forward-fix decision and operator prepared.
9. Maintenance/client communication sent when downtime is expected.

## Migration procedure

- Do not execute schema changes implicitly from parallel Next.js module initialization.
- Use a version table and explicit single-run migration command/lock.
- Refuse startup when application/schema compatibility is unsafe.
- Prefer additive expand-and-contract changes.
- Record migration ID, checksum, start/end time, result, and deployment ID.
- Validate integrity, foreign keys, row counts, identities/memberships, Projects, Tasks/links, and integration mappings.
- Destructive contract/removal occurs only after the rollback compatibility window and approval.

## Deployment procedure

1. Capture current deployment ID and health baseline.
2. Run the verified backup where required.
3. Apply migration in its approved phase.
4. Deploy the reviewed artifact/commit.
5. Require `/health/ready` to confirm process, schema compatibility, and critical dependency readiness without exposing detail.
6. Smoke-test Login, role boundaries, Projects, one read/write journey, changed module, and headers.
7. Confirm queue age/errors, database locks, volume capacity, and backup state.
8. Record deployment ID, commit, migrations, tester, results, and exceptions.

Railway deployment healthchecks gate activation but are not continuous monitoring. Volume-backed services can experience brief downtime because the volume cannot be attached to two active deployments simultaneously. See [Railway healthchecks](https://docs.railway.com/deployments/healthchecks).

## Rollback versus forward-fix

- Code/config-only defect with compatible schema: Railway rollback to known-good deployment.
- Additive schema with old code compatible: roll back code and leave additive schema.
- Incompatible/data transformation: stop writes and execute the tested database restore or forward-fix plan; do not assume image rollback reverses data.
- OAuth/secret issue: revoke/rotate affected credential and redeploy verified configuration.

Railway rollback restores the previous deployment image and custom variables but does not itself reverse persistent volume data: [Railway rollback guidance](https://docs.railway.com/guides/roll-back-bad-deploy).

## Production access

- Named least-privilege Railway maintainers only.
- Temporary SSH/key access requires explicit authorization, unique naming, recorded purpose, and immediate removal/verification after use.
- Direct database mutation is emergency/demo setup only; normal operations require audited application/admin workflows.
- Production data export requires owner approval and secure destination.

## Release record template

| Field | Value |
| --- | --- |
| Release/version | |
| Commit | |
| Railway deployment | |
| Migration IDs | |
| Backup/checksum | |
| CI/UAT evidence | |
| Operator/approver | |
| Start/end | |
| Smoke result | |
| Rollback point | |
| Known exceptions | |

