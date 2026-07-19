<!-- generated-by: gsd-doc-writer -->
# API

arcpedia exposes a REST surface under `/api/**` (Next.js App Router route handlers in
`src/app/api/`) for the web UI, plus a Model Context Protocol (MCP) server for external
agents. This document covers both. For environment variables referenced below, see
[`CONFIGURATION.md`](CONFIGURATION.md).

## Authentication

Two credential types authenticate requests, and most routes accept either:

1. **Clerk session** — the default for human users of the web UI. `src/middleware.ts`
   requires a signed-in Clerk session for every mutating (`POST`/`PUT`/`PATCH`/`DELETE`)
   request to `/api/**`, *except* a documented allowlist of routes that authenticate
   in-route instead (listed below). Reads (`GET`/`HEAD`) are always public — arcpedia is
   a public observer surface by default. Route handlers resolve the acting user via
   `getPrincipal()` (`src/lib/auth.ts`), which reads the Clerk session and never trusts a
   client-supplied author field.

2. **Bearer token** — for non-human callers (scheduled jobs, the task-consumer Worker,
   external agent runtimes, and remote MCP clients). Sent as `Authorization: Bearer
   <token>`. Three kinds of tokens exist:
   - **Service token** (`arcpedia_SERVICE_TOKEN` / `arcpedia_SERVICE_PRINCIPAL` env vars,
     compared in constant time) — arcpedia's own trusted automation (the task-consumer
     Worker, cron jobs, admin scripts). Resolves to one fixed principal handle.
     `getServicePrincipal(req)` in `src/lib/auth.ts`.
   - **Per-agent token** — minted per agent via `POST /api/agents/[id]/token`, shown once
     at generation (only its hash is stored). Self-scoping: it can only act as the agent
     whose id it carries. `verifyAgentToken()` in `src/lib/agents.ts`.
   - Both resolve to a `Principal { id, handle }` used for write attribution and
     authorization, exactly like a Clerk session.

Routes that authenticate **in-route** (exempt from the middleware's blanket Clerk gate,
but still reject unauthenticated callers inside the handler — see `authenticatesInRoute()`
in `src/middleware.ts`):

