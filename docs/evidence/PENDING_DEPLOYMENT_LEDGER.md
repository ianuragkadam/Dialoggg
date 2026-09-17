# Pending Deployment Ledger

Last updated: 17 September 2026

Production mutations are deferred until the user explicitly resumes deployment. The last known Railway deployment is `861b045c-d8ca-4e96-b0d0-b09f8587be36`; it has not been changed by the local checkpoints below. Railway CLI authentication must also be restored before deployment verification.

Apply checkpoints only in this dependency order:

| Order | Local checkpoint | Schema | Local verification | Deployment state |
| --- | --- | --- | --- | --- |
| 1 | Foundation/Auth plus fail-closed startup, deployment config gate, and Company Administration (`22512b8`, `4de537f`, `6303fb1`, `482f591`, `5c89614`) | Through v4 | Foundation evidence plus Company Administration evidence; unit/scenario/build and full browser regression passed at checkpoint | Pending; do not mutate Railway until explicitly authorized |
| 2 | Project Types (checkpoint commit containing this ledger) | v5 `project_type_invariants` | 23/23 unit, 126/126 scenarios, 149/149 browser, TypeScript/build/package; local rollback copy verified | Pending behind order 1 |
| 3 | Project Templates (checkpoint commit containing this update) | v6 `project_template_invariants` | 24/24 unit, 133/133 scenarios, 152/152 browser, TypeScript/build/package; schema-v5 rollback copy verified | Pending behind order 2 |
| 4 | Users, Roles, Invitations, and Project Access (checkpoint commit containing this update) | v7 `membership_access_invariants` | 25/25 unit, 136/136 scenarios, 142/142 browser, TypeScript/build/package; schema-v6 rollback copy verified | Pending behind order 3; requires lead-controlled deployment and live role smoke test |

For each future deployment:

1. Re-authenticate Railway and confirm the linked project/environment/service.
2. Inspect configuration without exposing secret values.
3. Obtain any specific destructive-risk authorization still required.
4. Create and verify a mounted-volume SQLite backup; record SHA-256, schema version, integrity, and foreign-key results.
5. Deploy dependency-ordered code and checksummed migrations.
6. Verify readiness and logs, then run live role-based browser checks and persistence-after-refresh checks.
7. Fix, redeploy, and retest until stable; record deployment ID and evidence before advancing to the next ledger row.

PostgreSQL is not part of these pending deployments unless separately approved.
