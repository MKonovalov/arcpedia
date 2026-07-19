<!-- generated-by: gsd-doc-writer -->
# Development

This document covers local development setup, build/test commands, code style, and the
branch/PR workflow for contributing to arcpedia.

## Local Setup

arcpedia is a single-package pnpm project (Next.js 15 App Router, TypeScript). There is no
monorepo workspace split — `pnpm-workspace.yaml` declares only `packages: ['.']` — and no
separate build step is required before starting the dev server.

1. **Clone and install:**
   ```bash
   git clone https://github.com/MKonovalov/arcpedia.git
   cd arcpedia
   pnpm install
   ```
   Package manager is pinned via the `packageManager` field in `package.json`
   (`pnpm@9.15.9`); `corepack enable` will pick this up automatically.

2. **Configure environment:**
   ```bash
   cp .env.example .env.local
   ```
   Fill in at minimum `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (required —
   the app returns HTTP 500 on every request, including reads, without them) and one LLM
   provider key (e.g. `ANTHROPIC_API_KEY` or `DEEPSEEK_API_KEY`) to enable ingest/query/chat
   features. See `docs/CONFIGURATION.md` for the full variable reference, defaults, and
   per-environment override behavior (`.env.local` vs `.dev.vars` vs Docker vs Cloudflare).

3. **Run the dev server:**
   ```bash
   pnpm dev
   ```
   Starts `next dev --turbopack` on `http://localhost:3000`. Local storage defaults to the
   filesystem provider, reading/writing under `data/` (`DATA_DIR`), with wiki pages in
   `wiki/` and ingested sources in `raw/`.

No separate compile/watch process is needed in dev — Next.js handles TypeScript
transpilation and hot reload. A production build (`pnpm build`) is only required to run
`pnpm start` or to package the Cloudflare Worker (`pnpm build:cloudflare`).

## Build Commands

All commands are run with `pnpm <script>` from the repo root (`package.json` `scripts`):

| Command | Description |
|---|---|
| `pnpm dev` | Start the Next.js dev server with Turbopack (`next dev --turbopack`). |
| `pnpm build` | Production Next.js build (`next build`). |
| `pnpm start` | Serve the production build (`next start`) — run `pnpm build` first. |
| `pnpm build:cloudflare` | Build the app for the Cloudflare Workers/OpenNext deploy target (`opennextjs-cloudflare build`). |
| `pnpm lint` | Run ESLint (`eslint`) over the project. |
| `pnpm test` | Run the Vitest suite once (`vitest run`). |
| `pnpm cli` | Run the CLI entry point (`tsx src/cli.ts`) — ingest/query/lint/read/create/update/delete/publish/list/history/status over stdio. See `pnpm cli help`. |
| `pnpm mcp` | Run the MCP (Model Context Protocol) server over stdio (`tsx src/mcp.ts`) for agent clients. |
| `pnpm journal:build` | Build the static public agent-growth journal site (`journal-site/build.mjs`). |
| `pnpm journal:preview` | Build then locally preview the journal site (`journal-site/preview.mjs`). |

There is no separate `format` script — code style is enforced by ESLint only (see below).

## Code Style

- **Linter:** ESLint, configured in `eslint.config.mjs` using the flat-config format. It
  extends `next/core-web-vitals` and `next/typescript` (via `@eslint/eslintrc`'s
  `FlatCompat`), plus one local rule override: `@typescript-eslint/no-unused-vars` is a
  warning, with `_`-prefixed args/vars ignored. `node_modules/`, `.next/`, `.open-next/`,
  `out/`, `build/`, `next-env.d.ts`, and `workers/` are excluded from linting.
  Run it with:
  ```bash
  pnpm lint
  ```
- **Formatter:** No Prettier or Biome config is present in the repo, and there is no
  `.editorconfig`. Formatting is whatever ESLint's `next/core-web-vitals` /
  `next/typescript` rule sets enforce; there is no separate format-on-save tool configured.
- **TypeScript:** `strict: true` in `tsconfig.json`, target `ES2018`, module resolution
  `bundler`, path alias `@/*` → `./src/*`. `workers/` (the standalone `task-consumer`
  Worker) is excluded from the root `tsconfig.json` — it does not share `src/lib` or its
  type context (see `docs/ARCHITECTURE.md`).
- **Type checking is not a separate CI/lint step** — `tsconfig.json` has `noEmit: true`, and
  type errors otherwise surface during `pnpm build` / `pnpm build:cloudflare` or in-editor.

## Branch Conventions

- **Default branch:** `main`.
- **Automated agent branches:** arcpedia is built by a scheduled multi-agent pipeline (see
  `README.md`); its pull requests come from branches prefixed `arc/…`. The `arc Review`
  workflow (`.github/workflows/review.yml`) only auto-reviews PRs whose head ref starts with
  `arc/` and originates from this repository (not a fork).
- **Human/manual branches:** No branch naming convention is documented for manual
  contributions. Use a descriptive branch name (e.g. `fix/short-description` or
  `feat/short-description`) and open a PR against `main`.
- **Commit messages:** Recent history follows a loose Conventional Commits style —
  `fix(scope): summary`, `feat(scope): summary` — though it is not enforced by tooling
  (no commitlint or commit-msg hook is configured).

## PR Process

- There is no `.github/PULL_REQUEST_TEMPLATE.md` in the repo. `CONTRIBUTING.md` documents
  the contribution flow: contributors file an issue first rather than opening a PR directly;
  only the Build agent opens PRs, and the Review workflow (`.github/workflows/review.yml`)
  gates merges to `arc/`-prefixed branches from this repository. See `CONTRIBUTING.md` for
  the full issue-triage/PR flow, coding standards, and lint/test requirements.
- No GitHub Actions workflow runs `pnpm lint` or `pnpm test` on pull requests — CI in this
  repo is oriented around the automated `arc` agent pipeline (build, review, office-hour,
  research, PM, architect workflows in `.github/workflows/`), not a traditional PR-gate CI.
  Run `pnpm lint` and `pnpm test` locally before opening a PR; there is no automated
  enforcement otherwise.
- `pnpm build:cloudflare` is exercised in `.github/workflows/deploy-cloudflare.yml` on
  deploy, not on every PR — a build/type error will only surface at deploy time unless you
  run `pnpm build` locally first.
- Target the `main` branch. Once merged, deployment to Cloudflare Workers is handled by
  `.github/workflows/deploy-cloudflare.yml` (see `docs/ARCHITECTURE.md` for the deployment
  topology).
