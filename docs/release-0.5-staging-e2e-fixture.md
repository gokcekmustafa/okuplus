# Release 0.5 staging E2E fixture

The full six-item E2E uses a dedicated synthetic student and the normal
student APIs. The fixture is intentionally staging-only:

- `APP_ENV` must be `staging`.
- `STAGING_E2E_PREMIUM_EMAIL` must be the exact synthetic account email and
  must end in `.invalid`.
- The entitlement provider recognizes that one active student account as
  `PLAN_PREMIUM`; it does not create or modify an entitlement row.
- Production and non-synthetic users never receive this provider path.
- `scripts/provision-staging-release-0-5-e2e.ts` uses normal signup/login,
  profile, consent, and onboarding endpoints. It is idempotent for the email
  and never imports Prisma, executes SQL, resets quota, or deletes data.

Run the provisioner only against the approved staging alias after the server
has the same `STAGING_E2E_PREMIUM_EMAIL` configuration. It reports only safe
status metadata. Then run the existing
`scripts/browser-student-full-e2e.ts` with the same student credentials.

The normal training, attempt, scoring, completion, progress, GP, streak, and
published-content rules remain active; the fixture changes only the staging
account's entitlement plan through the explicit provider configuration.
