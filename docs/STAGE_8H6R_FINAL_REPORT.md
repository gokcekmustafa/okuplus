# OKU+ — Stage 8H-6R Final Report

## STATUS:

**PASS — local TEST recovery and full local lifecycle verification completed.**

The real iyzico sandbox provider E2E remains **NOT RUN** because the required provider configuration is absent. This does not block the local lifecycle result.

## TEST DB:

**AVAILABLE**

- PostgreSQL **18.6** on Windows.
- Database: `oku_plus_test`.
- Endpoint: `127.0.0.1:5432`.
- User: `postgres`.
- Existing databases discovered: `oku_plus_test`, `postgres`, `template1` (connectable list).
- Direct `psql` identity check returned `oku_plus_test | postgres | 127.0.0.1/32 | 5432`.
- No production database URL or production host was used.

## DB RECOVERY:

**PASS**

- Before recovery there was no PostgreSQL service/process and no listener on 5432.
- Existing cluster/data directory was verified at `C:\Program Files\PostgreSQL\18\data`.
- The stale `postmaster.pid` referenced a non-running PID; `pg_ctl status` confirmed no server was running.
- The existing cluster was started in place with PostgreSQL 18 `pg_ctl`; no new cluster, data directory, drop, truncate, reset, or service change was performed.
- PostgreSQL log showed automatic recovery after the interrupted prior run and then `database system is ready to accept connections`.
- Final server PID was 13528 and both `127.0.0.1:5432` and `::1:5432` were listening.
- `GET /health` returned HTTP 200 `{"status":"ok"}`.
- `GET /health/db` returned HTTP 200 `{"status":"ok","database":"up"}`.

## MIGRATIONS:

**PASS**

- `npx prisma validate`: PASS.
- Existing pending migration `20260903140000_add_billing_state_audit` was applied with `npx prisma migrate deploy` to the verified TEST target.
- `npx prisma migrate status`: **Database schema is up to date**.
- No new migration was created during 8H-6R recovery.

## BILLING LIFECYCLE:

**PASS**

- Full local lifecycle contract passed: `FREE → PENDING → ACTIVE`, renewal remains `ACTIVE`, payment retry failure maps to `PAST_DUE`, retry success returns to `ACTIVE`, and cancellation/expiration are terminal states.
- Only `ACTIVE` grants Premium. `PENDING`, `TRIAL`, `PAST_DUE`, `CANCELED`, and `UNKNOWN` do not grant access; `EXPIRED` resolves to Free/no grant.
- Reactivation from a canceled state requires a new checkout path.
- `test/billing-lifecycle.unit.test.ts`: 9/9 tests passed as part of the targeted lifecycle set.
- `test/iyzico-billing.test.ts`: 10/10 tests passed with the recovered TEST DB.

## WEBHOOK:

**PASS**

- Valid signed iyzico V3 subscription success was accepted and produced the Premium entitlement plus audit state transition `PENDING → ACTIVE`.
- Same event replay was a duplicate/NOOP.
- Same provider event ID with a different payload was safely rejected as a conflict.
- Invalid signature was rejected and audited without granting Premium.
- An old `ACTIVE` event after `CANCELED` did not reopen the terminal subscription in integration coverage.
- The unit lifecycle guard also verifies that `EXPIRED` cannot be reopened by a later payment-success event.
- Official V3 signature order is covered by an independent HMAC vector.

## IDEMPOTENCY:

**PASS**

- Same webhook payload twice: duplicate/NOOP.
- Same event ID with different payload: conflict rejection.
- Repeated local cancellation: NOOP on the same idempotency key.
- Repeated refund request: existing `REFUNDED` result is returned without a duplicate provider effect.
- Billing webhook audit records carry previous/new state and processing timestamps.

## SECURITY:

**PASS**

- Client-supplied Premium/plan/amount/currency/subscription/tenant/user fields are rejected by the strict checkout contract.
- Billing actor scope is personal-only; organization checkout is rejected with 403.
- Webhook signature, freshness, duplicate, conflict, stale-event, terminal-state, and RLS paths passed the targeted regression set.
- The first parallel targeted invocation had one transient PostgreSQL P1001 under concurrent fixture load (56/57); the failing entitlement test passed in isolation (6/6), and the deterministic serial rerun passed 57/57. The full suite also passed.

## PERSONAL/ORG:

**PASS**

