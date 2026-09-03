# OKU+ 8I-5 — Real Staging Smoke Test

Date: 2026-09-03  
Current result: **NOT RUN / BLOCKED** because no real staging URL, service, database, or GitHub remote is available.

This checklist is for the future Render staging environment only. It does not authorize production work.

## Preconditions

Do not start this checklist until all of the following are available:

- authorized GitHub remote and agreed staging branch;
- Render staging service and private staging Postgres in the same intended region;
- provider-managed staging secrets, with no values placed in git or logs;
- staging URL and exact CORS origin;
- synthetic test users/tenants only;
- iyzico sandbox credentials only, if provider E2E is explicitly authorized.

## Endpoint and transport checks

| Check              | Command/action                                            | Expected                                                                                        |
| ------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Liveness           | `GET https://<staging-host>/health`                       | HTTP 200; no DB or secret details.                                                              |
| DB health          | `GET https://<staging-host>/health/db`                    | HTTP 200 with successful DB check.                                                              |
| Readiness          | `GET https://<staging-host>/ready`                        | HTTP 200 only when DB and migration state are ready.                                            |
| Dependency failure | Temporarily use an isolated diagnostic condition, if safe | `/ready` is not 200 when its DB dependency is unavailable; restore normal state immediately.    |
| HTTPS              | Open `http://<staging-host>/health`                       | Redirects to HTTPS; no certificate warning.                                                     |
| CORS               | Request with exact staging origin and an unrelated origin | Exact origin allowed; unrelated/wildcard origin rejected.                                       |
| Headers            | Inspect response headers                                  | CSP/security headers/HSTS behavior matches staging policy; no generic error detail leakage.     |
| Rate limit         | Use a bounded synthetic request burst                     | Limit is enforced without taking the service down; record whether the limiter is process-local. |

## Authentication and session checks

Use a synthetic staging account only:

1. Sign up a new synthetic account.
2. Log in and verify `/auth/me`.
3. Refresh and verify rotation/expiry behavior.
4. Log out and verify the token cannot be reused.
5. Verify wrong/expired credentials return generic errors and do not expose secrets or PII.

Do not use any production user, production token, production callback, or production secret.

## Learning journey

With synthetic student/tenant data, verify:

```text
login
  -> onboarding
  -> personal tenant
  -> learning path
  -> exercise
  -> question
  -> completion
  -> XP
  -> streak
  -> progress
```

Record request IDs and redacted response status only. Do not export access/refresh tokens or personal data into evidence.

## Tenant isolation

Create synthetic Personal A, Personal B, and Organization contexts. Verify that:

- Personal A cannot read or mutate Personal B’s progress, entitlement, checkout, subscription, or payment resources;
- an organization context cannot access personal billing resources;
- cross-tenant IDs return the documented 403/404 behavior;
- admin/support paths do not bypass intended tenant checks accidentally.

Any cross-tenant success is a hard **FAIL** and staging traffic/testing must stop for investigation.

## Billing and curriculum

- Premium UI and billing account management may be checked with synthetic/test state.
- Subscription state must be synthetic or test-only.
- iyzico is sandbox-only. If sandbox credentials are absent, record provider E2E as `NOT RUN`.
- No real charge, capture, refund, cancellation against a real account, or production callback is allowed.
- Do not load or publish a production catalog. Use only the verified test curriculum pack if needed.
- Keep the 8G-9B production catalog blocker open until its separate evidence exists.

## Logs and database evidence

Inspect Render logs for startup, migration, health, and error events. The following must not appear:

- password, access token, refresh token, JWT, API/secret key, webhook secret;
- card data or raw payment credentials;
- full database connection strings;
- unnecessary PII.

After migration, collect redacted staging identity/fingerprint evidence:

```text
environment=STAGING
database=<staging database name only>
schema=public
schemaHash=<hash>
liveSchemaHash=<hash>
migrationManifestHash=<hash>
combinedFingerprint=<hash different from TEST>
productionWrite=NO
```

Confirm 14/14 migrations, no pending/failed migration, and matching deploy commit. Never place a full connection string in the report.

## CI, backup, rollback, and mobile web

- Confirm the hosted GitHub workflow passes install, lint, test, typecheck, and build.
- Confirm the staging database’s actual backup/PITR capability and retention in the Render account.
- If permitted, restore a synthetic staging backup into an isolated scratch DB and rerun migration/health/smoke checks.
- Confirm Render app rollback to a previous successful deployment; do not assume database rollback is automatic.
- On a real phone using Chrome, open the HTTPS staging URL and verify login, onboarding, learning, exercise, progress, and billing UI. This is a mobile-browser test, not a native app test.

## Current execution result

All real staging checks above are **NOT RUN** because the preconditions are not met. Local baseline checks and TEST database evidence are recorded in [`STAGING_DEPLOYMENT_EVIDENCE_8I5.md`](STAGING_DEPLOYMENT_EVIDENCE_8I5.md) and the final report.
