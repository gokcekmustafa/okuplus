# Security Mitigation: deepmerge-ts Advisory (2026)

## Status

This document records a temporary, staging-only security mitigation. It does not
close the production security gate and does not constitute production approval.

- Advisory: `GHSA-ggr8-5vv4-36mx`
- CVE: `CVE-2026-40345`
- Severity: HIGH
- Affected versions: `deepmerge-ts <8.0.0`
- Patched version: `deepmerge-ts 8.0.0`
- Owner: `<TO_BE_ASSIGNED>`
- Review date: `<TO_BE_ASSIGNED>`

Advisory reference: <https://github.com/advisories/GHSA-ggr8-5vv4-36mx>

## Current dependency chain

The repository currently uses the Prisma 6 pair:

```text
@prisma/client@6.19.3
prisma@6.19.3
└── @prisma/config@6.19.3
    └── deepmerge-ts@7.1.5
```

The vulnerable package is transitive. `prisma` is a direct development
dependency; the audit chain is nevertheless present in the installed package
tree and must be treated as a release security finding until remediated.

## Candidate A mitigation

Candidate A keeps the Prisma major and both Prisma packages unchanged and adds
the root npm override below:

```json
{
  "overrides": {
    "deepmerge-ts": "8.0.0"
  }
}
```

Resulting resolution:

```text
prisma@6.19.3
└── @prisma/config@6.19.3
    └── deepmerge-ts@8.0.0 (overridden from 7.1.5)
```

The override is used because the patched version is a major version of the
transitive package while the current Prisma 6 dependency declaration remains
unchanged. `npm audit --omit=dev --audit-level=high` reports `0 vulnerabilities`
with Candidate A.

## Why Prisma 7 is not used

Prisma 7 is not required to remediate this advisory, and upgrading would be a
separate major-version migration with its own compatibility and regression
surface. Candidate A preserves:

- `prisma@6.19.3`
- `@prisma/client@6.19.3`
- the existing schema and migration API
- the generated-client contract

Prisma’s upstream upgrade guidance documents breaking changes for a v6 to v7
upgrade: <https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7>.

## Verification evidence

Candidate A was tested in a separate security worktree and a new local,
disposable PostgreSQL TEST database. No staging or production target was used.

- `npm ci`: PASS
- `npm audit --omit=dev --audit-level=high`: PASS, 0 vulnerabilities
- `npm ls deepmerge-ts`: one resolved `8.0.0` instance
- `npm explain deepmerge-ts`: override applied below `@prisma/config@6.19.3`
- `npx prisma generate`: PASS
- 14 Prisma migrations: PASS
- canonical catalog bootstrap: PASS
- First Real Pack dry-run/apply: PASS
- second apply: PASS, NOOP
- rollback probe: PASS
- pack QA: PASS
- typecheck/lint/build: PASS
- targeted tests: PASS

The isolated First Real Pack verification produced the expected 9 Content,
36 Question, version records and binding records. The transaction used
`timeout=15000ms` and `maxWait=2000ms`.

## Known compatibility risk

Candidate A is a consumer-side override across the transitive package’s major
version boundary. The verification evidence is strong for this repository, but
there is no official Prisma dependency-range compatibility guarantee for
`@prisma/config@6.19.3` with `deepmerge-ts@8.0.0`.

The relevant Prisma upstream discussion is issue
[#30052 — Bump deepmerge-ts to >= 8.0.0 in @prisma/config](https://github.com/prisma/orm/issues/30052).
That issue should be monitored for an upstream package release or an official
compatibility statement.

## Security and release policy

- Candidate A is a temporary mitigation, not a production resolution.
- Staging promotion requires a separate explicit approval and CI/deployment
  verification.
- Production promotion is prohibited without explicit risk approval and a
  completed production security review.
- No database migration, schema change, seed, or deployment is part of this
  mitigation.
- Secrets, credentials, tokens and database URLs must not be added to this
  branch or to this document.

## Removal condition

Remove the root override after Prisma publishes an official release whose
`@prisma/config` dependency resolves to a patched `deepmerge-ts` version, then
re-run audit, generate, typecheck, lint, build and the relevant tests before
removing this mitigation record from the release process.
