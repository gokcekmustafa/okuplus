# OKU+ 8I-6B — Staging Verification Evidence

**Date:** 2026-09-03  
**Status:** **BLOCKED — no real Render staging resource or authorized Render account evidence**  
**Release source:** remote `master` / `2f7d598843141cc1073dea4cfdeca67f58c8785b`; local evidence commit is not pushed

This document separates local/test evidence from hosted staging evidence. Local PASS is not promoted to staging PASS.

## Verification matrix

| Gate                             | Result                       | Evidence / limitation                                                                                         |
| -------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GitHub repository                | PASS                         | `https://github.com/gokcekmustafa/okuplus`, branch `master`                                                   |
| Release SHA                      | PASS                         | Verified `origin/master` at `2f7d598843141cc1073dea4cfdeca67f58c8785b`; local docs/config child is not pushed |
| Hosted CI                        | PASS                         | GitHub Actions quality run `33786565630`                                                                      |
| Render account/API/project       | BLOCKED                      | No authorized session, token, project ID, or service ID available; Render CLI absent                          |
| Render source binding            | NOT RUN                      | Cannot verify panel-side repo/branch binding without account access                                           |
| Staging API                      | BLOCKED                      | Service not created; URL and deploy ID unavailable                                                            |
| Staging DB                       | BLOCKED                      | Managed Postgres not created; resource ID and TLS connection unavailable                                      |
| Staging migration                | NOT RUN                      | Remote `prisma migrate deploy` cannot run without staging DB                                                  |
| Staging fingerprint              | NOT AVAILABLE                | No remote DB identity; no fingerprint guessed or fabricated                                                   |
| `/health`                        | LOCAL PASS / STAGING NOT RUN | Local health test returned 200; no staging URL                                                                |
| `/health/db`                     | LOCAL PASS / STAGING NOT RUN | Local TEST returned 200 after local PostgreSQL recovery                                                       |
| `/ready`                         | LOCAL PASS / STAGING NOT RUN | Local TEST returned 200 with 14 migrations applied                                                            |
| HTTPS/TLS/HTTP redirect          | STAGING NOT RUN              | No Render endpoint or certificate evidence                                                                    |
| CORS                             | LOCAL PASS / STAGING NOT RUN | Explicit-origin guard is covered locally; staging origin not configured in an account                         |
| Auth signup/login/logout/refresh | LOCAL PASS / STAGING NOT RUN | Covered by local regression suite; no hosted synthetic identity                                               |
| Student learning flow            | LOCAL PASS / STAGING NOT RUN | Covered by local regression suite; no hosted data or URL                                                      |
| Tenant isolation/RLS             | LOCAL PASS / STAGING NOT RUN | Local RLS/security coverage passed; no staging role/policy evidence                                           |
| Billing UI/state                 | LOCAL PASS / STAGING NOT RUN | Local billing/account coverage exists; hosted UI not opened                                                   |
| iyzico sandbox                   | NOT RUN                      | No sandbox merchant/plan/callback credentials were available; production payment was not attempted            |
| First-real curriculum pack       | LOCAL CONTRACT ONLY          | Production-grade catalog promotion remains blocked by 8G-9B; no staging seed/write performed                  |
| Backup/restore                   | NOT RUN                      | No managed staging DB exists to create or restore a backup                                                    |
| Rollback                         | NOT RUN                      | No staging deploy/artifact history exists                                                                     |
| Security/logging/observability   | LOCAL PASS / HOSTED NOT RUN  | Local hardening is tested; Render logs, alerting, TLS, and retention are unknown                              |
| Mobile web smoke                 | NOT RUN                      | No hosted URL or remote browser evidence                                                                      |

## Local quality evidence

The local TEST database was explicitly identified as `127.0.0.1:5432/oku_plus_test`, schema `public`. After recovering the stopped local PostgreSQL instance:

- `npm test -- --reporter=dot`: **37 test files, 636 tests PASS**
- `npm run lint`: **PASS**
- `npm run format:check`: **PASS**
- `npm run typecheck`: **PASS**
- `npm run build`: **PASS**
- `npx prisma validate`: **PASS**
- `npx prisma migrate status`: **14 migrations found, schema up to date**
- migration repository count: **14**
- local health tests: `/health`, `/health/db`, `/ready` all pass when TEST PostgreSQL is available

The release evidence baseline required for staging comparison remains:

`544e7a658f0cfde80642ba9f65b4b80db6f1d4cbc3be72dba938c4d7eeb7dd4e`

A fresh local fingerprint invocation on the restarted PostgreSQL instance returned `8854ce18d4891e93f7902a0183738ce2e1e18ad1b31a06ff13808ed3589c4ca4`. This differs from the previously recorded release baseline and must be reconciled before using a future staging comparison as evidence; it is not used as a staging fingerprint and does not unblock deployment.

## Dependency status

`npm audit --omit=dev --audit-level=high` reports **3 HIGH** advisories involving the Prisma config chain and `deepmerge-ts`. The suggested remediation requires `npm audit fix --force` and a breaking Prisma downgrade, so it was not run. Dependency risk remains an explicit production blocker.

## Evidence and secret policy

No database URL, JWT secret, Render token, iyzico credential, payment payload, or private key is recorded here. Render secret values must be entered only through the provider’s secret manager. The staging fingerprint must be collected with an explicit `DB_FINGERPRINT_ENVIRONMENT=STAGING` label and a staging-only URL; it must be different from the recorded TEST baseline and must never be collected from production.

## Acceptance decision

The 8I-6B acceptance condition requires a real Render account/API path, separate staging service and managed DB, 14/14 remote migrations, a staging fingerprint, and hosted health/smoke evidence. Because these artifacts do not exist, the correct result is **BLOCKED**, not PASS.
