# OKU+ 8I-4 — Staging Operations Runbook

This runbook covers the future Render staging environment. It does not authorize production access or production changes.

## Deploy and migration

1. Merge only reviewed changes into the agreed staging branch.
2. Let CI complete install, migration, lint, format check, typecheck, build, and tests.
3. Deploy the staging service with the pinned Node version and the Blueprint commands.
4. Confirm `npx prisma migrate deploy` completed before accepting traffic.
5. Record commit SHA, deploy ID, migration manifest hash, and the database fingerprint without recording secrets.
6. If migrations fail, stop promotion, preserve the failed deploy output, and investigate forward-only compatibility. Do not run `db push` or manually modify migration history.

The recommended branch flow is `feature/* -> master (staging) -> tagged release (future production)`. Until a remote and branch protection exist, this is a documented policy only; the current local branch is `master` and `origin` is not configured.

## Health and smoke

Use the public staging HTTPS host only:

| Check           | Expected result                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `/health`       | 200 liveness response                                                                                                  |
| `/health/db`    | 200 with `SELECT 1` database check                                                                                     |
| `/ready`        | 200 only when DB and migration state are ready; 503 otherwise                                                          |
| HTTP request    | Redirects to HTTPS at the provider edge                                                                                |
| API origin      | Exact staging origin is allowed by CORS; unrelated origins are rejected                                                |
| Mobile contract | Existing JSON API, bearer auth, refresh flow, pagination, error envelopes, and HTTPS work from web/iOS/Android clients |
| Billing         | Only mocked provider or authorized iyzico sandbox; no real charge, capture, refund, or production callback             |

Run the existing browser checks after the health gate. The current local evidence is documented in the final report; it is not a substitute for a staging URL.

## Logs and observability

- Keep structured request/error logs enabled, but redact authorization headers, cookies, JWTs, `DATABASE_URL`, provider keys, payment payload secrets, and personal data.
- Use request IDs/correlation IDs when investigating a request across API and provider callbacks.
- Alert on repeated `/ready` failures, database connection failures, migration failure, 5xx spikes, authentication abuse, webhook signature failures, and unusual billing state transitions.
- Treat provider logs and staging logs as non-production data, with access limited to the QA/development operators.
- The in-process rate limiter is process-local. A multi-instance deployment needs an account/platform-level or shared-store limiter before production approval.

## Backup and restore drill

Render paid Postgres capabilities must be confirmed in the actual account before staging is marked operational. At minimum:

1. Confirm backup/PITR retention, timezone, encryption, and access policy in the provider console.
2. Create a small synthetic staging fixture and record its expected row counts/fingerprint.
3. Restore to a separate scratch database; never overwrite the source during a drill.
4. Run `npx prisma migrate status`, `/health/db`, `/ready`, and a read-only smoke suite against the scratch database.
5. Compare row counts, migration manifest, live schema hash, and application behavior.
6. Record restore duration, RPO/RTO observations, operator, and evidence location.

No restore drill was run in 8I-4 because no staging database exists.

## Rollback

Application rollback and database rollback are different operations.

- App rollback: use the provider’s rollback to the previous successful deploy only after checking whether the schema remains compatible.
- Migration rollback: do not delete or reverse an applied migration in place. Ship a reviewed forward migration that restores compatible behavior, or restore an isolated database copy after an incident review.
- If a migration is destructive, use an expand/contract sequence: add compatible schema, deploy code, backfill safely, remove old schema only in a later reviewed change.
- After rollback, verify commit SHA, `/ready`, database fingerprint, critical auth/content/billing reads, and background/webhook behavior.

## Security controls

- Use protected environment permissions and isolate staging networking from other environments.
- Use a private same-region database connection; do not enable a public database proxy unless a documented diagnostic exception exists.
- Keep CORS allowlists exact and HTTPS-only.
- Keep `PILOT_MODE=off` unless a specifically authorized staging pilot test is being run.
- Use iyzico sandbox only. Missing credentials are a deliberate `NOT RUN` result, not a reason to substitute production credentials.
- Re-run `npm audit --omit=dev --audit-level=high` before release. Current evidence still contains three HIGH advisories in the Prisma transitive chain; do not run `npm audit fix --force` without a reviewed dependency migration.

## Cost and lifecycle

Keep staging stopped or scaled to the minimum supported plan when not testing, subject to backup/retention requirements. Review provider usage, database storage, logs, preview environments, and egress monthly. Preview/PR environments may create billable resources; create them only when the account policy permits.

## Incident response

1. Freeze staging deploys and record the current commit/deploy/database fingerprint.
2. Determine whether the fault is edge/TLS, app, database, migration, auth, or provider callback.
3. Preserve redacted logs and failing request IDs.
4. Roll back the app only when schema compatibility is confirmed.
5. Restore only to an isolated scratch database during investigation.
6. Re-run readiness and smoke checks, then document the cause and follow-up migration/test.

## Evidence required before production discussion

- real staging app URL and HTTPS certificate/redirect evidence;
- real staging DB ID, private connectivity evidence, backup/PITR policy, and successful restore drill;
- CI check URLs and branch protection evidence;
- deployment log showing migration success and no secret leakage;
- fingerprint and migration status from the staging database;
- browser smoke evidence for web and mobile-compatible API flows;
- resolution or accepted risk decision for the three HIGH advisories;
- explicit approval for any future production account, DB, secret, and payment work.
