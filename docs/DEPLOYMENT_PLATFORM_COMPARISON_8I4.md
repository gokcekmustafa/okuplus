# OKU+ 8I-4 — Deployment Platform Comparison

Date: 2026-09-03  
Decision scope: staging foundation and production-readiness evidence only. No provider account, production project, production database, payment system, or production credential was accessed.

## Decision

| Role       | Platform                 | Decision        | Why                                                                                                                                                                                                                                                   |
| ---------- | ------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary    | Render                   | Recommended     | Direct fit for the existing long-lived Fastify process, static SPA, Prisma migrations, managed Postgres, health checks, environment isolation, HTTPS, rollback, and database backup/PITR capabilities.                                                |
| Secondary  | Railway                  | Viable fallback | Strong service/environment/secret model, private SSL-enabled Postgres, backup layers, health checks, and rollback; usage billing and current IaC direction need account-level confirmation.                                                           |
| Considered | Fly.io                   | Not selected    | Good deployment strategies and managed Postgres, but managed Postgres migration tooling and customer-facing alerting are still documented as evolving.                                                                                                |
| Considered | Vercel + separate API/DB | Not selected    | Fastify is supported as a function with previews and rollback, but the app is currently a long-lived Fastify + Prisma + static-server process. A separate API and database would add an architectural boundary that is not present in the repository. |

## Application fit

The repository is a Node 24 / Fastify 5 application with `npm run build`, `npm start`, Prisma migrations, and the web client served by the same Fastify process. Render supports Node web services with explicit build/start commands and health-check paths. The staging Blueprint in [`render.yaml`](../render.yaml) therefore uses:

- `npm ci && npm run build`
- `npx prisma migrate deploy` as the pre-deploy migration command
- `npm start`
- `/ready` as the readiness path
- a private, same-region Render Postgres connection string

Render’s documented Node default can change over time, so the Blueprint pins `NODE_VERSION=24.14.1`; this must be revalidated before an actual account-bound deployment. The local runtime is Node `v24.16.0`.

## Technical comparison

| Capability                     | Render                                                                                                           | Railway                                                                                   | Fly.io                                                                    | Vercel + separate API/DB                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Long-lived Fastify API         | Native web service                                                                                               | Native service                                                                            | Native machine/app model                                                  | Function model for Fastify; separate long-lived API would be needed for closest behavior |
| Postgres                       | Managed Postgres; internal URL and private networking in same region                                             | SSL-enabled Postgres service, private by default, optional public TCP proxy               | Managed Postgres with backups/HA; some operational tooling still evolving | External managed Postgres required                                                       |
| Secrets                        | Environment variables, secret files, environment groups; protected environments                                  | Service/shared variables and secrets; staged changes                                      | App secrets; exact account policy to verify                               | Environment-scoped variables and preview protection                                      |
| Staging / previews             | Project environments; disposable preview environments on eligible plans                                          | Environments and PR environments; PR resources are billable                               | App/region workflow; preview pattern is more user-designed                | First-class Git/PR previews and promotion                                                |
| HTTPS / domain                 | Custom domains with managed TLS and HTTP-to-HTTPS redirect                                                       | Public service domains/custom domains; account setup required                             | Certificates and domains; account setup required                          | Managed HTTPS and domains                                                                |
| Health / readiness             | HTTP health checks; failed deploy is not routed; `/ready` is app-defined                                         | Healthcheck is deploy-time rather than continuous in the documented multi-region guidance | Health checks and deployment strategies                                   | Deployment checks and function health behavior                                           |
| Rollback                       | Dashboard/API rollback to a prior successful deploy                                                              | Rollback to a prior deployment                                                            | Rolling, immediate, canary, and blue/green strategies                     | Promote staged deployment or instant rollback                                            |
| Database recovery              | Paid Postgres continuous backup/PITR plus logical backups; retention depends on plan                             | Volume backups, PITR, and logical dumps; documented restore-to-scratch drill              | Managed Postgres automatic backups/recovery and HA                        | Database recovery is delegated to the chosen external provider                           |
| Cost model                     | Plan/resource based; free services are for testing and spin down; current amount must be checked at account time | Free allowance, then usage-based; Hobby and Pro plans documented                          | Usage/resource based, with managed Postgres pricing                       | Plan/function/usage based; separate API and DB add cost/complexity                       |
| Turkey / nearest listed region | Frankfurt is the nearest listed Render region; Turkey/Istanbul is not listed                                     | EU West Amsterdam is the nearest listed Railway region; Turkey/Istanbul is not listed     | Region placement must be checked in the current account/docs              | Edge/function/database placement must be checked; no single-region equivalence assumed   |

## Official documentation used

- [Render web services](https://render.com/docs/web-services), [health checks](https://render.com/docs/health-checks), [deploys](https://render.com/docs/deploys), and [rollbacks](https://render.com/docs/rollbacks)
- [Render PostgreSQL connections](https://render.com/docs/postgresql-creating-connecting), [backups](https://render.com/docs/postgresql-backups), [projects/environments](https://render.com/docs/projects), [regions](https://render.com/docs/regions), [custom domains](https://render.com/docs/custom-domains), [preview environments](https://render.com/docs/preview-environments), and [Blueprint specification](https://render.com/docs/blueprint-spec)
- [Render Node version selection](https://render.com/docs/node-version) and [current pricing](https://render.com/pricing)
- [Railway pricing](https://docs.railway.com/pricing), [PostgreSQL](https://docs.railway.com/databases/postgresql), [backups and restores](https://docs.railway.com/guides/postgres-backups-restores), [deployment rollback](https://docs.railway.com/deployments/deployment-actions), [variables](https://docs.railway.com/variables), [regions](https://docs.railway.com/deployments/regions), [IaC/config direction](https://docs.railway.com/config-as-code), and [CLI deployment](https://docs.railway.com/cli/deploying)
- [Fly.io Managed Postgres](https://fly.io/docs/mpg/), [backup and restore](https://fly.io/docs/postgres/managing/backup-and-restore/), [deployment strategies](https://fly.io/docs/launch/deploy/), [health checks](https://fly.io/docs/reference/health-checks/), and [pricing](https://fly.io/docs/about/pricing/)
- [Vercel Fastify](https://vercel.com/docs/frameworks/backend/fastify), [Fastify guide](https://vercel.com/kb/guide/ship-a-fastify-app-on-vercel), [promotion](https://vercel.com/docs/deployments/promoting-a-deployment), [runtimes](https://vercel.com/docs/functions/runtimes), [deployment protection](https://vercel.com/docs/deployment-protection), [Git previews](https://vercel.com/docs/git), and [deployment checks](https://vercel.com/docs/deployment-checks)

## Account-bound items deliberately left unverified

No provider account or remote Git origin is configured in this workspace. Consequently, the following remain unknown rather than inferred:

- actual account plan, invoice, quota, and organization policy;
- real staging app URL, domain, TLS certificate, logs, alerting, and deploy history;
- real staging database identifier, backup schedule, restore result, and connection policy;
- GitHub checks, branch protection, preview behavior, and secret bindings;
- latency from Turkey and data-residency requirements;
- any production resource or production access path.

The comparison is a technical recommendation. It is not a provider signup, binding, deploy, migration, or production go-live approval.
