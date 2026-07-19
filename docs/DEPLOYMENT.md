<!-- generated-by: gsd-doc-writer -->
# Deployment

arcpedia has two independent deployment paths: a **Cloudflare Workers** production
deployment (the primary target, driven by GitHub Actions) and a **Docker /
Docker Compose** self-hosting path for running your own instance. A third,
unrelated pipeline publishes the project's growth journal as a static site to
GitHub Pages.

<!-- VERIFY: exact production URL and Cloudflare account/subdomain — README.md references both arcpedia.arclumen.de and arcpedia.yuanhao-li.workers.dev in different places; docs/ARCHITECTURE.md flags the same discrepancy -->

## Deployment Targets

| Target | Mechanism | Config file(s) | Trigger |
|---|---|---|---|
| Cloudflare Workers (main app) | `@opennextjs/cloudflare` build + `wrangler deploy` | `wrangler.jsonc`, `open-next.config.ts` | Push to `main` (path-filtered) or manual dispatch — `.github/workflows/deploy-cloudflare.yml` |
| Cloudflare Workers (task-consumer) | `wrangler deploy --config workers/task-consumer/wrangler.jsonc` | `workers/task-consumer/wrangler.jsonc` | Same workflow, deployed as a second step immediately after the main Worker |
| Docker / Docker Compose (self-hosted) | `docker compose up -d --build` | `Dockerfile`, `docker-compose.yml` | Manual, operator-run |
| Journal static site (GitHub Pages) | `node journal-site/build.mjs` + `peaceiris/actions-gh-pages` | `journal-site/`, `.github/workflows/deploy-journal-pages.yml` | Push to `main` touching `.arc/journal.md` or `journal-site/**`, or manual dispatch |
| Cloudflare infra provisioning (one-time/idempotent) | `scripts/setup-cloudflare.sh` | none (generates `wrangler.toml`) | Manual dispatch only — `.github/workflows/infra-setup.yml` |

### Cloudflare Workers (primary)

Production runs the Next.js app on **Cloudflare Workers** via
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare). The build output
is deployed with `wrangler deploy --config wrangler.jsonc`. The Worker declares
these bindings in `wrangler.jsonc`:

- `arcpedia_BUCKET` — R2 bucket (`arcpedia-raw`), primary storage for wiki
  pages, raw sources, and assets
- `arcpedia_CONFIG` — KV namespace, config + derived indexes
- `arcpedia_SEARCH` — KV namespace, BM25 search-token cache
- `arcpedia_VECTORIZE` / `VECTORIZE` — Vectorize index (`arcpedia-embeddings`),
  semantic search embeddings (optional)
- `AI` — Workers AI binding, used for `bge-m3` embeddings
- `TASK_QUEUE` — Queues producer binding for the `arcpedia-tasks` queue
- `ASSETS` — static asset binding serving `.open-next/assets`

A second, standalone Worker (`workers/task-consumer`) is deployed alongside
the main app. It consumes the `arcpedia-tasks` Cloudflare Queue and a daily
cron (`0 6 * * *`, see `workers/task-consumer/wrangler.jsonc` `triggers.crons`),
POSTing tasks back to the main Worker's `/api/tasks/run` and `/api/tasks/scan`
endpoints. It intentionally imports no application code, so it can run as a
plain Queues consumer without the OpenNext request context.

### Docker / Docker Compose (self-hosted)

See `DEPLOY.md` (project root) for the full self-hosting walkthrough. In
summary:

```sh
git clone https://github.com/MKonovalov/arcpedia.git
cd arcpedia
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
docker compose up -d
```

`Dockerfile` is a three-stage build (`deps` → `build` → `runner`) based on
`node:22-alpine`, running `pnpm build` then `npx next start` as a non-root
`nextjs` user, exposing port `3000`. `docker-compose.yml` maps host port
`3000` to the container, mounts two named volumes (`wiki-data` →
`/app/wiki`, `raw-data` → `/app/raw`), and loads environment variables from
a local `.env` file (`env_file: .env`).

