# DOC-11 — Security, Privacy, and Threat Model

**Version:** 0.1  
**Status:** Active draft; security acceptance required before release  
**Target:** Risk-based controls aligned with OWASP application-security practices

## Protected assets

- Password hashes, sessions, invitation/reset tokens.
- Global identities and company memberships.
- Company, client, Project, schedule, Resource, Event, and contact data.
- Questionnaire answers and bearer links.
- Google/Microsoft OAuth tokens and external identifiers.
- Common/Private folder links, especially Private mapping data.
- Audit logs, backups, deployment secrets, and source repository.

## Trust boundaries

Browser ↔ Next.js; page/Route Handler ↔ application/data layer; application ↔ database/volume; application/worker ↔ email/Google/Microsoft; Railway ↔ operators; production ↔ backup destination; support personnel ↔ tenant data.

## Threat register

| Threat | Example | Required controls | Verification |
| --- | --- | --- | --- |
| Broken tenant access | Change Project ID to another company | Active membership + company/object policy; 404; scoped query | Adversarial ID tests for every entity |
| External data leakage | Hidden UI still receives internal notes | Role-specific query/DTO | Response-body and log assertions |
| Privilege escalation | Admin promotes self to Owner | Explicit command policy; last-Owner rules; audit | Direct API tests |
| Session theft/fixation | Reuse old cookie after role change | Random opaque ID, Secure/HttpOnly/SameSite, rotate/revoke | Browser/API session tests |
| Credential abuse | Password spraying/enumeration | Generic response, rate limit/backoff, monitoring | Load/abuse tests |
| Token theft | OAuth/reset token in logs | Encrypt/hash, redact, short TTL, single use | Secret scanning/log review |
| CSRF | Cross-site Project delete | SameSite plus Origin/CSRF protection for writes | Cross-origin tests |
| XSS/content injection | Task name executes markup | Output encoding, CSP, validation | Security/browser tests |
| SQL injection | Search/ID concatenated into SQL | Prepared statements only | Static/dynamic tests |
| Integration replay/duplicate | Repeated sync creates copies | Idempotency mapping/outbox | Duplicate-job tests |
| Unsafe deletion | Project delete removes Microsoft folder | Explicit no-delete adapter boundary | Vendor-call assertion |
| Backup exposure | Database copied without access control | Encryption, restricted destination, retention | Restore/access review |
| Supply-chain vulnerability | Reachable dependency CVE | Audit, reachability, pinned lockfile, remediation SLA | Release security report |

## Authentication baseline

- Passwords use a reviewed adaptive hash and never appear in logs/source.
- Invitation token: random, hash stored, 72-hour expiry, single-use.
- Reset token: random, hash stored, one-hour expiry, single-use, generic request response.
- Session cookie: HttpOnly, Secure in production, SameSite policy, path, bounded expiry.
- Revoke sessions on deactivation, password reset, material role/membership change, and suspected compromise.
- Rate limit login, invitation resend, reset request/consume, and OAuth starts/callback failures.
- Public registration is removed/disabled server-side.

## Authorization baseline

DOC-04 is enforced on server pages, APIs, feeds, jobs, exports, and integration callbacks. Default deny. The current `isAdmin()` guard is not production-ready because it excludes Owner and is not resource/action aware.

## Data protection and privacy

- Inventory purpose, owner, sensitivity, retention, recipients, and deletion rule for every field.
- Minimize External/Client and Google payloads.
- Encrypt OAuth secrets/token envelopes and sensitive backup copies.
- Audit access-changing actions but do not record passwords, tokens, full vendor bodies, or unnecessary personal data.
- Define privacy contact, data-export/deletion process, legal retention, and breach communication with the client before launch.

## Security headers and browser controls

Retain anti-framing, MIME-sniffing, permission, and referrer headers. Add a tested Content Security Policy compatible with DHTMLX/FullCalendar assets. Review CORS; same-origin browser APIs should not enable broad origins. All production traffic uses HTTPS.

## Vulnerability management

- Triage every production dependency finding for affected version, reachable code, exploitability, severity, and fix/mitigation.
- Critical reachable vulnerabilities block release.
- High reachable vulnerabilities block release unless the security owner records a time-bounded exception and compensating control.
- Scan secrets and dependencies in CI; review monthly and before release.

## Incident minimum

Preserve evidence, rotate affected secrets, revoke sessions/tokens, contain access, restore service safely, notify the owner, document timeline/root cause, and create tracked corrective actions. See DOC-16.

## Release security gate

- Threat model reviewed after target architecture is fixed.
- All Must security requirements traced to passing tests.
- Tenant/External isolation tests pass.
- No known exposed secret.
- OAuth and reset/invitation flows pass replay/expiry tests.
- Dependency findings have disposition.
- Backup/restore security verified.
- Residual risks accepted by a named owner.

