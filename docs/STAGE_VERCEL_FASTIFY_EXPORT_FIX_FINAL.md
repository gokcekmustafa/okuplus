# OKU+ — Vercel Fastify Function Export Fix Final Report

Date: 2026-09-03  
Scope: staging only; no production deployment, production variable change, or payment action

## STATUS

**CODE FIX PASS / VERCEL RUNTIME BLOCKED**

The original Vercel entrypoint error was fixed. The staging Preview deployment now accepts the
default Function export, but the remote invocation still returns `FUNCTION_INVOCATION_FAILED`.
The exact remote exception requires Vercel runtime logs, which were not available in this task.

## ROOT CAUSE

Vercel selected `src/app.ts` as the Fastify entrypoint. It exported only the named
`buildApp` factory and had no default export, so Vercel rejected the module with:

`The default export must be a function or server.`

`src/server.ts` is the local long-running server entrypoint and already calls `listen()`.

## ENTRYPOINT

- Vercel Function entrypoint: `src/app.ts`
- Local server entrypoint: `src/server.ts`
- Local `npm start`: unchanged; it still runs `dist/server.js` and calls `app.listen()`.
- No Next.js, new framework, route, plugin, auth, billing, Prisma, or static architecture change.

## EXPORT FIX

`src/app.ts` now keeps the named `buildApp` factory and adds a lazy default Node handler:

- loads environment and builds Fastify on first invocation;
- awaits `app.ready()` once per warm function instance;
- forwards Node requests with Fastify's documented `app.server.emit("request", req, res)` adapter;
- does not call `listen()` in the Vercel path.

References: [Vercel Fastify entrypoint documentation](https://vercel.com/docs/frameworks/backend/fastify),
[Fastify Vercel serverless example](https://fastify.dev/docs/v5.0.x/Guides/Serverless/).

## LOCAL

**PASS**

The built default handler was invoked through a local Node HTTP wrapper. Final adapter results:

| Path | Result |
|---|---|
| `/` | 200 application HTML |
| `/health` | 200 `{"status":"ok"}` |
| `/health/db` | 200 `{"status":"ok","database":"up"}` |
| `/ready` | 200 `{"status":"ok","ready":true}` |
| `/auth/me` | 401 expected unauthenticated response |
| `/billing/catalog` | 401 expected unauthenticated response |

## CI

**NOT TRIGGERED FOR STAGING PUSH**

The repository workflow runs on pull requests and push to `master` only; it does not run on a
direct push to `staging`. GitHub commit checks for `94dd9ba` showed only the Vercel Preview
check, not a GitHub Actions CI run. Local CI-equivalent gates passed below.

## GITHUB

**PASS — staging only**

- Repository: `https://github.com/gokcekmustafa/okuplus.git`
- Pushes: `bfa95db → b44a23e → 94dd9ba`, fast-forward only
- `origin/staging`: `94dd9ba39a43d20c389ae5a9fb90206b52f139bd`
- Local `staging` HEAD: `94dd9ba39a43d20c389ae5a9fb90206b52f139bd`
- Local/remote HEAD match: **YES**
- `master`: not pushed in this task
- Force push/history rewrite: **NO**

## VERCEL PREVIEW

**DEPLOYMENT PASS / INVOCATION FAIL**

- GitHub Preview deployment: `success` for commit `94dd9ba`
- Deployment record: Preview deployment `6252675955`
- Current deployment URL: `https://okuplus-cwr8a8v58-gokcekmustafas-projects.vercel.app`
- Given alias retested: `https://okuplus-jutu0q3ho-gokcekmustafas-projects.vercel.app`
- Both URLs no longer return Vercel Login HTML or the original invalid-export message.
- Both URLs return HTTP 500 with `FUNCTION_INVOCATION_FAILED` for the application paths.

## HEALTH

**BLOCKED REMOTELY** — `/` returned HTTP 500 `FUNCTION_INVOCATION_FAILED`.

## DB HEALTH

**BLOCKED REMOTELY** — `/health/db` returned HTTP 500 `FUNCTION_INVOCATION_FAILED`.

Local final handler probe returned HTTP 200 database up.

## READY

**BLOCKED REMOTELY** — `/ready` returned HTTP 500 `FUNCTION_INVOCATION_FAILED`.

Local final handler probe returned HTTP 200 ready.

## AUTH

**BLOCKED REMOTELY** — `/auth/me` returned HTTP 500 `FUNCTION_INVOCATION_FAILED`, so the
expected unauthenticated 401 contract could not be confirmed remotely.

Local final handler probe returned the expected HTTP 401 JSON response.

## BILLING

**BLOCKED REMOTELY** — `/billing/catalog` returned HTTP 500 `FUNCTION_INVOCATION_FAILED`, so
the expected unauthenticated 401 contract could not be confirmed remotely.

Local final handler probe returned the expected HTTP 401 JSON response. No payment/provider call
was made.

## TESTS

**PASS**

- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm test -- --reporter=dot`: **37 test files / 636 tests PASS** after the final adapter change
- `npx prisma validate`: PASS
- `npx prisma migrate status`: PASS; 14/14 migrations applied, schema up to date
- explicit TEST DB fingerprint: PASS; `productionWrite: NO`

## BROWSER

**PASS locally**

- Billing lifecycle browser regression: PASS; provider calls mocked, no payment
- Billing account UX browser regression: PASS; provider/payment calls mocked, no payment
- Closed-pilot operations browser regression: PASS with temporary local-only `PILOT_MODE=on`; cleanup PASS
- 8F final browser QA: PASS; 10 viewport matrix, accessibility, reduced-motion, performance, offline, and console/pageerror checks
- Curriculum pack QA: PASS, TEST read-only
- Curriculum fixture QA: PASS, TEST fixture read-only

## PRODUCTION NO / WRITE / PAYMENT

- Production deploy: **NO**
- Production environment variables: **NOT TOUCHED**
- Production database: **NOT ACCESSED**
- Production write: **NO**
- Payment/provider call: **NO**
- Only local TEST PostgreSQL was used for local verification.

## 8G-8 OPEN

Existing 8G-8 production promotion/readiness blocker remains open. This task did not create a
production database or claim production readiness.

## 8G-9B OPEN

Catalog QA remains open/not evaluated by the fixture QA script, as previously scoped. Pack and
fixture QA were run and passed against the explicit local TEST target only.

## REMAINING

1. Inspect Vercel runtime logs for Preview deployment `6252675955` to identify the exact exception
   behind `FUNCTION_INVOCATION_FAILED`.
2. Verify the existing Vercel Preview runtime configuration against the repository environment
   contract. No variable was created, deleted, or edited here.
3. Re-run the six Preview endpoint checks after the remote runtime exception is resolved.
4. GitHub Actions CI must be run through its configured `master` push or pull-request trigger; a
   direct staging push does not trigger the current workflow.

## RECOMMENDATION

Do not promote to production. First obtain the Vercel runtime error for deployment `6252675955`
and resolve the remote invocation blocker within the existing staging configuration. Then repeat
the Preview endpoint matrix and record a separate PASS only when `/health`, `/health/db`, and
`/ready` return 200 and protected endpoints return their expected application responses.
