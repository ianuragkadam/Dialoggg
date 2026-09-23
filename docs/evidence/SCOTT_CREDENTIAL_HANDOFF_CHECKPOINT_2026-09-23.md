# Scott Credential Handoff Checkpoint — 2026-09-23

## Outcome

The private Integration Setup workshop now gives Scott a complete, provider-by-provider handoff for replacing temporary tester-owned Google, Microsoft, and Resend credentials without first revoking the working configuration. The change is schema-neutral and does not read, reveal, rotate, revoke, or otherwise mutate any stored production credential.

## Coverage

- Safe one-provider-at-a-time replacement and immediate verification sequence.
- Google Cloud project, Calendar API, Auth Platform branding/audience/data-access, Web OAuth client, exact callback, field mapping, and `calendar.app.created` least privilege.
- Microsoft Entra multi-tenant/single-tenant choice, Web redirect, delegated Graph permissions, client-secret **Value** distinction, field mapping, OAuth capability check, and separate company-storage authorization.
- Resend sending-subdomain/DNS verification, exact From-domain mapping, **Full access** key requirement for read-only domain/SPF/DKIM validation, approved-recipient test-send boundary, and explicit instruction to leave the webhook secret blank until a production endpoint exists.
- Official-source links embedded beside each guide:
  - <https://developers.google.com/workspace/calendar/api/quickstart/js>
  - <https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app?tabs=client-secret>
  - <https://resend.com/docs/dashboard/domains/introduction>
  - <https://resend.com/docs/dashboard/api-keys/introduction>

## Verification

- TypeScript `tsc --noEmit`: pass.
- Production Next.js build: pass, 65 generated routes.
- Standalone packaging: pass.
- Unit/foundation/migration/configuration/security suite: 42/42 pass.
- Production-like scenario suite: 170/170 pass.
- Integration Setup browser suite: 19/19 pass, including fragment redaction, CSRF/origin controls, encrypted replacement, PKCE/provider capability checks, read-only review, phone layout, and keyboard use.
- The first phone run found horizontal overflow from the long Google scope. The guide now wraps long code values; the repeated phone/keyboard check passes at 390px.

Dependency manifests and the lockfile did not change. The last authoritative locked full and production audits remain zero vulnerabilities; this copy/UI checkpoint adds no dependency.

## Release boundary

Commit and production deployment identifiers are recorded after the focused commit and fresh-backup deployment. The existing managed Scott URL remains the handoff entry point; no link-token rotation is required for this schema-neutral guide update.