- Personal entitlement coverage verified a Premium personal scope with unlimited features.
- A separate browser-created personal pilot account remained Free with the 3-practice/20-question limits.
- Organization scope remained Free and was not affected by a personal Premium grant; an organization-level Premium row did not leak into the user’s organization entitlement result.
- Personal ↔ organization context switching and cross-tenant isolation passed.

## BROWSER:

**PASS — local browser regressions**

- Existing 8F final QA: PASS across 10 viewport sizes, no overflow, 48px controls, navigation/ARIA, reduced motion, performance, throttled recovery, offline boundary, and zero console/page errors.
- Closed-pilot browser regression: PASS for signup, personal tenant, consent/onboarding, Free entitlement, Premium CTA/info, limit/paywall, entitlement-response tampering, exercise completion, progress/XP/streak/review, feedback/bug replay, logout/login restore, telemetry, and targeted cleanup.
- 8G-8 curriculum pack browser E2E: PASS for 9 pack nodes, 4-question exercise, mobile reading/privacy, completion/progress/XP/streak/review, and targeted cleanup.
- Added and ran `scripts/browser-billing-lifecycle-test.ts`: PASS for route-mocked browser state rendering `FREE → Premium CTA → sandbox billing surface`, `ACTIVE → Premium UI`, `CANCELED → Free UI`, and `EXPIRED → Free UI`; cancellation visibility and Turkish state labels were verified. No provider call or payment was made.

## FULL TEST:

**PASS**

`npm test -- --reporter=dot` completed with **35 test files passed and 623 tests passed** in 118.89 seconds after DB recovery.

## QUALITY GATES:

**PASS**

- `npm run lint`: PASS.
- `npm run format:check`: PASS.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `npx prisma validate`: PASS.
- `npx prisma migrate status`: PASS / up to date.

## SANDBOX E2E:

**NOT RUN**

The TEST `.env` has no iyzico API key, secret key, base URL, merchant ID, subscription plan references, or callback URL. No real provider request was attempted. The local adapter/webhook contract and mocked browser billing states were verified only.

## TEST DB INTEGRITY / CLEANUP:

Final read-only snapshot after the QA runs:

| Area                                                                                           |                                  Count/result |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------: |
| BillingCustomer / BillingCheckout / BillingSubscription / BillingPayment / BillingWebhookEvent |            0 each after targeted test cleanup |
| Entitlement                                                                                    |                 0 after targeted test cleanup |
| EntitlementUsage                                                                               | 91 existing TEST usage rows; no broad cleanup |
| PilotEvent / PilotFeedback / PilotBugReport                                                    |                0 after targeted pilot cleanup |
| 8G-8 stable Content / Question / ExerciseTemplate                                              |                                    9 / 36 / 9 |
| 8G-8 ContentSkill relations                                                                    |                                             9 |

There is no dedicated `CurriculumPack` table in the current Prisma schema; the pack is represented by stable Content/Question/ExerciseTemplate IDs and their existing relations. Existing pack/catalog records were preserved.

Pack and fixture QA were read-only and used the explicit TEST target:

- `qa:curriculum-pack`: PASS, `TEST_READ_ONLY`, 9 contents / 36 questions.
- `qa:curriculum-fixtures`: PASS, `TEST_FIXTURE_READ_ONLY`, 12/12 Level and 7/7 Skill rows classified as fixtures.
- `qa:curriculum-catalog`: expected `BLOCKED`, exit 2; stable IDs 144/144, no orphan or duplicate stable IDs, but fixture Level/Skill catalog and missing direct Level→Skill / Content→Level relations remain.

## PRODUCTION WRITE:

**NO**

## PRODUCTION PAYMENT:

**NO**

## 8G-8:

**OPEN** — production promotion remains outside this local TEST recovery task.

## 8G-9B:

**OPEN** — production-grade Level/Skill catalog and direct alignment relations remain unresolved; catalog QA correctly remains BLOCKED.

## REMAINING BLOCKERS:

1. Real iyzico sandbox credentials/configuration and an approved HTTPS callback are absent, so real provider sandbox E2E is NOT RUN.
2. 8G-8 production DB/deployment and promotion approval remain open.
3. 8G-9B production catalog is still fixture-based in TEST and lacks the direct Level→Skill and Content→Level relations required by the catalog contract.

## FINAL RECOMMENDATION:

Declare **8H-6R local TEST verification PASS**. Keep production payment/promotion disabled. Run the real iyzico sandbox E2E only after sandbox credentials, callback ownership, and provider activation are supplied; resolve 8G-8 and 8G-9B separately before any production promotion.
