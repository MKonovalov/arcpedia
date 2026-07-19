<!-- generated-by: gsd-doc-writer -->
# Architecture

## System overview

arcpedia is a full-stack Next.js 15 (App Router) application that implements an
"LLM wiki" — a persistent, LLM-maintained knowledge base built from ingested
sources (URLs, pasted text, PDFs, images, YouTube transcripts, X/Twitter
posts). The system exposes four core operations — **ingest**, **query**,
**lint**, and **browse** — over a shared markdown-with-frontmatter page store,
plus an agent-facing surface (REST API + a Model Context Protocol server) so
both humans and autonomous agents can read and write the same knowledge base.

The architectural style is a layered monolith: a Next.js app router serves
both the UI (React Server/Client Components) and a large `/api` surface, all
of it built on top of a storage-abstraction layer (`src/lib/storage`) that
runs unmodified against either the local filesystem (dev) or Cloudflare R2/KV/
Vectorize (production). LLM calls (generation and embeddings) are
provider-pluggable via the Vercel AI SDK, so the same code path runs against
Anthropic, OpenAI, Google, DeepSeek, OpenRouter, or a local Ollama server.

## Component diagram

```
                         ┌─────────────────────────────┐
                         │   Browser / CLI / MCP client │
                         └───────────────┬───────────────┘
                                         │ HTTP
                 ┌───────────────────────▼────────────────────────┐
                 │            src/middleware.ts (Clerk)            │
                 │   gates every mutating /api/** request on a     │
                 │   signed-in session or an in-route token        │
                 └───────────────────────┬────────────────────────┘
                                         │
        ┌────────────────────────────────▼───────────────────────────┐
        │                    src/app  (Next.js App Router)             │
        │  ┌───────────────┐   ┌────────────────┐   ┌───────────────┐ │
        │  │  UI routes     │   │  /api routes    │   │ /api/mcp      │ │
        │  │  (wiki, query, │   │  (ingest, wiki, │   │ (remote MCP   │ │
        │  │  lint, ingest, │   │  lint, query,   │   │  over HTTP)   │ │
        │  │  settings, u/…)│   │  agents, vaults)│   │               │ │
        │  └───────┬───────┘   └────────┬────────┘   └───────┬───────┘ │
        └───────────┼────────────────────┼─────────────────────┼────────┘
                     │                    │                     │
                     ▼                    ▼                     ▼
        ┌───────────────────────────────────────────────────────────────┐
        │                        src/lib  (core logic)                   │
        │  ingest.ts · query.ts · lint.ts · lint-checks.ts · search.ts   │
        │  wiki.ts · lifecycle.ts · silo.ts · vault.ts · reconcile.ts    │
        │  embeddings.ts · llm.ts · providers.ts · auth.ts · authz.ts    │
        │  bm25.ts · graph-build.ts · sources.ts · agents.ts · tasks.ts  │
        └───────────────┬───────────────────────────────┬────────────────┘
                         │                               │
                         ▼                               ▼
        ┌───────────────────────────────┐   ┌───────────────────────────┐
        │   src/lib/storage (provider)   │   │  Vercel AI SDK providers   │
        │  FilesystemStorageProvider      │   │  Anthropic / OpenAI /      │
        │  (dev) ↔ R2StorageProvider      │   │  Google / DeepSeek /       │
        │  (prod: R2 + KV + Vectorize)    │   │  OpenRouter / Ollama /     │
        │                                 │   │  Workers AI (bge-m3)       │
        └───────────────┬────────────────┘   └───────────────────────────┘
                         │
                         ▼
        ┌───────────────────────────────────────────────────────────────┐
        │     Cloudflare Workers runtime (production deploy target)      │
        │  R2 (arcpedia-raw) · KV (config + BM25 cache) · Vectorize       │
        │  (embeddings) · Workers AI (bge-m3) · Queues (arcpedia-tasks)   │
        └───────────────┬───────────────────────────────────────────────┘
                         │ queue messages
                         ▼
        ┌───────────────────────────────────────────────────────────────┐
        │   workers/task-consumer (standalone Worker, no src/lib import) │
        │   drains arcpedia-tasks → POSTs /api/tasks/run on the main app │
        │   + daily cron → POSTs /api/tasks/scan (autonomous maintenance)│
        └───────────────────────────────────────────────────────────────┘
```

## Data flow

A typical **ingest** request (`POST /api/ingest`) moves through the system as
follows:

1. `src/middleware.ts` checks the HTTP method and path. Writes to `/api/**`
   require a Clerk session, except a documented allowlist of routes
   (including `/api/ingest`) that authenticate in-route with a Clerk session
   OR the system service token (see `authenticatesInRoute()`).