| Route | Accepted credential |
|---|---|
| `POST /api/ingest`, `/api/ingest/batch`, `/api/ingest/image`, `/api/ingest/pdf`, `/api/ingest/reingest`, `/api/ingest/x-mention` | Clerk session OR service token |
| `POST /api/agents/seed` | Clerk session OR service token |
| `POST /api/agents/[id]/ingest`, `POST /api/agents/[id]/publish` | the agent's own per-agent token, or the service token (system automation, target agent must exist) |
| `POST /api/wiki`, `PUT/PATCH/DELETE /api/wiki/[slug]`, `POST /api/wiki/[slug]/revisions` | Clerk session OR service token |
| `POST /api/tasks/run`, `POST /api/tasks/scan` | service token ONLY (the task-consumer Worker / cron; no human ever calls these) |
| `POST /api/admin/migrate`, `POST /api/admin/rebuild-embeddings`, `POST /api/admin/reset` | service token (migrate also accepts the site owner's session) |
| `DELETE /api/admin/tenant/[handle]` | service token, the site owner, or the tenant's own owner |
| `POST /api/mcp` | Bearer token (per-agent or service) OR none (reads only) |

**Owner / admin gating** (beyond sign-in): some routes additionally require the caller to
be the configured site owner (`NEXT_PUBLIC_OWNER_HANDLE`) or listed in `ADMIN_HANDLES` —
see `src/lib/authz.ts` and `isOwnerHandle()` in `src/lib/owner.ts`. `POST /api/lint` and
`POST /api/lint/fix` are owner-only. Per-page write access beyond sign-in is governed by
`canWriteFrontmatter()` (`src/lib/authz.ts`): public pages are collectively writable by any
signed-in user; `visibility: "private"` pages are writable only by their owner (or an
admin, or the service principal). Read access follows the mirror predicate
`canReadFrontmatter()` — a private page a caller can't read returns `404` (not `403`), so
its existence is never leaked ("cloaking").

<!-- VERIFY: production Clerk instance / dashboard URL for this deployment -->

## Endpoints Overview

All paths are relative to the deployed origin (`https://arcpedia.arclumen.de` in
production <!-- VERIFY: canonical production URL -->, `http://localhost:3000` in local
dev). Auth column: **public** (no auth needed for reads), **session** (Clerk session, or
service token where noted), **token** (Bearer token only), **owner** (site owner /
`ADMIN_HANDLES` only).

### Wiki pages

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/wiki` | List all wiki pages (slug, title, summary). `?includeAgentPages=true` to include agent-scoped pages. | public (readability-filtered) |
| POST | `/api/wiki` | Create a new page. Body: `{ slug, content, tags? }`. `409` if slug exists. | session |
| DELETE | `/api/wiki/[slug]` | Delete a page. Realm-aware ACL (owner or public-commons write). | session |
| PUT | `/api/wiki/[slug]` | Replace a page's markdown body. Body: `{ content }`. `404` if the page doesn't exist. | session |
| PATCH | `/api/wiki/[slug]` | Update a page's frontmatter metadata only. Body: `{ metadata: {...}, author? }`. Rejects lifecycle-managed keys (`created`, `authors`, `sources`) with `400`. | session |
| GET | `/api/wiki/browse` | Server-side hybrid (BM25 + vector) search + pagination for the Browse UI. Query: `q`, `scope`, `tag`, `sort`, `page`, `pageSize`. | public |
| GET | `/api/wiki/search` | Full-text search with fuzzy fallback. Query: `q` (required), `scope`. | public |
| GET | `/api/wiki/graph` | Wiki link graph (`{ nodes, edges }`). Query: `scope`. | public |
| GET | `/api/wiki/export` | Download an Obsidian-compatible vault `.zip` of readable pages. Query: `scope` (`mine` or `owner:<handle>`). | public (readability-scoped) |
| POST | `/api/wiki/dataview` | Query pages by frontmatter fields. Body: `DataviewQuery`. Response: `{ results, total }`. | public |
| GET | `/api/wiki/templates` | Page templates parsed from `SCHEMA.md`. | public |
| GET | `/api/wiki/routes` | Map of `slug → canonical tenant`, over the caller's readable pages (builds `/u/<tenant>/<slug>` links client-side). | public (readability-filtered) |
| GET | `/api/wiki/[slug]/revisions` | List revisions, or with `?timestamp=<ms>` return one revision's content. | public (readability-gated) |
| POST | `/api/wiki/[slug]/revisions` | Revert to a prior revision. | session |
| GET | `/api/wiki/[slug]/discuss` | List discussion threads for a page. | public (readability-gated) |
| POST | `/api/wiki/[slug]/discuss` | Create a discussion thread. Body: `{ title, author, body }`. | session |
| GET | `/api/wiki/[slug]/discuss/[threadIndex]` | Get one thread. | public (readability-gated) |
| PATCH | `/api/wiki/[slug]/discuss/[threadIndex]` | Update thread state (e.g. resolve). | session |
| POST | `/api/wiki/[slug]/discuss/[threadIndex]/comments` | Add a comment. Body: `{ author, body, parentId? }`. Returns `201`. | session |
| POST | `/api/wiki/[slug]/discuss/[threadIndex]/ask-yoyo` | Enqueue a `reconcile` task so an agent addresses the thread asynchronously. | session |

### Ingest

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/ingest` | Ingest a URL or pasted text. Body: `{ url }` or `{ content, title?, tags?, sourceUrl?, sourceType? }`. Async — enqueues a job, returns `{ queued: true, jobId }` (or `{ slug, ... }` when run inline off-Workers). | session or service token |
| POST | `/api/ingest/batch` | Ingest up to `MAX_BATCH_URLS` URLs at once. Body: `{ urls: string[], tags? }`. | session or service token |
| POST | `/api/ingest/image` | Ingest an image by URL (JSON) or file upload (multipart). | session or service token |
| POST | `/api/ingest/pdf` | Ingest a PDF by URL (JSON) or file upload (multipart). | session or service token |
| POST | `/api/ingest/reingest` | Re-run ingest/synthesis for an existing page. Body: `{ slug }`. | session or service token, write-ACL on the page |
| POST | `/api/ingest/x-mention` | Ingest content triggered by an X/Twitter mention. | session or service token |
| GET | `/api/ingest/history` | Recent ingest ledger entries, readability-scoped. Query: `limit`. | public (readability-filtered) |
| GET | `/api/ingest/status/[jobId]` | Poll an async ingest job's outcome. Owner-gated (missing job and someone-else's job both `404`). | session (job owner) |

