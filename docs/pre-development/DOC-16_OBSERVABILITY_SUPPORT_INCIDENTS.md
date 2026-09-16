# DOC-16 — Observability, Support, and Incident Response

**Version:** 0.1  
**Status:** Draft

## Service signals

| Area | Metrics/events | Alert examples |
| --- | --- | --- |
| Availability | external HTTP availability, ready endpoint | repeated failure, certificate/domain issue |
| API | rate, p50/p95/p99, 4xx/5xx, request IDs | error or latency budget exceeded |
| Database | query latency, lock/busy count, WAL/size, integrity/volume capacity | repeated `SQLITE_BUSY`, low disk, failed checkpoint |
| Authentication | success/failure, lock/rate-limit, reset/invite events | abnormal failure spike, enumeration pattern |
| Authorization | denied action counts, cross-tenant attempts | repeated object substitution or platform misuse |
| Jobs | queued/running/retry/dead, oldest age | Google delivery over 2 minutes, retry exhaustion |
| Google | connection states, quota/rate limit, create/update/delete results | revoked token, quota spike, 24-hour failure |
| Microsoft | connection/root/folder resolution results | revoked connection, mapping failures |
| Backup | last success, checksum/integrity/upload, age | missing daily backup or upload failure |
| Deployment | release/migration/healthcheck result | failed healthcheck/migration/smoke test |

## Logging standard

Use structured logs with timestamp, environment, service/version, severity, request/job ID, safe actor/company/target surrogate identifiers, action, result, latency, and normalized error code.

Never log passwords, session IDs, invitation/reset tokens, OAuth access/refresh tokens, workshop bearer URLs, full cookies, authorization headers, full client records, Private folder identifiers/URLs, or raw vendor response bodies containing sensitive data.

## Health endpoints

- `/health/live`: process can serve; no sensitive details.
- `/health/ready`: schema compatible and critical local dependencies ready.
- Vendor health is exposed through internal metrics/status, not required to make the entire scheduling app unready.
- Railway's deploy-time healthcheck is supplemented with independent continuous uptime monitoring.

## Incident severity

| Severity | Examples | Target response |
| --- | --- | --- |
| SEV-0 | Confirmed cross-tenant leak, credential/token exposure, unrecoverable corruption | Immediate containment and owner notification |
| SEV-1 | Login/core scheduling unavailable, major data integrity risk, failed restore | Acknowledge within 30 minutes during support coverage |
| SEV-2 | Integration/backlog or material workflow degraded with workaround | Acknowledge within 4 business hours |
| SEV-3 | Minor defect, isolated visual/support issue | Normal backlog/service target |

Final coverage hours and contractual response targets require client/team approval.

## Incident workflow

1. Detect and create incident ID.
2. Classify severity and name Incident Commander.
3. Contain: disable affected feature/credential/access path without destroying evidence.
4. Preserve logs, deployment/config/migration IDs, database state, and timeline.
5. Diagnose using request/job IDs and known runbooks.
6. Recover through safe rollback, forward-fix, restore, reconnect, or queue replay.
7. Validate tenant isolation, data integrity, core journeys, and backlog health.
8. Communicate factual status and required client action.
9. Close only after monitoring is stable and owner accepts.
10. Complete post-incident review for SEV-0/1 and recurring SEV-2.

## Required playbooks

- Authentication failure spike or suspected credential attack.
- Cross-tenant/External data exposure.
- Database lock/corruption/volume-full event.
- Failed deployment or migration.
- Google revoked consent, quota limit, duplicate/orphan items, retry exhaustion.
- Microsoft revoked connection, missing folder, permission denial.
- Backup failure or failed restore drill.
- Secret or workshop-link disclosure.

## Post-incident review

Record impact, detection, timeline, root/contributing causes, what worked/failed, recovery, data/privacy assessment, Requirement/Test IDs, corrective actions with owner/due date, and whether documentation/alerts/tests changed. Avoid blame; require evidence.