2. The route handler (`src/app/api/ingest/route.ts`) resolves the acting
   `Principal` (`src/lib/auth.ts`) and delegates to `src/lib/ingest.ts`.
3. `ingest.ts` fetches the source content (`fetch.ts`, `youtube.ts`,
   `x-post.ts`, or `vision.ts` for images/PDFs), computes a content hash for
   dedup (`source-index.ts`), and checks the alias index
   (`alias-index.ts`) to resolve the target page — either an existing page
   (by slug or alias match) or a new one.
4. If new content, `callLLM()` (`llm.ts`) synthesizes a wiki page from the
   source using the configured LLM provider (`providers.ts`, `config.ts`
   auto-detect the provider from environment variables).
5. The page is written via `wiki.ts` / `lifecycle.ts`, which serialize
   frontmatter (`frontmatter.ts`, `sources.ts`) and persist through the
   storage abstraction (`getStorage()` in `src/lib/storage`) — filesystem
   locally, R2 in production. Silo-aware writes (`silo.ts`) place the page
   under the owning tenant's folder (`tenants/<tenant>/wiki/<slug>.md`).
6. Side effects run: the page index (`page-index.ts`), backlink index
   (`backlink-index.ts`), owner index (`owner-index.ts`), and embeddings
   (`embeddings.ts`, upserted into Vectorize or a local JSON blob) are
   updated, and an entry is appended to `wiki/log.md`.

A **query** request (`POST /api/query` or `/api/query/stream`) follows a
parallel path: `query.ts` runs hybrid retrieval — BM25 (`bm25.ts`) plus vector
similarity (`embeddings.ts`), combined with Reciprocal Rank Fusion — over
readable pages (`listReadableWikiPages()`, gated by `authz.ts`), then calls
the LLM to synthesize a cited answer, optionally streaming tokens back to the
client.

A **lint** request (`/api/lint`, optionally `/api/lint/fix`) runs the checks
registered in `lint-checks.ts` (orphan pages, stale pages, broken links,
missing cross-references, contradictions, duplicate entities, disputed pages,
etc.) against the full page corpus and returns a `LintResult`; `lint-fix.ts`
applies deterministic fixes for a subset of checks.

Autonomous maintenance is queue-driven: the standalone
`workers/task-consumer` Worker drains the `arcpedia-tasks` Cloudflare Queue
and POSTs each task to `/api/tasks/run` on the main app (which has the full
`src/lib` and OpenNext request context); its own daily cron POSTs
`/api/tasks/scan`, which scans the commons for pages needing reconciliation or
re-ingest and enqueues `maintain` tasks (gated behind the
`AUTONOMOUS_MAINTENANCE` env var, dry-run by default).

## Key abstractions

- **`StorageProvider`** (`src/lib/storage/types.ts`) — the interface every
  filesystem-touching module in `src/lib` goes through: text files, binary
  assets, optimistic-concurrency reads/writes (etag-based), derived JSON
  indexes, and embedding upsert/query. Two implementations:
  `FilesystemStorageProvider` (`src/lib/storage/filesystem.ts`, local dev) and
  `R2StorageProvider` (`src/lib/storage/r2.ts`, production — backed by R2, KV,
  and Vectorize). `getStorage()` (`src/lib/storage/index.ts`) auto-detects the
  runtime and returns a singleton; `initCloudflareStorage(env)` must be called
  once per request on Workers to inject bindings.
- **Wiki page lifecycle** (`src/lib/wiki.ts`, `src/lib/lifecycle.ts`) — reads,
  writes, and side-effect orchestration (index/backlink/owner updates, log
  append) for wiki pages. Frontmatter is parsed/serialized by
  `src/lib/frontmatter.ts`; the full field spec (confidence, expiry,
  valid_from, owner, visibility, authors, contributors, disputed, etc.) is
  documented in `SCHEMA.md`.
- **Tenant silos** (`src/lib/silo.ts`) — each owner's pages live primarily
  under `tenants/<tenant>/…`, a self-contained, Obsidian-servable vault; reads
  try the silo path first and fall back to a legacy flat path during an
  in-progress migration (`migrate-to-tenants.ts`).
- **Vaults** (`src/lib/vault.ts`) — per-user named collections that are
  *references* into the single collective commons, not copies; curating a
  page adds its slug to a vault without duplicating storage.
