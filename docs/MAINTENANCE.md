# Maintenance

## Every deployment

- Review the approved scope and terminology.
- Run `npm test` and assess `npm audit` output.
- Take a verified off-volume backup before data-affecting changes.
- Deploy a reviewed commit and record its commit and Railway deployment identifiers.
- Smoke-test authentication, tenant boundaries, Projects, and any changed workflow.

## Weekly

- Review failed deployments and application errors.
- Confirm the Railway service and persistent volume are healthy.
- Confirm scheduled backups completed and were copied off-volume.
- Review unusual authentication or questionnaire access patterns when logging is available.

## Monthly

- Review Node.js, Next.js, and direct dependency advisories.
- Apply compatible updates on a branch and run the complete suite.
- Review active users and remove access that is no longer required.
- Verify requirements tokens and deployment secrets are not present in source or logs.
- Check storage growth and backup retention.

## Quarterly

- Perform and document an isolated restore exercise.
- Review the permission matrix and route-level tenant isolation.
- Rotate sensitive bearer tokens and operational credentials according to client policy.
- Review this documentation against the real Railway configuration.

## Ownership handover checklist

- Transfer the Git remote to the approved client or team organization.
- Grant least-privilege Railway access to named maintainers.
- Transfer the domain and integration credentials through a password manager.
- Demonstrate deployment, rollback, backup, restore, and log access.
- Provide the last successful test report and known-issues list.
- Obtain written acceptance of source, infrastructure, documentation, and outstanding scope.
