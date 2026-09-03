# STAGE 8I-6C — Vercel + Neon Hosted Staging POC Final Report

**Tarih:** 2026-09-03  
**STATUS:** **BLOCKED**  
**Reason:** Authorized Vercel/Neon account access is unavailable; hosted project, staging DB and HTTPS URL could not be created or verified.

## Final decision

8I-6B-R architecture decision remains **DIRECTLY COMPATIBLE**. 8I-6C hosted POC, however, is **BLOCKED**, not PASS. Windows browser automation helper failed twice, Vercel CLI/Neon CLI are not installed, and no credential/token was guessed or generated.

## Acceptance matrix

|   # | Acceptance                     | Result                                                                                                                                                    |
| --: | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | GitHub remote current          | **PASS** — `origin/master` = `6590e7d7b78cc9fb0392d20b24dfaa25cec2816f`                                                                                   |
|   2 | GitHub CI PASS                 | **PASS** — [run `33791604619`](https://github.com/gokcekmustafa/okuplus/actions/runs/33791604619) for SHA `6590e7d`; `quality` job completed successfully |
|   3 | Vercel account verified        | **BLOCKED**                                                                                                                                               |
|   4 | Vercel project exists          | **NOT CREATED**                                                                                                                                           |
|   5 | Correct GitHub repo connected  | **NOT VERIFIED** — remote repo correct, Vercel connection unavailable                                                                                     |
|   6 | Neon staging DB exists         | **NOT CREATED**                                                                                                                                           |
|   7 | TEST/staging DB separate       | **NOT VERIFIED** — staging resource absent                                                                                                                |
|   8 | migrations applied remotely    | **NOT RUN**                                                                                                                                               |
|   9 | DB fingerprint differs         | **NOT AVAILABLE**                                                                                                                                         |
|  10 | `/health` hosted               | **NOT RUN**                                                                                                                                               |
|  11 | `/health/db` hosted            | **NOT RUN**                                                                                                                                               |
|  12 | `/ready` hosted                | **NOT RUN**                                                                                                                                               |
|  13 | HTTPS/TLS                      | **NOT RUN**                                                                                                                                               |
|  14 | hosted auth                    | **NOT RUN**                                                                                                                                               |
|  15 | hosted student flow            | **NOT RUN**                                                                                                                                               |
|  16 | hosted tenant isolation        | **NOT RUN**                                                                                                                                               |
|  17 | billing UI                     | **NOT RUN HOSTED**; local baseline only                                                                                                                   |
|  18 | safe logs                      | **NOT VERIFIED HOSTED**; logger redaction inspected locally                                                                                               |
|  19 | CORS/security                  | **NOT VERIFIED HOSTED**; static contract inspected locally                                                                                                |
|  20 | mobile browser smoke           | **NOT RUN**                                                                                                                                               |
|  21 | rollback known/tested          | **NOT VERIFIED**                                                                                                                                          |
|  22 | backup capability known/tested | **NOT VERIFIED**                                                                                                                                          |
|  23 | production untouched           | **PASS**                                                                                                                                                  |

## GitHub and local evidence

GitHub source is correct and was pushed with no force operation:

```text
repository: https://github.com/gokcekmustafa/okuplus
branch: master
remote SHA: 6590e7d7b78cc9fb0392d20b24dfaa25cec2816f
push: 2f7d598..6590e7d master -> master
```

Tracked secret scan found no private key/full credential pattern; `.env.example` is the only allowed environment filename candidate. No secret value was recorded in this report.

Local quality gates:

- 37/37 test files, 636/636 tests: **PASS**
- lint, format, typecheck, build: **PASS**
- Prisma validate/status: **PASS**, 14 migrations current
- local compiled smoke `/`, `/health`, `/health/db`, `/ready`: **PASS**, all 200

The local PostgreSQL instance was used only under `.tmp`, migrated locally, and stopped. No remote/shared/production DB was touched.

## Required hosted evidence

An authorized operator must create only a staging/Preview setup:

```text
GitHub: gokcekmustafa/okuplus, master
Vercel: okuplus-staging, Node runtime, src/server.ts
Neon: separate staging project/branch
Runtime DB: pooled DATABASE_URL
Migration DB: direct URL, one controlled migration job
Data: schema-only/synthetic, no production PII
```

Then record the redacted Vercel URL/deployment ID, Neon identity, 14/14 migration state, staging fingerprint, health responses, auth/learning/tenant/billing smoke, CORS/CSP/security headers, logs, rollback and backup evidence.

## High-risk findings carried forward

- **RATE LIMIT: HIGH RISK** — `src/plugins/security.ts` uses a process-local `Map`; not distributed across Vercel instances. Do not claim global enforcement.
- **AUTH COOKIE: HIGH RISK / BLOCKED for production** — browser bearer tokens are in localStorage; Secure/HttpOnly/SameSite cookie approach is not implemented.
- **WEBHOOK: BLOCKED for production acceptance** — route reserializes parsed body; raw-body signature behavior and provider timeout/abort need hosted sandbox/mock evidence.
- **BILLING: OPEN** — current iyzico boundary is sandbox-only; no real payment or production credentials.
- **DEPENDENCIES: REVIEW** — previous baseline reported 3 HIGH npm audit advisories; force upgrade not run.

## Production safety

```text
Production deploy: NO
Production DB: NO
Production write: NO
Production payment: NO
Production catalog: NO
Production domain: NO
Production secret: NO
render.yaml: preserved
```

`8G-8`, `8G-9B` and `IYZICO` remain **OPEN**.

## Official references

- [Vercel Fastify](https://vercel.com/docs/frameworks/backend/fastify)
- [Vercel environments](https://vercel.com/docs/deployments/environments)
- [Vercel environment variables](https://vercel.com/docs/environment-variables/manage-across-environments)
- [Vercel Functions limits](https://vercel.com/docs/functions/limitations)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Neon Prisma migrations](https://neon.com/docs/guides/prisma-migrations)
- [Neon branching](https://neon.com/docs/guides/branching-intro)
- [Neon–Vercel integration](https://neon.com/blog/neon-vercel-native-integration)

## Remaining work

1. Authorized Vercel account/project and correct GitHub connection.
2. Separate Neon staging project/branch and pooled/direct URL wiring.
3. Controlled migration and distinct staging fingerprint.
4. Hosted health/HTTPS/auth/learning/tenant/billing/browser/mobile smoke.
5. Hosted safe-log, CORS/CSP, rollback and backup evidence.
6. Distributed rate limit and auth cookie hardening.
7. Webhook raw-body/provider timeout/idempotency acceptance.
8. CI evidence link is available at run `33791604619`; hosted Vercel/Neon evidence remains open.
9. Open 8G-8, 8G-9B and iyzico decisions.

## Final recommendation

Keep Production **NO-GO**. The Vercel + Neon architecture remains recommended for the next authorized staging attempt, but 8I-6C cannot be accepted as hosted PASS without account access, a real isolated staging DB, migrations/fingerprint, HTTPS health, browser/mobile smoke and operational evidence. Do not create a production environment as a workaround.
