# OKU+ 8I-4 — Staging Setup

Status: configuration prepared; account-bound staging creation is blocked until an authorized staging platform account, repository integration, and staging database are supplied.

## Intended topology

```text
Git repository (master / release candidate)
                |
                v
Render project: oku-plus / environment: staging
        |                                  |
        v                                  v
oku-plus-staging-api                 oku-plus-staging-db
Fastify + static SPA                 private managed Postgres
        |
        v
staging HTTPS URL -> /health, /health/db, /ready
```

The Blueprint contains only a `staging` environment. It does not declare a production service or production database. The application runs with `NODE_ENV=production` inside staging so production-grade runtime defaults apply; this does not make the resource a production environment.

## Repository configuration

- [`render.yaml`](../render.yaml) is the staging-only Render Blueprint.
- [`ci.yml`](../.github/workflows/ci.yml) runs install, migration, lint, format check, typecheck, build, and tests against an ephemeral PostgreSQL service. It contains no deployment job.
- The service build is `npm ci && npm run build`.
- The migration command is `npx prisma migrate deploy` and is forward-only.
- The start command is `npm start` (`node dist/server.js`).
- The configured health path is `/ready`; `/health` and `/health/db` remain available for separate liveness/database checks.
- The Blueprint uses Frankfurt for both application and database because it is the nearest listed Render region to Turkey. Turkey/Istanbul is not assumed to be available.
- The Blueprint sets `autoDeployTrigger: off` until a repository connection and branch policy are intentionally configured.

## Required staging values

Set these only in the provider’s staging environment or secret store. Never put real values in git, issues, logs, screenshots, or the final report.

| Variable                                                              | Staging action                                                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                        | Supplied by the private staging Postgres binding in the Blueprint. Do not paste a production URL.                 |
| `JWT_SECRET`                                                          | Generate a unique staging secret; never reuse production.                                                         |
| `CORS_ORIGIN`                                                         | Set to the exact staging HTTPS origin after the provider URL is known. No wildcard.                               |
| `IYZICO_BASE_URL`                                                     | Keep `https://sandbox-api.iyzipay.com`.                                                                           |
| `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_MERCHANT_ID`           | Optional until an authorized iyzico sandbox account is available; values remain unset in this workspace.          |
| `IYZICO_SUBSCRIPTION_PLAN_MONTHLY`, `IYZICO_SUBSCRIPTION_PLAN_YEARLY` | Required only for sandbox checkout tests; use sandbox plan IDs only.                                              |
| `IYZICO_CHECKOUT_CALLBACK_URL`                                        | Exact staging HTTPS callback URL, only after the staging URL exists.                                              |
| `GOOGLE_OIDC_CLIENT_IDS`, Apple OIDC values                           | Not required for the foundation; configure only with staging/test credentials if social-login tests are in scope. |

The app’s environment schema rejects a production default JWT secret and requires explicit CORS configuration in production mode. The Blueprint leaves secret values as provider-managed placeholders (`sync: false`).

## Database separation and migrations

The three database identities are deliberately separate:

| Identity   | Allowed use                                                   | Current evidence                                                  |
| ---------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| TEST       | Local/CI QA database `oku_plus_test`                          | Verified; 14/14 migrations applied; no pending/failed migrations. |
| STAGING    | New Render managed Postgres bound only to the staging service | Not created; account/DB blocker.                                  |
| PRODUCTION | Future production-managed database                            | Not configured, not connected, not migrated, and out of scope.    |

Do not clone production data into staging. Use synthetic accounts/content and sandbox payment identities only. Apply Prisma migrations with `migrate deploy`; do not use `prisma db push` and do not edit an applied migration. Every schema change must add a new timestamped migration and be reviewed for backward compatibility with the currently deployed app.

## Account-bound creation checklist

An authorized operator can complete the following after providing the account/repository context:

1. Create or select the Render project and create the protected `staging` environment.
2. Connect the intended repository and select the agreed staging branch or manual deploy policy.
3. Apply [`render.yaml`](../render.yaml), confirming that exactly one web service and one staging Postgres are created.
4. Confirm the database is Frankfurt, private, and externally inaccessible under the selected policy.
5. Enter staging-only secrets through the platform UI/secret store; do not echo them in a shell or CI log.
6. Deploy the app and confirm migration output reports success without exposing `DATABASE_URL`.
7. Record the staging app URL, DB resource ID, deploy ID, commit SHA, migration status, health responses, and fingerprint in a restricted operations record.
8. Configure the exact staging CORS origin and sandbox callback URL, then redeploy.
9. Perform the staging smoke checklist in [`STAGING_OPERATIONS_8I4.md`](STAGING_OPERATIONS_8I4.md).

## HTTPS and endpoint checks

After a real staging URL exists, verify:

```text
GET https://<staging-host>/health     -> 200 and liveness payload
GET https://<staging-host>/health/db  -> 200 and database payload
GET https://<staging-host>/ready       -> 200 and readiness payload
HTTP  http://<staging-host>/...        -> provider redirect to HTTPS
```

The application must not be declared staging-ready from a local result alone. A real provider response, certificate, deploy ID, and matching commit are required for `STAGING: VERIFIED`.

## Current boundary

This setup is intentionally unbound. No platform account, GitHub remote, staging app, staging database, domain, staging secret, iyzico sandbox credential, or production resource was accessed or created during 8I-4.
