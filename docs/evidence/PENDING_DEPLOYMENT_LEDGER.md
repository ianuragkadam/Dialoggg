# Pending Deployment Ledger

Last updated: 19 September 2026

The user resumed deployment on 17 September 2026. Checkpoints through Project Templates were released successfully as Railway deployment `0dab30fa-e3f5-4f9e-91f4-bb5bafef3635`. See `PRODUCTION_DEPLOYMENT_2026-09-17.md` for backup, migration, security, and live-smoke evidence.

Apply checkpoints only in this dependency order:

| Order | Local checkpoint | Schema | Local verification | Deployment state |
| --- | --- | --- | --- | --- |
| 1 | Foundation/Auth plus fail-closed startup, deployment config gate, and Company Administration (`22512b8`, `4de537f`, `6303fb1`, `482f591`, `5c89614`) | Through v4 | Foundation evidence plus Company Administration evidence; unit/scenario/build and full browser regression passed at checkpoint | Deployed in `0dab30fa-e3f5-4f9e-91f4-bb5bafef3635` |
| 2 | Project Types (`b2e4bc8`) | v5 `project_type_invariants` | 23/23 unit, 126/126 scenarios, 149/149 browser, TypeScript/build/package; local rollback copy verified | Deployed in `0dab30fa-e3f5-4f9e-91f4-bb5bafef3635` |
| 3 | Project Templates (`4a48fc9`) | v6 `project_template_invariants` | 24/24 unit, 133/133 scenarios, 152/152 browser, TypeScript/build/package; schema-v5 rollback copy verified | Deployed in `0dab30fa-e3f5-4f9e-91f4-bb5bafef3635` |
| 4 | Users, Roles, Invitations, and Project Access (`3638b03`) | v7 `membership_access_invariants` | 25/25 unit, 136/136 scenarios, 142/142 browser, TypeScript/build/package; schema-v6 rollback copy verified | Pending; requires lead-controlled deployment and live role smoke test |
| 5 | Secure Integration Setup Workshop (checkpoint commit containing this row) | v8 `secure_integration_setup_workshop` | 27/27 unit, 136/136 scenarios, 158/158 browser, TypeScript/build/standalone/package audits; schema-v7 rollback copy verified | Pending behind order 4; requires controlled deployment, access-boundary smoke test, then private link issuance |
| 6 | Resource Management (checkpoint commit containing this row) | v9 `resource_management_invariants` | 28/28 unit, 136/136 scenarios, 155/155 browser, TypeScript/build/standalone, production/full audits; schema-v8 rollback and isolated restore verified | Pending behind orders 4 and 5; requires controlled deployment plus live role, persistence, assignment, and lifecycle smoke tests |

For each future deployment:

1. Re-authenticate Railway and confirm the linked project/environment/service.
2. Inspect configuration without exposing secret values.
3. Obtain any specific destructive-risk authorization still required.
4. Create and verify a mounted-volume SQLite backup; record SHA-256, schema version, integrity, and foreign-key results.
5. Deploy dependency-ordered code and checksummed migrations.
6. Verify readiness and logs, then run live role-based browser checks and persistence-after-refresh checks.
7. Fix, redeploy, and retest until stable; record deployment ID and evidence before advancing to the next ledger row.

PostgreSQL is not part of these pending deployments unless separately approved.
