# OKU+ 8I-4 — Final Report

Date: 2026-09-03  
Scope: deployment platform selection, repository staging foundation, and local evidence. Production access and production changes were not authorized and were not performed.

## STATUS

**BLOCKED — staging account, repository integration, and staging database are not available in this workspace.** The repo-side foundation is prepared and locally verified.

## PRIMARY PLATFORM

**Render — recommended.** It is the closest operational fit for the existing long-lived Fastify + static SPA + Prisma application, with managed Postgres, environment isolation, health checks, HTTPS, rollback, and paid Postgres backup/PITR capabilities.

## SECONDARY

**Railway — viable fallback.** It has a strong service/environment/secret model, private SSL-enabled Postgres, backup layers, health checks, and rollback. Actual plan, region, IaC path, and account policy require verification.

## STAGING APP

**BLOCKED / NOT CREATED.** [`render.yaml`](../render.yaml) defines one staging web service, `oku-plus-staging-api`, in Frankfurt. No provider account or deploy was accessed.

## STAGING DB

**BLOCKED / NOT CREATED.** The Blueprint defines one private `oku-plus-staging-db` in Frankfurt and binds only its connection string to the staging service. No staging database was created, connected, migrated, or written.

## TEST DB

**VERIFIED.** Local/test database is `oku_plus_test` on loopback, with 14/14 migrations applied, no pending/failed migrations, and production write `NO`.

Fingerprint evidence:

```text
schemaHash=3f40232948d9b59374112532a3999406b810aa2dc63230bd44a8981254cc7041
liveSchemaHash=2195fed3b6ed53957db5dfff514810a0ef317c4b1905c2bca3b15815c9de25db
migrationManifestHash=8f073635f2f3d40193e30d78d031f55f609fe179c39b8758cf28bad9765fff8b
combinedFingerprint=544e7a658f0cfde80642ba9f65b4b80db6f1d4cbc3be72dba938c4d7eeb7dd4e
productionWrite=NO
```

## CI/CD

**FOUNDATION READY / HOSTED RUN NOT EXECUTED.** [`ci.yml`](../.github/workflows/ci.yml) installs dependencies, migrates an ephemeral PostgreSQL service, prepares the non-superuser RLS role, runs lint/format/typecheck/build/tests, and contains no production deploy job. The current repository has no configured `origin`, so GitHub checks and branch protection are unknown.

## HEALTH

**LOCAL VERIFIED; STAGING UNKNOWN.** `/health`, `/health/db`, and `/ready` are implemented. Local `/ready` checks database reachability and unfinished/rolled-back Prisma migrations.

## READY

**LOCAL PASS; STAGING BLOCKED.** The app’s readiness contract is suitable for the Blueprint, but no real staging response or deploy evidence exists.

## HTTPS

**CONFIGURATION READY; NOT VERIFIED.** Render managed TLS/HTTP redirect is selected by capability. No staging hostname or certificate exists to test.

## SECRETS

**REPO CLEAN; BINDING BLOCKED.** No real provider or production secrets were read or written. The Blueprint marks secret values as provider-managed placeholders. Staging must receive a unique JWT secret, exact HTTPS CORS origin, and sandbox-only payment values if payment tests are authorized.

## SECURITY

**LOCAL CONTROLS PASS; RELEASE BLOCKED BY OPEN ADVISORIES AND ACCOUNT EVIDENCE.** Current code has explicit CORS, security headers/CSP, HSTS in production mode, request/body/connection limits, auth rate limits, readiness checks, graceful shutdown, and read-only fingerprinting. The process-local rate limiter, production TLS/edge configuration, alerting, secret access policy, and staging evidence remain unverified.

## BACKUP

**CAPABILITY SELECTED; DRILL NOT RUN.** Render paid Postgres backup/PITR and logical-backup behavior must be confirmed in the actual account. No staging DB exists, so no restore drill or RPO/RTO evidence is available.

## ROLLBACK

**CONFIGURATION/DOCUMENTATION READY; REHEARSAL NOT RUN.** Render rollback is the app rollback path. Database recovery must use a reviewed forward migration or isolated restore; no production or staging rollback was attempted.

## DEPENDENCIES

**OPEN HIGH FINDINGS: 3.** `npm audit --omit=dev --audit-level=high` reports the known Prisma transitive chain involving `@prisma/config`, `prisma`, and `deepmerge-ts@7.1.5` (`GHSA-ggr8-5vv4-36mx`). `npm audit fix --force` was not run. Dependency remediation or an explicitly accepted risk decision is required before production approval.

## STAGING SMOKE

**NOT RUN — no staging URL.** Local browser and API smoke evidence exists for billing lifecycle/account UX, curriculum pack, and closed-pilot operations using test/mocked boundaries. No real payment was made.

## TESTS

**PASS locally.** Evidence from the current repository:

- `npm test -- --reporter=dot`: 37 files, 636 tests passed.
- `npm run lint`: pass.
- `npm run format:check`: pass.
- `npm run typecheck`: pass.
- `npm run build`: pass.
- `npx prisma validate`: pass.
- `npx prisma migrate status`: test database up to date, 14 migrations.
- `npm run db:fingerprint`: pass; test fingerprint recorded above.
- `npm run qa:curriculum-pack`: pass, read-only.
- `npm run qa:curriculum-fixtures`: pass, read-only.
- `npm run qa:curriculum-catalog`: blocked because the required direct relation/content-level fixture is unavailable; read-only, production write `NO`.
- Existing browser checks: 8F final, billing lifecycle, billing account UX, curriculum pack, and closed-pilot operations passed locally with mocked/test boundaries.

## BROWSER

**LOCAL PASS; STAGING UNKNOWN.** Local app and pilot ports were stopped after checks; no provider browser URL exists.

## PRODUCTION

**NO-GO / UNKNOWN.** No production platform, domain, database, credential, or deploy path was discovered or bound. This report does not authorize production work.

## PRODUCTION WRITE

**NO.** No production database was created, connected, migrated, seeded, or written.

## PRODUCTION PAYMENT

**NO.** No real charge, capture, refund, subscription, or production payment callback was executed.

## 8G-8

**OPEN / NOT VERIFIED.** The required upstream 8G-8 evidence is not present as a completed staging/production deployment proof in this workspace.

## 8G-9B

**OPEN / NOT VERIFIED.** The required upstream 8G-9B evidence is not present as a completed staging/production deployment proof in this workspace.

## IYZICO

**NOT RUN.** No iyzico sandbox credentials or authorized staging callback were available. The repository adapter remains sandbox-only; no production key or real payment was used.

## REMAINING BLOCKERS

1. Authorized Render account/project and repository integration are missing.
2. Staging Postgres is not created or bound; migrations and fingerprint cannot be verified there.
3. Real staging hostname/TLS redirect, CORS, health, readiness, logs, and mobile API checks are not available.
4. CI has not run on a hosted remote because `origin` is not configured; branch protection is unknown.
5. Backup retention and restore drill evidence are missing.
6. Three HIGH dependency advisories remain open; no forced remediation was attempted.
7. `qa:curriculum-catalog` remains blocked by missing direct relation/content-level fixture evidence.
8. 8G-8 and 8G-9B upstream evidence remains unresolved.

## FINAL RECOMMENDATION

Keep the release **NO-GO**. The repository foundation is ready for an authorized Render staging setup, but the task must remain blocked until staging is actually created and verified end-to-end. After the blockers above are closed, repeat health/readiness, migration/fingerprint, HTTPS, backup/restore, rollback, browser/mobile API, security, and sandbox billing evidence before considering any separately authorized production work.