- **Authorization** (`src/lib/authz.ts`, `src/lib/auth.ts`) — `Principal`
  resolves the signed-in Clerk user (or a service/agent token) for
  attribution; `authz.ts` is the single fail-closed read predicate ("may this
  principal read this page?"), mirroring `middleware.ts` as the single write
  gate. Pages are public by default; `visibility: "private"` restricts reads
  to the owner.
- **LLM provider abstraction** (`src/lib/llm.ts`, `src/lib/providers.ts`,
  `src/lib/config.ts`) — `callLLM()` and `hasLLMKey()` wrap the Vercel AI SDK
  across six providers (Anthropic, OpenAI, Google, DeepSeek, OpenRouter,
  Ollama), auto-detected from environment variables with retry/backoff
  built in. `src/lib/embeddings.ts` is a parallel, independently
  configurable abstraction for embedding generation (OpenAI, Google, Ollama,
  or Workers AI `bge-m3`).
- **Hybrid search** (`src/lib/bm25.ts`, `src/lib/embeddings.ts`,
  `src/lib/search.ts`) — BM25 lexical scoring over a CJK-aware tokenizer,
  combined with vector similarity via Reciprocal Rank Fusion, powering both
  `/api/query` and `/api/wiki/search`.
- **Lint engine** (`src/lib/lint.ts`, `src/lib/lint-checks.ts`,
  `src/lib/lint-fix.ts`) — a registry of independent checks
  (`ALL_CHECK_TYPES`) that scan the corpus for structural and content issues;
  a subset are auto-fixable.
- **MCP server** (`src/mcp.ts` for stdio, `src/app/api/mcp/route.ts` +
  `src/lib/mcp-http.ts` for the remote HTTP transport) — exposes ingest,
  query, lint, and page CRUD as MCP tools so external agents can operate on
  the wiki directly, authenticated via a per-agent or service Bearer token.
- **Task queue** (`src/lib/tasks.ts`, `workers/task-consumer`) —
  `enqueueTask()` sends to the `TASK_QUEUE` Cloudflare Queues producer
  binding (no-ops off the Workers runtime); the standalone consumer Worker
  dispatches queued work back to `/api/tasks/run` on the main app.

## Directory structure rationale

```
src/
  middleware.ts   # Clerk auth gate — the single write-authorization checkpoint
  cli.ts          # CLI entry point (pnpm cli …) — ingest/query/lint/etc. over stdio
  mcp.ts          # MCP server entry point (pnpm mcp) — stdio transport for agents
  app/            # Next.js App Router: UI pages + the full /api route surface
    api/          # REST endpoints (ingest, wiki, query, lint, agents, vaults, mcp, tasks…)
    wiki/, query/, lint/, ingest/, settings/, u/, share/, vault/  # UI routes
  lib/            # Framework-agnostic core logic — the bulk of the system's behavior
    storage/      # StorageProvider abstraction (filesystem vs. Cloudflare R2/KV/Vectorize)
    vendor/       # Vendored third-party code
  components/     # React components shared across UI routes
  hooks/          # React hooks
raw/              # Ingested raw sources (gitignored; immutable; R2 in prod)
wiki/             # LLM-generated wiki pages, index.md, log.md (gitignored; R2 in prod)
tenants/          # Per-owner silo storage (tenants/<handle>/wiki, raw, query-history)
workers/
  task-consumer/  # Standalone Cloudflare Worker: drains the agent task queue + daily cron
journal-site/     # Static site generator for the public agent-growth journal
docs/             # Project documentation (this file, plus superpowers plans/specs)
scripts/          # Operational/deploy scripts
data/             # Local dev data directory (filesystem storage root)
```

The split between `src/app` and `src/lib` follows Next.js App Router
convention but is deliberate here: `src/lib` contains no framework-specific
code and is imported identically by the Next.js routes, the CLI (`cli.ts`),
and the MCP server (`mcp.ts`), so the same ingest/query/lint logic runs across
all three surfaces. `tenants/` and the `silo`/`vault` split exist because
arcpedia models a single collective **commons** with per-owner **vaults** as
reference lenses on top, rather than per-user copies of content (see
`arcpedia-concept.md`). `workers/task-consumer` is a separate Worker (not
folded into the main OpenNext build) specifically so it gets a first-class
Cloudflare Queues consumer without importing `src/lib` (which would
transitively require Clerk and the OpenNext request context it cannot
provide).

## Deployment topology

<!-- VERIFY: exact production URL and Cloudflare account/subdomain — README references both arcpedia.arclumen.de and arcpedia.yuanhao-li.workers.dev in different places -->

Production runs on **Cloudflare Workers** via `@opennextjs/cloudflare`
(`pnpm build:cloudflare && wrangler deploy`, `wrangler.jsonc`). Bindings:
`arcpedia_BUCKET` (R2, primary storage for wiki pages/raw sources/assets),
`arcpedia_CONFIG` (KV, config + derived indexes), `arcpedia_SEARCH` (KV, BM25
token cache), `arcpedia_VECTORIZE` / `VECTORIZE` (Vectorize, embeddings), `AI`
(Workers AI, `bge-m3` embeddings), and `TASK_QUEUE` (Queues producer for
`arcpedia-tasks`). Local development uses the filesystem storage provider
against the `data/` directory instead.