The Docker path uses the **filesystem storage provider** (writing to
`/app/wiki` and `/app/raw` inside the container), not R2/KV/Vectorize — those
Cloudflare bindings only apply to the Workers deployment target. See
`docs/CONFIGURATION.md` for the `STORAGE_PROVIDER` auto-detection behavior.

### Journal static site (GitHub Pages)

`journal-site/build.mjs` (pure Node stdlib, no install step) renders
`.arc/journal.md` into a static site published to the **external** repo
`MKonovalov/arcpedia-journal`, `gh-pages` branch, under the `/journal`
subdirectory (`destination_dir: journal`, `keep_files: true` so it coexists
with another project's pages on the same repo). This is unrelated to the
Cloudflare app deployment.

## Build Pipeline

**Main app** (`.github/workflows/deploy-cloudflare.yml`), triggered on push to
`main` (path-filtered to `app/**`, `src/**`, `public/**`, `package.json`,
`pnpm-lock.yaml`, `next.config.*`, `open-next.config.*`, `wrangler.jsonc`,
`workers/**`) or manual `workflow_dispatch`:

1. Checkout, set up Node.js 22, set up pnpm (version resolved from the
   `packageManager` field in `package.json`).
2. `pnpm install --frozen-lockfile`.
3. Pull `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from Bitwarden
   Secrets Manager via `bitwarden/sm-action` (`cloud_region: eu`), then verify
   both are non-empty.
4. Build: `pnpm build:cloudflare` (runs `opennextjs-cloudflare build`), with
   `NEXT_PUBLIC_OWNER_HANDLE` inlined from the `vars.NEXT_PUBLIC_OWNER_HANDLE`
   repo variable (defaults to `arcpedia` if unset).
5. Deploy the main Worker: `npx wrangler deploy --config wrangler.jsonc`.
6. Deploy the task-consumer Worker: `npx wrangler deploy --config
   workers/task-consumer/wrangler.jsonc`.

The workflow has `concurrency: cloudflare-deploy-${{ github.ref }}` with
`cancel-in-progress: true`, so overlapping pushes to the same ref cancel the
older run, and a 20-minute job timeout.

There is no separate lint/test gate inside `deploy-cloudflare.yml` — it only
runs the build and deploy steps. Test and lint (`pnpm test`, `pnpm lint`) are
run by contributors locally and by the project's own review/build agent
workflows, not as a blocking pre-deploy CI step. <!-- VERIFY: whether any branch-protection rule external to this repo's workflow files requires tests to pass before merge to main -->

**Journal site** (`.github/workflows/deploy-journal-pages.yml`), triggered on
push to `main` touching `.arc/journal.md` or `journal-site/**`, or manual
dispatch: checkout, `node journal-site/build.mjs`, then publish
`journal-site/dist` to the external `arcpedia-journal` repo's `gh-pages`
branch using a `PAGES_PAT` secret (a GitHub personal access token with `repo`
scope on the target repo).

**Infra provisioning** (`.github/workflows/infra-setup.yml`), manual dispatch
only: installs dependencies, pulls Cloudflare credentials the same way as the
deploy workflow, then runs `./scripts/setup-cloudflare.sh` (idempotent —
creates R2 buckets, KV namespaces, and other resources if they don't already
exist) and uploads the generated `wrangler.toml` as a build artifact. This
does not deploy the app; it only provisions backing resources.

## Environment Setup

Full variable reference lives in `docs/CONFIGURATION.md`. For a production
Cloudflare deployment specifically:

- **Build-time secrets** (GitHub Actions repo secrets/variables, pulled via
  Bitwarden Secrets Manager): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
  <!-- VERIFY: these are referenced as vars.SM_CLOUDFLARE_API_TOKEN / vars.SM_CLOUDFLARE_ACCOUNT_ID Bitwarden secret names in deploy-cloudflare.yml; actual secret values live outside this repository -->
- **Build-time public var**: `NEXT_PUBLIC_OWNER_HANDLE`, sourced from the
  `NEXT_PUBLIC_OWNER_HANDLE` repo variable (falls back to `"arcpedia"`).
  `NEXT_PUBLIC_*` values are inlined at build time, so changing them requires
  a rebuild + redeploy, not just a runtime var change.
- **Runtime Worker vars** (declared in `wrangler.jsonc` `vars`, version
  controlled): `NEXT_PUBLIC_OWNER_HANDLE`, `AUTONOMOUS_MAINTENANCE`.
- **Runtime Worker secrets** (set with `wrangler secret put <NAME>`, not
  version controlled): required auth (`CLERK_SECRET_KEY`), at least one LLM
  provider key, and operational secrets such as `arcpedia_SERVICE_TOKEN` /
  `arcpedia_SERVICE_PRINCIPAL` (used by the task-consumer Worker's calls to
  `/api/tasks/run`) and `X_BEARER_TOKEN` (optional, for full-body X Article
  ingestion). <!-- VERIFY: complete inventory of secrets currently set on the live production Worker -->
- **task-consumer Worker** has its own `wrangler.jsonc` with a `vars.arcpedia_URL`
  pointing at `https://arcpedia.arclumen.de` and requires the same
  `arcpedia_SERVICE_TOKEN` secret, set separately via
  `wrangler secret put arcpedia_SERVICE_TOKEN --config workers/task-consumer/wrangler.jsonc`.

For the Docker path, all configuration is supplied via a single `.env` file
consumed by `docker-compose.yml`'s `env_file: .env` directive — see `DEPLOY.md`
and `docs/CONFIGURATION.md`.

## Rollback Procedure

No explicit rollback step is defined in the repository's CI workflows.

- **Cloudflare Workers**: Wrangler retains a deployment history per Worker.
  An operator can list and roll back to a previous deployment with the
  Wrangler CLI (`wrangler deployments list` / `wrangler rollback`) or via the
  Cloudflare dashboard. <!-- VERIFY: exact wrangler subcommand syntax and availability depends on the installed wrangler version (package.json pins ^4.92.0) and Cloudflare account configuration -->
  Alternatively, revert the offending commit on `main` and let
  `deploy-cloudflare.yml` redeploy the previous build.
- **task-consumer Worker**: same mechanism — redeploy from a reverted commit,
  or use Wrangler's deployment history for `workers/task-consumer/wrangler.jsonc`.
- **Docker self-hosted**: `git checkout <previous-tag-or-commit>` followed by
  `docker compose up -d --build` rebuilds and restarts from the prior source.
  Data in the `wiki-data` / `raw-data` volumes is unaffected by a rollback.
- **Journal site**: `keep_files: true` means old published files are not
  wiped on each publish; a bad journal build can be corrected by fixing
  `.arc/journal.md` (or `journal-site/`) and pushing again, which re-runs
  `deploy-journal-pages.yml`.

## Monitoring

`wrangler.jsonc` enables Worker observability for the main app
(`"observability": { "enabled": true }`), which persists Worker logs
(errors/warnings — e.g. from illustration generation) so they can be queried
after the fact via `wrangler tail` or the Cloudflare dashboard, rather than
only live-streamed. The task-consumer Worker's own logs (queue consumption,
cron scan results) can be tailed the same way:

```sh
pnpm exec wrangler tail --config workers/task-consumer/wrangler.jsonc
```

Client-side page-view analytics are handled by **PostHog**
(`posthog-js` dependency, `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST`
env vars) — pageviews only, cookieless, no session replay or autocapture. See
`docs/CONFIGURATION.md` for details.

No server-side error-tracking or APM tool (e.g. Sentry, Datadog, New Relic)
is present in `package.json` dependencies as of this writing.
<!-- VERIFY: whether an external monitoring/alerting dashboard is configured outside this repository -->
