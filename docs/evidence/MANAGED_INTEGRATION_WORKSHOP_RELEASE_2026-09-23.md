# Managed Integration Workshop Production Release — 23 September 2026

## Outcome

Commit `571036a` adds separate stable, revocable managed bearers for Scott's writable Secure Integration Setup workshop and the team's read-only review page. Both remain URL-fragment bearers, exchange for short-lived sessions through a same-origin POST, and are stored only as SHA-256 invitation hashes in SQLite. The deployment secrets remain separate, must differ, and can be rotated to revoke the previous managed links. No raw token is recorded in this evidence.

## Local gate

- TypeScript passed.
- Unit/foundation/migration/configuration/security checks passed 42/42.
- Focused Chrome Integration Setup checks passed 18/18, including managed-link exchange without administrator issuance, encrypted-at-rest credential storage, CSRF/origin denial, provider validation, OAuth simulation, explicit Resend test-send confirmation, review redaction, and phone/keyboard behavior.
- The 65-page production build and standalone preparation passed.
- The clean release archive tree matched commit `571036a`; archive SHA-256 was `44CE0B566DF0CB65350B3E92E87B629CF7BFD94884728ADA002C3872B9344C00`.

## Controlled production release

- Target reverified: workspace `Linkedin Automation`, project `dialoggg`, environment `production`, service `dialoggg-web`, volume `dialoggg-data` at `/data`.
- Fresh Railway backup `pre-managed-workshop-571036a` is backup `191bdd10-a825-41dc-8aba-b248ba8b7864`, external snapshot `vs_1790139049397_9h4vs90vevta14wv`, referencing 1060 MB with no expiry.
- The two high-entropy managed tokens were installed through standard input with deployment triggering disabled. Their values were neither printed nor written to a repository file.
- Exact clean commit `571036a` was deployed as `fc4ecbd5-4298-4548-bef2-8b966094f537`; Railway reports `SUCCESS` / `RUNNING` with image digest `sha256:b28aac8b9face89abee2c748b9af3f8509fe36381af2a038d51acf02bca45c1c`.
- Startup reported database schema v15 current and Next.js ready. `/api/health/ready` returned HTTP 200 with private/no-store and HSTS headers. The persistent volume remained `READY` at 1060.773888 MB.

## Live security smoke

Production enforces canonical `APP_BASE_URL` origin `https://bytehype.ink`. A Railway-domain exchange was correctly rejected with `ORIGIN_REJECTED`; the distributable links were therefore rebuilt on the canonical origin. On that origin both managed links passed HTTP 200 token exchange, HTTP 200 status-only snapshot, three-provider scope, raw-token absence, and HTTP 200 sign-out. Both public pages returned HTTP 200 with private/no-store caching while direct signed-out workshop and review API access returned HTTP 401. No HTTP 5xx was observed for the new deployment during verification.

Scott's link and the separate internal review link were placed on the user's Windows clipboard without being emitted to command output. The internal link must not be sent to Scott; neither link belongs in tickets, source control, chat logs, or screenshots.
