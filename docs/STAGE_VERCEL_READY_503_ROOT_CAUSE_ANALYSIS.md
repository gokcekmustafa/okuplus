# OKU+ — Vercel `/ready` 503 Root Cause Analysis

Date: 2026-09-04
Scope: read-only analysis only. No code, environment variable, Neon, production, migration,
write, or payment change was made.

## REQUIRED FINAL FIELDS

**FINAL ROOT CAUSE:** `/ready` reaches its second readiness gate after `SELECT 1` succeeds,
but the precise failing branch is **UNKNOWN** from the evidence available. The only remaining
branches are `unfinished migration count > 0` or an exception from the migration-state query.

**HOSTED DB:** Neon staging (the deployment is the `staging` branch's Vercel Preview; the DB
identity was not independently queried).

**UNFINISHED MIGRATIONS:** **UNKNOWN**. No direct read of Neon staging's
`_prisma_migrations` table was performed because an authorized staging-only database credential
was not available in this session. Local/test database state must not be substituted for hosted
staging state.

**MIGRATION QUERY:**

```sql
SELECT count(*)::bigint AS count
FROM "_prisma_migrations"
WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL
```

**EXCEPTION:** **UNKNOWN**. Vercel runtime log contents were not accessible, so the exception
class cannot be classified as relation missing, permission denied, connection, timeout, schema
mismatch, or another error.

**READY CONDITION:** the first `SELECT 1` succeeds **and** the migration query returns a count
of zero. Otherwise `/ready` returns HTTP 503. The explicit count branch logs a warning; the
exception branch logs an error and returns the same response body.

**HEALTH DB EXPLANATION:** `/health/db` performs only `SELECT 1`; it does not query
`_prisma_migrations`, so it can return 200 while the second `/ready` gate fails.

**REMEDIATION:** obtain read-only Vercel runtime logs for the Preview request or run the above
query using an authorized Neon staging-only credential. If the count is greater than zero,
report the migration name and timestamps without running a migration. If the query throws,
classify the logged database error before proposing any staging action. No blind remediation is
recommended.

**CODE CHANGE:** NO
**DB CHANGE:** NO
**PRODUCTION:** NO

## RESULT

**The exact failing branch cannot be proven from the public endpoint response alone.**

The hosted Preview evidence proves that the database connectivity check passes and that the
failure is in the second readiness gate: either the migration-state query reports at least one
unfinished migration, or that migration-state query throws an exception. Both branches return
the same `503 {"status":"not_ready","ready":false}` response.

The Vercel runtime log surface was not available in this session. The public Vercel deployment
status reports deployment completion, but it does not expose the function log line or database
exception needed to distinguish those two branches. No claim that one branch is false is made
without that log evidence.

## EXPECTED RESULT CLASSIFICATION

| Result                       | Determination   | Evidence status                          |
| ---------------------------- | --------------- | ---------------------------------------- |
| A) unfinished migrations = 0 | Not established | **UNKNOWN**                              |
| B) unfinished migrations > 0 | Not established | **UNKNOWN**                              |
| C) migration query exception | Not established | **UNKNOWN**                              |
| D) database table missing    | Not established | **UNKNOWN**; would require the exception |
| E) permissions issue         | Not established | **UNKNOWN**; would require the exception |
| F) unknown                   | Selected        | **YES**                                  |

The report intentionally selects F rather than inferring B, C, D, or E from an identical 503
response. The hosted `_prisma_migrations` rows and error details requested by the diagnostic
could not be read without staging DB access or runtime logs.

## ROOT CAUSE

`src/modules/health/routes.ts` implements `/ready` as two sequential checks:

1. `SELECT 1` through the Prisma client.
2. A query against `"_prisma_migrations"` counting rows where:
   - `finished_at IS NULL`, and
   - `rolled_back_at IS NULL`.

If the count is greater than zero, the route explicitly returns HTTP 503 and
`{"status":"not_ready","ready":false}`. If either query throws, the catch block returns the
same HTTP 503 response.

## FAILING CONDITION

**Proven failing set:** the route passes the first DB query, then does not reach the successful
return. The remaining possible conditions are:

- `Number(migrationRows[0]?.count ?? 0) > 0`; or
- the `_prisma_migrations` query throws, for example because the table is absent, the query is
  rejected, or the connection fails between the two queries.

The response deliberately contains no reason field, so HTTP 503 alone cannot distinguish these
cases. The runtime log distinction is:

