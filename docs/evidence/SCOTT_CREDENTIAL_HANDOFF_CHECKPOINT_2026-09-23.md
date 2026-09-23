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

## Production release

- Focused guide commit: `5343007`; pushed to `origin/main`.
- Exact clean archive SHA-256: `3CC2FB788223A24C133F381C281087C7954370467A6A9F0C81466B00C5C943A4`.
- Reverified target: workspace `Linkedin Automation`, project `dialoggg`, environment `production`, service `dialoggg-web`, persistent volume `dialoggg-data` at `/data`.
- Fresh non-expiring backup: `pre-scott-handoff-5343007`, Railway backup `a62bb144-9df2-47a1-a84e-c71ad7db8cd5`, external snapshot `vs_1790142315685_omg44h8u027kg6fu`, referencing 1060 MB.
- Deployment: `fa6c6b1a-3f78-4bc9-a0cf-611cc3238752`, `SUCCESS` / `RUNNING`, image digest `sha256:9cdb7d1015627ad0fb57b56c475828d11b12621321aeae4c0a1f928d9a22765d`.
- Startup confirmed schema v15 current and Next.js ready. The readiness endpoint returned HTTP 200 with private/no-store and HSTS; `dialoggg-data` remained `READY` at 1060.773888 MB.
- Live 390×844 touch smoke confirmed the managed fragment was removed, no login was required, all three provider guides and the complete Scott handoff text were visible, secret fields were blank/password-protected, refresh preserved the short-lived session, a missing bearer failed closed, no raw bearer was rendered, and no HTTP 5xx was observed.

The existing managed Scott URL remains the handoff entry point; no link-token rotation was required for this schema-neutral guide update.