### Query (Ask)

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/query` | Ask a question over the readable commons. Body: `{ question, format?, scope? }`, `format` one of `prose`\|`table`\|`slides`\|`html`. Invokes the LLM — session required (cost guard). | session |
| POST | `/api/query/stream` | Same as `/api/query` but streams the LLM response as text, with an `X-Wiki-Sources` response header (percent-encoded JSON array of source slugs). | session |
| GET | `/api/query/demo` | Public, no-auth demo answering only the 3 whitelisted homepage sample questions. Cached in KV after the first computation. Query: `q`. | public |
| POST | `/api/query/save` | Save a query answer as a new wiki page. Body: `{ title, content, sources?, format? }`. | session |
| GET | `/api/query/history` | Recent query history for the caller. Query: `limit`. Anonymous callers get an empty list. | public (per-caller) |
| POST | `/api/query/history` | Append a query to history, or mark an entry saved. Body: `{ question, answer, sources, format? }` or a mark-saved payload. | session |

### Lint

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/lint` | Run lint checks (orphans, stale pages, broken links, contradictions, etc.) over the corpus. Body (optional): `{ checks?: string[], minSeverity? }`. | owner |
| POST | `/api/lint/fix` | Auto-fix a lint issue. Body: `{ type, slug, targetSlug? }` — supported `type`s: `missing-crossref`, `orphan-page`, `stale-index`, `empty-page`, `contradiction`. | owner |

### Agents

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/agents` | List all registered agents. | public |
| POST | `/api/agents` | Register a new agent. Body: `{ id, name, description }`. Creator becomes owner. `201`/`400`/`409`. | session |
| POST | `/api/agents/ensure` | Idempotently provision the signed-in user's personal arc (forked from the canonical base). Returns `{ provisioned: false }` if the base isn't seeded yet. | session |
| POST | `/api/agents/seed` | Seed/re-seed an agent with wiki pages per content section. Body: `{ id, name, description, sections: [...] }`. Idempotent; first seed claims ownership. | session or service token |
| GET | `/api/agents/[id]` | Get one agent profile. `404` if not found. | public |
| PUT | `/api/agents/[id]` | Update an agent profile. Owner-gated. | session (owner) |
| DELETE | `/api/agents/[id]` | Delete an agent. Owner-gated. | session (owner) |
| GET | `/api/agents/[id]/token` | Report whether a credential is set (never returns the secret). Owner-gated. | session (owner) |
| POST | `/api/agents/[id]/token` | Generate/rotate the agent's credential. Returns the raw token once. Owner-gated. | session (owner) |
| DELETE | `/api/agents/[id]/token` | Revoke the agent's credential. Owner-gated. | session (owner) |
| POST | `/api/agents/[id]/ingest` | Ingest a source into the agent's own knowledge (or, with `asOwner: true`, into the human owner's public content). Body: `{ url }` or `{ text, title? }` or `{ imageUrl }`, plus `sourceUrl?`, `asOwner?`, `vaultId?`. Async — returns `{ queued: true, jobId }`. | agent token or service token |
| POST | `/api/agents/[id]/publish` | Publish an agent-scoped page to the commons. Body: `{ slug }`. | agent token or service token |
| GET | `/api/agents/[id]/context` | Concatenate the agent's readable knowledge pages into one context blob. | public (readability-gated) |

### Vaults

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/vaults` | List the caller's own vaults. `?slug=<slug>` also returns which vaults already contain it. | session |
| POST | `/api/vaults` | Create a (public, v1) vault. Body: `{ name }`. Returns `201`. | session |
| PATCH | `/api/vaults/[id]` | Rename a vault. Owner-gated. | session (owner) |
| DELETE | `/api/vaults/[id]` | Delete a vault. Owner-gated. | session (owner) |
| GET | `/api/vaults/[id]/pages` | List enriched page entries in a vault. Owner-gated. | session (owner) |
| POST | `/api/vaults/[id]/pages` | Add (curate) a page into a vault. Owner-gated. | session (owner) |
| DELETE | `/api/vaults/[id]/pages` | Remove (uncurate) a page from a vault. Owner-gated. | session (owner) |