- `Başarısız veya tamamlanmamış migration nedeniyle readiness reddedildi` → count greater than zero.
- `Readiness kontrolü başarısız` with an error object → migration query/second DB operation threw.

## WHY HEALTH DB STILL PASSES

`GET /health/db` executes only the first `SELECT 1` check. It does not inspect
`_prisma_migrations`. Therefore the following state is expected and valid:

```text
/health/db  -> SELECT 1 succeeds -> 200 database=up
/ready      -> SELECT 1 succeeds, migration gate fails -> 503 ready=false
```

This is not evidence of an application initialization flag or a server process failure.

## REPOSITORY EVIDENCE

- `src/modules/health/routes.ts`: only `/ready` readiness logic; no application-ready boolean.
- `src/config/env.ts`: parses `APP_ENV` and `NODE_ENV`, but neither is read by the readiness route.
- `src/app.ts`: registers `healthRoutes`; Fastify `app.ready()` initializes plugins/routes only.
- `src/server.ts`: calls `listen()` for the local long-running process; it does not set a readiness
  flag and is not the Vercel Function entrypoint.
- `prisma/schema.prisma`: datasource uses `DATABASE_URL`; there is no readiness-specific datasource.
- `package.json`: no Vercel migration hook; `build` is TypeScript compilation and `start` is the
  local server command.
- `render.yaml`: runs `npx prisma migrate deploy` as Render `preDeployCommand`, but that Render
  lifecycle does not run automatically for Vercel Preview.

## CONDITION MATRIX

| Candidate                            | Evidence                          | Result              |
| ------------------------------------ | --------------------------------- | ------------------- |
| DB `SELECT 1`                        | `/health/db = 200`                | **PASS**            |
| `_prisma_migrations` count is zero   | `/ready = 503` alone cannot prove | **UNKNOWN**         |
| `_prisma_migrations` query succeeds  | `/ready = 503` alone cannot prove | **UNKNOWN**         |
| Application initialized flag         | No such flag in route/service     | **NOT A CONDITION** |
| `APP_ENV` check                      | Not read by readiness route       | **NOT A CONDITION** |
| `NODE_ENV` check                     | Not read by readiness route       | **NOT A CONDITION** |
| `listen()`/server startup state      | Not read by readiness route       | **NOT A CONDITION** |
| External provider/payment dependency | Not used by readiness route       | **NOT A CONDITION** |

## VERCEL-SPECIFIC

**YES, lifecycle context only; NO, route logic is not Vercel-specific.**

The route is platform-independent. The Vercel-specific risk is deployment lifecycle: the
repository's migration command is configured in `render.yaml` for Render, not as a Vercel build or
deployment step. Vercel Preview can therefore run the application against a Neon database whose
migration state is not known from the repository alone. The Vercel Function's `app.ready()` is
Fastify plugin initialization; it is not the Prisma migration readiness query.

Latest observable Preview evidence for the `staging` branch:

- GitHub/Vercel deployment: Preview, completed successfully.
- Deployment URL: `https://okuplus-e8tdfexg3-gokcekmustafas-projects.vercel.app`
- `/health`: HTTP 200 JSON.
- `/health/db`: HTTP 200 JSON `database=up`.
- `/ready`: HTTP 503 JSON `ready=false`.

## CODE FIX REQUIRED

**NO for this analysis.** The repository implementation is internally consistent with the
documented contract. No code change is authorized or required to identify the failing branch.

## ENV FIX REQUIRED

**UNKNOWN; not authorized or performed.** The hosted response proves that some runtime database
connection is reachable, but does not prove migration-table existence/state or the exact runtime
configuration. Vercel environment variables were not changed.

## NO CHANGES YET

- Code: unchanged.
- Environment variables: unchanged.
- Neon: unchanged.
- Production: not accessed.
- Migration: not run.
- Database write: not performed.
- Payment/provider: not called.

## REQUIRED NEXT EVIDENCE

Read the Vercel runtime log for the `/ready` request and classify it using the two log signatures
above, or execute the exact count query above as a read-only query against Neon staging. Only
after that evidence is available can the exact conclusion be selected:

- **Migration state false:** repair/complete the approved staging migration lifecycle, then retest.
- **Migration query exception:** inspect the exact database error/table/permission/connection
  condition, then decide whether an approved staging configuration or migration action is needed.

Do not promote to production based only on `/health/db = 200`.
