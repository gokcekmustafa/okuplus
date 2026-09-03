# OKU+ 8I-5 — Staging Deployment Evidence

Date: 2026-09-03  
Status: **BLOCKED**  
Scope: real staging discovery and deployment evidence. Production is explicitly out of scope.

## Boundary

No production service, production database, production secret, production catalog, production payment, or real customer was accessed or changed. No credentials were guessed. Because a usable GitHub remote and Render account/resource are not available in this workspace, no real staging resource was created.

## Pre-check evidence

| Check                   | Result             | Evidence                                                                                                                                 |
| ----------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Render Blueprint        | PASS               | [`render.yaml`](../render.yaml) exists and declares only `staging`.                                                                      |
| CI workflow             | PASS               | [`ci.yml`](../.github/workflows/ci.yml) exists and has no deploy job.                                                                    |
| Docker/start/build      | PASS               | No Dockerfile/compose is required by the selected Render model; `npm ci && npm run build` and `npm start` are defined in `package.json`. |
| Environment matrix      | PASS               | [`ENVIRONMENT_MATRIX_8I1.md`](ENVIRONMENT_MATRIX_8I1.md) records TEST identity and staging/production unknown state.                     |
| Health endpoints        | PASS locally       | `/health`, `/health/db`, and `/ready` are implemented in `src/modules/health/routes.ts`.                                                 |
| Prisma migrations       | PASS in TEST       | 14 repository migrations found; TEST database is up to date with 14 applied.                                                             |
| Current branch          | INFO / BLOCKER     | `master`. No release branch was created.                                                                                                 |
| GitHub remote           | BLOCKED            | No git remotes are configured; `origin` is absent.                                                                                       |
| Worktree                | BLOCKED for deploy | `git status --porcelain` reports 18 entries; there is no clean, remotely connected deployable state.                                     |
| Render account/resource | BLOCKED            | No Render CLI is installed and no account/resource can be verified from the repository.                                                  |
| GitHub account/checks   | BLOCKED            | No GitHub CLI is installed and no remote exists; hosted CI/check URLs are unavailable.                                                   |

## Intended staging topology

The prepared Blueprint is intentionally staging-only:

```text
Render project oku-plus / environment staging
  ├── oku-plus-staging-api  (Fastify + static SPA)
  └── oku-plus-staging-db   (private managed PostgreSQL, Frankfurt)
```

The API receives the database connection through the provider binding. Migrations run as `npx prisma migrate deploy` in the pre-deploy phase. The service health gate is `/ready`; `/health` and `/health/db` are separate liveness/database checks. `autoDeployTrigger` is off until repository integration and branch policy are explicitly configured.

## Environment and secret evidence

No real staging value was written to the repository or report. The Blueprint uses provider-managed placeholders for `JWT_SECRET`, `CORS_ORIGIN`, and optional iyzico sandbox values. `DATABASE_URL` is expected only from the private staging database binding. TEST remains the local `127.0.0.1:5432/oku_plus_test` database; it is not a staging database.

Required staging values after an authorized account is supplied:

- unique staging `JWT_SECRET`;
- exact staging HTTPS `CORS_ORIGIN`;
- private staging `DATABASE_URL` binding;
- sandbox-only iyzico values and callback URL, only if sandbox E2E is authorized;
- any OIDC test credentials, only if social-login coverage is in scope.

## Real staging evidence status

| Evidence                          | Status                                 | Reason                                        |
| --------------------------------- | -------------------------------------- | --------------------------------------------- |
| Staging app/service ID            | NOT CREATED                            | Render account/resource unavailable.          |
| Staging DB ID/host                | NOT CREATED                            | No remote database exists or was accessed.    |
| Commit/deploy ID                  | NOT AVAILABLE                          | No GitHub remote or Render deployment.        |
| Migration status                  | NOT RUN on staging                     | No staging DB.                                |
| Staging fingerprint               | NOT AVAILABLE                          | No staging DB.                                |
| `/health`, `/health/db`, `/ready` | NOT RUN on staging                     | No staging URL.                               |
| HTTPS/TLS/HTTP redirect           | NOT RUN                                | No staging hostname.                          |
| CORS/security headers/rate limits | NOT RUN on staging                     | No staging ingress.                           |
| Auth/learning/tenant smoke        | NOT RUN on staging                     | No staging URL or synthetic staging identity. |
| Billing UI                        | Local baseline exists; staging NOT RUN | No staging URL; real payment prohibited.      |
| Hosted CI                         | NOT RUN                                | No remote repository.                         |
| Render logs                       | NOT AVAILABLE                          | No deployment.                                |
| Backup capability/restore drill   | NOT VERIFIED                           | No staging DB or account plan.                |
| Rollback rehearsal                | NOT RUN                                | No deployment history.                        |
| Mobile browser smoke              | NOT RUN                                | No real staging URL.                          |

## TEST database baseline

The local TEST fingerprint is recorded without a connection string or secret:

```text
combinedFingerprint=544e7a658f0cfde80642ba9f65b4b80db6f1d4cbc3be72dba938c4d7eeb7dd4e
database=oku_plus_test
schema=public
migrations=14/14
productionWrite=NO
```

The future staging fingerprint must differ from this TEST fingerprint and must be collected using explicit staging environment labeling. It must never be collected from or compared with a production target.

## Continuation conditions

An authorized operator must provide or configure the correct GitHub repository/remote, the Render account/project, and permission to create a staging web service and separate private Postgres. After that, execute the smoke checklist in [`STAGING_SMOKE_TEST_8I5.md`](STAGING_SMOKE_TEST_8I5.md), then update this evidence file and the final report with redacted IDs, URLs, commit SHA, deploy ID, fingerprints, and results.