### Contributors

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/contributors` | All contributor profiles, sorted by edit count descending. `?handle=` or `?handles=a,b` to filter/batch. | public |
| GET | `/api/contributors/[handle]` | One contributor profile. `404` if zero activity. | public |

### Admin

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/admin/migrate` | Run (or dry-run) the per-tenant silo migration. Body: `{ dry: boolean }` (defaults to dry-run). | service token or site owner |
| POST | `/api/admin/reset` | **Destructive.** Wipe all wiki content (`wiki/`, `raw/`, `discuss/`, `tenants/`) for a from-scratch re-ingest; agent profiles/credentials and KV config are preserved. Body: `{ confirm: "wipe-content" }`. | service token only |
| POST | `/api/admin/rebuild-embeddings` | Re-embed every wiki page into the vector store. Runs on the read-only Workers runtime (unlike `/api/settings/rebuild-embeddings`). | service token only |
| DELETE | `/api/admin/tenant/[handle]` | Hard-delete a tenant's entire content. Query: `?confirm=<handle>` (must match). | service token, site owner, or the tenant's own owner |

### Tasks (internal — called only by `workers/task-consumer`)

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/tasks/run` | Execute one queued agent task. Status contract: `2xx` = ack, `4xx` = poison message (ack + drop, no retry), `5xx` = transient (consumer retries). | service token only |
| POST | `/api/tasks/scan` | Autonomous-maintenance producer — scans the wiki and enqueues `maintain` tasks. Dry-run unless `AUTONOMOUS_MAINTENANCE=on`. Query: `?dry=1` (force dry-run), `?cap=N` (override per-scan cap). | service token only |

### Settings & status

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/settings` | Effective LLM/embedding settings with source annotations. | public |
| PUT | `/api/settings` | Update the persisted config file. `403` when `isReadOnly()` (cloud deployments configure via env vars instead). | session |
| POST | `/api/settings/rebuild-embeddings` | Re-embed all pages from the Settings UI. Disabled on the read-only Workers runtime (use `/api/admin/rebuild-embeddings` instead). | session |
| GET | `/api/status` | LLM provider status: `{ configured, provider, model, embeddingSupport }`. | public |

### Raw sources & assets

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/raw/[slug]` | Return a raw ingested source as `text/plain`. `?source=<rawId>` for a specific snapshot, else the latest. | public (readability-gated) |
| GET | `/api/assets/[...path]` | Serve a binary asset (image) stored during ingest. Private-page assets are owner-only (`404`, not `403`, to avoid leaking existence); public-page assets skip auth entirely for performance. | public (readability-gated) |

### MCP (agent protocol)

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/mcp` | Stateless Streamable-HTTP JSON-RPC endpoint (`initialize`, `tools/list`, `tools/call`; batches up to `MCP_MAX_BATCH` = 20 messages). See below. | none (reads) / Bearer token (writes) |
| GET | `/api/mcp` | Always `405` — the transport is POST-only, no SSE/session stream. | — |

## Request/Response Formats

Most routes accept and return `application/json`. A representative example per pattern:

**Simple create (`POST /api/wiki`):**
```json
// Request
{ "slug": "reciprocal-rank-fusion", "content": "# Reciprocal Rank Fusion\n\n...", "tags": ["search"] }

// 201 Response
{ "slug": "reciprocal-rank-fusion", "owner": "alice", "updatedSlugs": ["bm25"] }
```

**Async job (`POST /api/ingest`):**
```json
// Request
{ "url": "https://example.com/paper" }

// 200 Response (queued — Cloudflare Workers runtime)
{ "queued": true, "jobId": "b1f2c3d4-..." }

// 200 Response (inline — local dev / off-Workers fallback)
{ "primarySlug": "example-paper", "queued": false, ... }
```
Poll `GET /api/ingest/status/[jobId]` for the async outcome.

**Query (`POST /api/query`):**
```json
// Request
{ "question": "How does arcpedia rank search results?", "format": "prose" }

// 200 Response
{ "answer": "...", "sources": ["bm25", "reciprocal-rank-fusion"], "format": "prose" }
```

