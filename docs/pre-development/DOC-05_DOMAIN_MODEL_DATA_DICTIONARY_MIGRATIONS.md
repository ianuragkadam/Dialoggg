# DOC-05 — Domain Model, Data Dictionary, and Migration Plan

**Version:** 0.1  
**Status:** Architecture decision required  
**Current database:** SQLite through `better-sqlite3`, WAL enabled, one Railway volume at `/data`

## Research findings

The existing schema directly associates one `user` with one `company_id` and one `user_type`. Approved requirements instead require a globally unique identity with memberships in multiple companies and a role per membership. The schema contains useful Project, Task, dependency, Resource, Event, session, and questionnaire foundations but lacks invitation, reset, audit, recurrence, Template, Project Type, integration, job, and external-mapping entities.

SQLite WAL allows readers and a writer to operate concurrently, but still permits only one writer at a time. SQLite also requires foreign-key enforcement to be enabled per connection. The current application correctly enables WAL and `foreign_keys`, but concurrency, migration, and job behavior must be tested before deciding to retain SQLite for launch.

Official research: [SQLite WAL](https://www.sqlite.org/wal.html), [foreign keys](https://www.sqlite.org/foreignkeys.html), and [online backup](https://www.sqlite.org/backup.html).

## Target entity model

```text
identity 1─* company_membership *─1 company
company 1─* project 1─* task
company 1─* resource              task *─* resource
company 1─* project_type          task *─* task (dependency)
company 1─* project_template 1─* template_task
project 1─* event *─* resource
identity 1─* oauth_connection 1─* external_item_mapping
company/project 1─* microsoft_folder_mapping
identity/membership/company/project 1─* audit_event
```

## Core data dictionary

| Entity | Required keys/fields | Key rules |
| --- | --- | --- |
| `identity` | id, normalized_email, password_hash, first_name, last_name, status, created_at | Email globally unique; no company role here |
| `company` | id, name, time_zone, status, created_at, suspended_at | IANA time zone required; Active/Suspended |
| `company_membership` | id, identity_id, company_id, role, status, invited_at, accepted_at | Unique identity+company; role Owner/Admin/Employee/External |
| `invitation_token` | id, membership_id, token_hash, expires_at, used_at | Store hash only; 72-hour, single-use |
| `password_reset_token` | id, identity_id, token_hash, expires_at, used_at | Store hash only; one-hour, single-use |
| `session` | id_hash or opaque id, identity_id, active_company_id, expires_at, revoked_at | Revoke on sensitive changes; bounded lifetime |
| `project_type` | id, company_id, name, active/status | Case-insensitive unique per company; deletion blocked when used |
| `project` | id, company_id, project_type_id, name, status, dates, client/contact/address fields, external_gantt_enabled, version | End date derived; lifecycle timestamps preserved |
| `project_membership` | project_id, company_membership_id, assignment_kind/metadata | Drives External access and Internal team/folder/notifications |
| `resource_category` | id, company_id, code/name | Five fixed categories; no custom builder |
| `resource` | id, company_id, category_id, linked_membership_id, profile fields, status | At most one linked membership and reciprocal uniqueness |
| `task` | id, project_id, parent_id, name, type, start_date, duration_workdays, progress, color, order, version | Date-only; header dates derived; root protected |
| `task_dependency` | id, project_id, source_id, target_id, type, lag_workdays | Same Project; no self/cycle/duplicate tuple |
| `task_resource` | task_id, resource_id | Same company; resource active for new assignments |
| `project_template` | id, company_id, name, status, source_project_id, created_by | Case-insensitive unique active name per company |
| `template_task` | template_id, parent_ref, relative_start_offset, duration, category/color/dependency data | Relative working-day representation; no live Task IDs |
| `event_series` | id, company_id, project_id nullable, title, timing mode, zone, recurrence rule, end mode, visibility/push flags | One source definition; Master-only allowed |
| `event_exception` | id, series_id, occurrence_key, action, replacement fields | Supports this-occurrence edit/delete |
| `event_resource` | event/series id, resource_id | Conflicts evaluated per occurrence |
| `google_connection` | id, identity_id, encrypted tokens, calendar_id, state, timestamps | Personal, protected, never client-visible |
| `google_item_mapping` | connection_id, source_type/id/occurrence, google_event_id, payload_hash, sync_state | Unique idempotency tuple |
| `microsoft_connection` | id, company_id, tenant/site/drive/root IDs, encrypted tokens, state | Company scoped; stable identifiers |
| `project_folder_mapping` | project_id, kind, drive_id, item_id, web_url_encrypted/protected, state | Exactly one Common and one Private mapping |
| `outbox_job` | id, company_id, kind, idempotency_key, payload, attempts, next_attempt_at, status | Atomic with source change; supports retries |
| `audit_event` | id, occurred_at, actor ids, company/project, action, target, result, safe metadata | Append-only; no secrets or sensitive payload dump |

## Constraints and indexes

- Index every company ownership key and foreign key used in authorization joins.
- Unique normalized identity email.
- Unique `(identity_id, company_id)` membership.
- Partial/business constraint ensuring at least one active Owner must be enforced transactionally.
- Unique case-folded Project Type and Template name per company.
- Dependency source and target must belong to the same Project.
- Mapping idempotency keys must be unique.
- Use version columns for concurrent Project/Task edits where lost updates matter.

## Database decision record required

Evaluate two options with a production-like dataset and concurrent scenario:

1. **Retain SQLite for v1:** one application replica, serialized background writes, short transactions, WAL/checkpoint monitoring, verified volume/backup procedure.
2. **Move to managed PostgreSQL before backend expansion:** stronger multi-writer operation, conventional migrations/jobs, additional migration and operating cost.

Decision trigger: if expected concurrent writes, integration jobs, operational availability, or horizontal scaling cannot be met with one SQLite writer, select PostgreSQL before building the new model.

## Migration sequence

1. Back up and verify the live database.
2. Add new tables without replacing old identity fields.
3. Create one identity and one membership for each existing user; map `viewer` to Employee and preserve source values for audit.
4. Create active company context on sessions or require selection after login.
5. Update reads to the new model behind compatibility functions.
6. Update authorization and writes.
7. Migrate Project assignments to membership IDs.
8. Validate counts, uniqueness, orphan checks, role distribution, and login behavior.
9. Remove old columns only in a later release after rollback compatibility ends.

## Migration safety

- Every migration is versioned, repeat-safe where practical, and tested from the immediately prior production schema.
- Never perform a destructive migration during application module import.
- Schema migrations run once under an explicit deployment step or migration lock.
- Backward-incompatible migrations require maintenance window and rollback/forward-fix decision.
- Validate `PRAGMA integrity_check`, `foreign_key_check`, row counts, and critical queries.

## Open approvals

- SQLite versus PostgreSQL launch target.
- Audit retention period.
- Whether identity email changes require re-verification.
- Whether inactive Resource records may remain on future Template instantiation as unresolved placeholders.

