# OKU+ 8I-5R — Release Baseline

Date: 2026-09-03  
Scope: local Git/GitHub readiness, repository hygiene, release documentation, and local quality gates. No staging or production access is in scope.

## Baseline decision

The local release baseline is ready for review and local commit. The active branch is `master`, no Git remote is configured, and no push was performed. A remote URL, GitHub account, credentials, or alternate branch was not inferred.

Baseline commit: `2ce14ec0fe41e18974a951b585cb9c3a2c28d366`

The initial audit found an uncommitted repository with no prior commits. The final baseline is intended to leave the worktree clean while preserving the application, migrations, scripts, CI, Render staging foundation, tests, and existing evidence documents.

## Change classification

### A — 8G/8H/8I project changes

- `src/`, `prisma/`, `scripts/`, `public/`
- `package.json`, `package-lock.json`
- TypeScript, ESLint, Prettier, Vitest, and build configuration
- `.github/workflows/ci.yml`
- `render.yaml`

These are in-scope project and deployment-foundation files and are preserved.

### B — Documentation

- `README.md`
- Existing `docs/` stage reports, architecture, security, billing, curriculum, deployment, and operations evidence
- `docs/RELEASE_BASELINE_8I5R.md`
- `docs/STAGE_8I5R_FINAL_REPORT.md`

### C — Generated or test artifacts

Local `dist/`, coverage, Playwright reports/results, screenshots, runtime reports, and database files are generated or test artifacts. They remain local and are ignored by Git; no blind deletion was performed.

### D — Temporary/debug artifacts

`.tmp/` and local `*.log` files are temporary diagnostics/server logs. They remain local and are ignored by Git.

### E — Accidental/unrelated changes

No accidental or unrelated file was identified in the repository audit. Because this repository had no commits, all non-ignored project files were treated as the existing OKU+ baseline and preserved.

## Repository and remote audit

- Branch: `master`
- Initial commit history: none
- Remote: `UNKNOWN / NOT AVAILABLE`
- Push: `NO`
- GitHub CLI and Render CLI: not installed/available in the workspace
- No remote URL or credential was guessed

## Repository hygiene

`.gitignore` covers environment files while allowing only `.env.example`, dependency/build/cache output, logs, Playwright artifacts, screenshots/reports, local database files, private key/certificate extensions, `.secrets/`, and `.tmp/`.

`.env.example` contains placeholders only. `.env` is ignored and was not printed, staged, or committed.

The high-confidence secret scan found no private-key material, GitHub/AWS token, live payment key, or non-local database URL. Deterministic test credentials and placeholder values in test/docs fixtures were reviewed as synthetic/non-production data and are not reported as secret values.

## Local validation evidence

- `npm test -- --reporter=dot`: PASS — 37 files, 636 tests
- `npm run lint`: PASS
- `npm run format:check`: PASS
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `npx prisma validate`: PASS
- `npx prisma migrate status`: PASS against local TEST DB — 14/14 migrations applied, no pending/failed migrations
- TEST fingerprint: `544e7a658f0cfde80642ba9f65b4b80db6f1d4cbc3be72dba938c4d7eeb7dd4e`
- `npm audit --omit=dev --audit-level=high`: 3 known HIGH advisories remain; `npm audit fix --force` was not used

The existing local browser, billing lifecycle, closed-pilot, curriculum-pack, fixture, and regression evidence remains valid because 8I-5R changes are repository/documentation hygiene only. Catalog relation/content evidence remains blocked as documented by 8G-9B.

## Release and deployment boundary

`master` is the release-baseline branch for this local repository. The normal future flow is: verify the authorized remote, review the baseline, run hosted CI, then create a staging release from an explicitly approved commit. No staging deploy, production deploy, production database write, real payment, or provider callback was performed here.

The existing `render.yaml` is staging-only. Production remains NO-GO until remote ownership, hosted CI, staging infrastructure, secrets, backup/restore, rollback, security, billing, and upstream 8G evidence are independently verified.

## Remaining blockers

1. GitHub remote/repository ownership and hosted CI are unavailable.
2. Real staging app, private staging database, URL, migration evidence, health/readiness evidence, and mobile-browser evidence do not exist locally.
3. Three HIGH dependency advisories remain open.
4. 8G-8, 8G-9B, and iyzico sandbox evidence remain open/not verified for a real hosted environment.

## Commit policy

Create a local commit for the release baseline and evidence only. Do not push until the user supplies or verifies the intended GitHub remote and explicitly authorizes the remote operation.
