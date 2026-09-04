# OKU+

OKU+ is a Fastify API and static single-page web application backed by PostgreSQL and Prisma. The repository currently contains a local/test release baseline and a staging deployment foundation. No production environment is configured or approved.

## Prerequisites

- Node.js 20 or newer; the current local verification uses Node 24.
- npm with the committed `package-lock.json`.
- PostgreSQL 18 for the current local verification, or a compatible supported PostgreSQL version.
- Chrome only for the optional browser regression scripts.

## Local setup

From the repository root:

```powershell
npm ci
Copy-Item .env.example .env
```

Set a local PostgreSQL connection and a development JWT secret in `.env`. `.env` is ignored and must never be committed. A non-production local example is:

```text
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/oku_plus_test?schema=public"
JWT_SECRET="replace-with-a-local-secret-at-least-32-characters-long"
NODE_ENV="development"
```

For the RLS tests, configure a separate non-superuser connection in `RLS_TEST_DATABASE_URL`. The RLS role must exist in the same local TEST database with the grants required by [`test/rls-security.test.ts`](test/rls-security.test.ts). Do not point local commands at staging or production.

## Database and migrations

The verified local TEST identity is `127.0.0.1:5432/oku_plus_test`, schema `public`. Apply only versioned, forward-only Prisma migrations:

```powershell
npx prisma validate
npx prisma migrate deploy
npx prisma migrate status
```

Do not use `prisma db push`, `prisma migrate reset`, or destructive/down migrations against any shared environment. Never copy production data into TEST or staging.

## Quality gates

```powershell
npm run lint
npm run format:check
npm run typecheck
npm run build
npm test
```

The same core gates are defined in [`ci.yml`](.github/workflows/ci.yml), using an ephemeral PostgreSQL service. The workflow intentionally has no deployment job.

## Run the application

```powershell
npm run dev
```

The default local listener is `http://127.0.0.1:3000`. For a production-mode local check, provide an explicit non-default `JWT_SECRET` and exact `CORS_ORIGIN`; the application does not run migrations automatically at startup.

The readiness endpoints are:

- `GET /health` — process liveness;
- `GET /health/db` — database `SELECT 1` check;
- `GET /ready` — database and Prisma migration readiness.

## Browser and QA checks

Browser scripts use `BASE_URL` and, where needed, `CHROME_PATH`. They must use synthetic/test identities only. Examples:

```powershell
$env:BASE_URL = "http://127.0.0.1:3000"
npx tsx scripts/browser-8f-final-qa-test.ts
npx tsx scripts/browser-billing-lifecycle-test.ts
npx tsx scripts/browser-billing-account-ux-test.ts
```

Curriculum QA scripts require explicit environment and database variables; they do not fall back to an unspecified target. The production catalog gate remains blocked by 8G-9B.

## Environment variables

The application reads the following primary variables. Values belong in a local ignored `.env` or an authorized platform secret store, never in source or logs.

| Variable                                          | Purpose                                                                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                    | PostgreSQL/Prisma connection for the current environment.                                                               |
| `RLS_TEST_DATABASE_URL`                           | Separate non-superuser TEST connection for RLS verification.                                                            |
| `NODE_ENV`                                        | `development`, `test`, or `production`; production requires explicit secure values.                                     |
| `JWT_SECRET`                                      | JWT signing secret, at least 32 characters and unique per environment.                                                  |
| `AUTH_COOKIE_TRANSPORT`                           | Phase 1 web cookie transport activation: `off` by default; `on` enables cookies with mandatory CSRF on unsafe requests. |
| `AUTH_ORIGIN_ENFORCEMENT`                         | Phase 1 cookie-auth Origin guard: `off` by default, `on` for controlled rollout.                                        |
| `CORS_ORIGIN`                                     | Comma-separated exact HTTP(S) origins; wildcard is rejected.                                                            |
| `PILOT_MODE`, `PILOT_STUDENT_ACCESS`              | Local/TEST pilot controls; production pilot launch is disabled.                                                         |
| `GOOGLE_OIDC_CLIENT_IDS`, `APPLE_OIDC_CLIENT_IDS` | Optional OIDC audience/client ID lists.                                                                                 |
| `IYZICO_*`                                        | Sandbox-only billing configuration; credentials, plans, and HTTPS callback are required for provider E2E.               |
| `RATE_LIMIT_*` and `*_TIMEOUT_MS`                 | Request protection and finite timeout controls.                                                                         |
| `CURRICULUM_*`                                    | Explicit curriculum QA/seed targets and approvals; never use an implicit database target.                               |

Real provider credentials, private keys, passwords, tokens, full connection strings, and production values must not appear in the repository, CI output, browser artifacts, or reports.

## Staging preparation

The selected primary platform is Render. [`render.yaml`](render.yaml) defines only a protected `staging` environment with one web service and one private managed PostgreSQL service. It uses `npm ci && npm run build`, `npx prisma migrate deploy`, `npm start`, and `/ready`.

The staging foundation is configuration-only until an authorized Render account/project and staging resources are verified. Do not create staging or production resources from this repository without the separate readiness gates. Follow [`docs/STAGING_SETUP_8I4.md`](docs/STAGING_SETUP_8I4.md) and [`docs/STAGING_OPERATIONS_8I4.md`](docs/STAGING_OPERATIONS_8I4.md) after the provider account is verified.

## Release baseline and branch policy

`master` is the current release-baseline branch. Feature work may use short-lived `feature/*` branches and merge into `master` after the CI quality gates pass. A separate staging branch is not required until an authorized remote/team workflow demonstrates a need for it.

The verified Git remote is `origin` → `https://github.com/gokcekmustafa/okuplus.git`; `master` is protected by local no-force-push policy and pushes must follow the pre-push safety checklist. Remote and CI evidence is recorded in [`docs/GITHUB_REMOTE_CI_EVIDENCE_8I6A.md`](docs/GITHUB_REMOTE_CI_EVIDENCE_8I6A.md) and [`docs/STAGE_8I6A_FINAL_REPORT.md`](docs/STAGE_8I6A_FINAL_REPORT.md).

## Security and production status

Known security decisions and residual risks are documented in [`docs/SECURITY_HARDENING_8I2.md`](docs/SECURITY_HARDENING_8I2.md). In particular, browser bearer tokens currently use `localStorage`, CSP retains `unsafe-inline` for legacy assets, and the rate limiter is process-local; these require explicit risk treatment before production.

Current production status is **NO-GO**. There is no production service, production database, production secret, production catalog, production payment activation, or real customer data in scope. The three HIGH dependency advisories and open 8G-8/8G-9B/iyzico evidence gates must be resolved or explicitly accepted before any separately authorized production work.