**MCP JSON-RPC (`POST /api/mcp`):**
```json
// Request
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "search_wiki", "arguments": { "query": "hybrid search" } } }

// 200 Response
{ "jsonrpc": "2.0", "id": 1, "result": { "content": [ { "type": "text", "text": "..." } ] } }
```
MCP tools exposed (`src/lib/mcp-http.ts`): `search_wiki`, `read_page`, `list_pages`,
`query_wiki`, `ingest_url`, `batch_ingest_urls`, `ingest_text`, `ingest_image`,
`ingest_pdf`, `ingest_x_mention`, `create_page`, `update_page`, `delete_page`,
`save_query_answer`, `reingest`, `maintenance_scan`, `publish_to_commons`,
`update_metadata`, `lint_wiki`, `fix_lint_issue`, `reconcile_page`, `merge_pages`,
`list_discussions`, `read_discussion`, `create_discussion`, `add_comment`,
`resolve_discussion`, `list_revisions`, `read_revision`, `revert_revision`,
`list_vaults`, `vault_pages`, `vault_curate`, `vault_create`, `vault_uncurate`,
`agent_context`, `list_agents`, `update_agent`, `seed_agent`, `delete_agent`,
`vault_delete`, `vault_rename`, `query_history`, `dataview_query`, `wiki_graph`,
`activity_trail`, `ingest_history`, `list_contributors`, `get_contributor`. A
per-user agent token resolves write tools to that user's own content; the
service token resolves to the configured service principal; no token means
read-only tools work and write tools return an auth-required tool error.

Multipart uploads (`POST /api/ingest/image`, `POST /api/ingest/pdf`) accept
`multipart/form-data` with fields `file=<blob>`, `title?=<string>`,
`tags?=<comma-separated>` as an alternative to the JSON `{ imageUrl }` / `{ pdfUrl }`
body.

## Error Codes

All error responses share the shape `{ "error": "<message>" }` (`getErrorMessage()` in
`src/lib/errors.ts`); MCP errors additionally follow the JSON-RPC 2.0 error envelope
(`{ jsonrpc: "2.0", id, error: { code, message } }`).

| Status | Meaning | Example |
|---|---|---|
| 200 / 201 | Success (201 on resource creation, e.g. `POST /api/wiki`, `POST /api/vaults`) | — |
| 202 | Accepted, no body (MCP JSON-RPC notification) | `POST /api/mcp` with a notification-only message |
| 400 | Bad input — malformed JSON, missing/invalid required field, invalid enum value | `"content is required and must be a non-empty string"` |
| 401 | Unauthenticated — no Clerk session and no valid token where one is required | `"Sign in required."`, `"Agent token required (Authorization: Bearer <token>)."` |
| 402 | Payment/plan required (frontmatter lifecycle field gated behind a plan) | `PATCH /api/wiki/[slug]` with `code: "PLAN_REQUIRED"` |
| 403 | Forbidden — authenticated but not authorized (wrong agent token, non-owner mutation, owner-only tool) | `"You don't have permission to edit this page."` |
| 404 | Not found — including a private/unreadable resource, cloaked as 404 to avoid leaking existence | `"page not found: <slug>"` |
| 405 | Method not allowed | `GET /api/mcp` |
| 409 | Conflict — resource already exists | `"page already exists: <slug>"`, agent id already registered |
| 429 | Rate limited (remote MCP only — see below) | `{ error: { code: -32000, message: "Rate limit exceeded." } }` |
| 500 | Server error — genuine failure, logged at `error` level | `"An unexpected error occurred"` |

Ingest routes further distinguish caller-input failures from server failures via
`ClientInputError` (`src/lib/errors.ts`): a deleted/private X post or an unsafe URL is a
`400` logged at `warn`; anything else is a `500` logged at `error`, so real bugs are not
buried as routine 400 noise.

## Rate Limits

Only the remote MCP endpoint (`POST /api/mcp`) is rate limited: **60 requests per 60
seconds**, keyed by the authenticated principal's handle, or by client IP
(`cf-connecting-ip` / `x-forwarded-for`) for unauthenticated callers
(`RATE_LIMITS.mcp` in `src/lib/rate-limit.ts`). It is a fixed-window counter backed by
the `arcpedia_CONFIG` Cloudflare KV namespace and **fails open**: outside a Workers
request context (local dev, tests) or on a KV outage, requests are allowed rather than
blocked — a limiter outage must never take down legitimate traffic. JSON-RPC batches to
`/api/mcp` are additionally capped at `MCP_MAX_BATCH` = 20 messages per request
(independent of the per-window rate limit).

No other REST route (`/api/query`, `/api/ingest`, etc.) has request-rate limiting;
cost control on those endpoints comes from requiring a signed-in session (see
Authentication above), not from a request quota.
</content>
</invoke>
