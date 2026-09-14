# Contributing to Dialoggg

## Workflow

1. Create a focused branch from `main`.
2. Keep product terminology aligned with `src/lib/product-language.ts` and the approved requirements.
3. Add or update tests for every behavior change.
4. Run `npm test` before requesting review.
5. Describe database, environment-variable, deployment, and rollback effects in the change request.

Do not commit `.env` files, production tokens, SQLite databases, backups, logs, or generated build output. Do not add removed features or settle an unanswered product decision without recording the client-approved requirement.

## Commit guidance

Use short imperative subjects, such as `Add resource conflict validation`. Keep unrelated changes in separate commits so that review and rollback remain practical.

## Database changes

Schema additions must be safe for both new and existing databases. Add an isolated test, document the migration, take a verified production backup before deployment, and provide a rollback procedure.
