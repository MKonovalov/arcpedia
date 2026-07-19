<!-- generated-by: gsd-doc-writer -->
# Configuration

arcpedia is configured through environment variables (the primary mechanism), an optional
JSON config file for LLM/embedding settings, and (in the Cloudflare deployment) `wrangler.jsonc`
bindings and vars. This document covers all three.

Two starting points exist in the repo:
- `.env.example` — the canonical, commented list of variables. Copy it to `.env.local` for
  `next dev`, or to `.dev.vars` for local Wrangler/OpenNext runs.
- `docker-compose.yml` / `Dockerfile` — for the self-hosted Docker path (`env_file: .env`).

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Required | none | Clerk publishable key. Missing → the app returns HTTP 500 on both reads and writes. |
| `CLERK_SECRET_KEY` | Required | none | Clerk secret key, server-side auth. |
| `NEXT_PUBLIC_OWNER_HANDLE` | Optional | unset (nobody is owner) | X/Twitter handle of the site owner. Public — inlined into the client bundle at build time. Gates owner-only admin tools (e.g. `/lint`, `/api/lint*`) and grants operator/admin page permissions (see `src/lib/authz.ts`). |
| `ADMIN_HANDLES` | Optional | unset (no admins) | Comma-separated list of Clerk user ids (`user_…`, matched exactly) or handles (matched case-insensitively) granted admin read/write/delete on every page, including other users' private pages. See `src/lib/authz.ts`. |
| `ANTHROPIC_API_KEY` | Optional (one provider key required for LLM features) | none | Enables the Anthropic provider. Highest priority in the auto-detect order (see Required vs Optional Settings below). |
| `OPENAI_API_KEY` | Optional | none | Enables the OpenAI provider (2nd priority). Also used for OpenAI embeddings. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Optional | none | Enables the Google Gemini provider (3rd priority). Also used for Google embeddings. |
| `DEEPSEEK_API_KEY` | Optional | none | Enables the DeepSeek provider (4th priority). Used for ingest synthesis and image vision. |
| `OPENROUTER_API_KEY` | Optional | none | Enables the OpenRouter provider (5th priority) — one key, many hosted models. Only used if none of the four keys above are set. |
| `XAI_API_KEY` | Optional | none | xAI (Grok) API key used only for illustration/scene image generation (`src/lib/illustration.ts`). Not part of the text-generation provider auto-detect order; unrelated to `ANTHROPIC_API_KEY`/etc. Without it, illustration generation is skipped (cached illustrations still serve). |
| `OLLAMA_BASE_URL` | Optional | unset | Base URL of a local/remote Ollama server (e.g. `http://host.docker.internal:11434` from inside Docker). Setting this or `OLLAMA_MODEL` selects the Ollama provider (lowest priority, keyless). |
| `OLLAMA_MODEL` | Optional | `llama3.2` | Model name to use with Ollama. |
| `LLM_MODEL` | Optional | provider default (see Defaults) | Overrides the model name for the active LLM provider. For OpenRouter, any OpenRouter model slug works with no code changes. |
| `VISION_MODEL` | Optional | `@cf/llava-hf/llava-1.5-7b-hf` | Workers AI vision model used as a fallback for image description when no LLM vision-capable key is set. |
| `EMBEDDING_PROVIDER` | Optional | auto-detected | Overrides which provider generates embeddings, independent of the LLM provider. One of `openai`, `google`, `ollama`, `workers-ai`. Invalid values disable embeddings (does not fall through). |
| `EMBEDDING_MODEL` | Optional | provider default (see Defaults) | Overrides the embedding model name. Must match the resolved provider's namespace (Workers AI ids start with `@cf/`); a mismatched override is ignored. |
| `X_BEARER_TOKEN` | Optional | unset | X API v2 bearer token. Without it, ingested X Articles degrade to a ~200-character teaser instead of the full body (plain tweets work fine without it). Set as a Worker secret in production (`wrangler secret put X_BEARER_TOKEN`) on the main app Worker. |
| `YOUTUBE_TRANSCRIPT_API_KEY` | Optional | unset | Only needed when direct YouTube transcript fetch is blocked. |
| `NEXT_PUBLIC_POSTHOG_KEY` | Optional | built-in public project key | PostHog client key for page-view analytics. `NEXT_PUBLIC_*` vars are inlined at **build** time, not read at runtime — set them in the deploy build step. Setting it to an empty string explicitly disables analytics. |
| `NEXT_PUBLIC_POSTHOG_HOST` | Optional | `https://us.i.posthog.com` | PostHog ingestion host. |
| `STORAGE_PROVIDER` | Optional | auto-detected | Explicit storage backend override: `fs` (filesystem) or `cloudflare-r2`. Auto-detects Cloudflare Workers runtime via `globalThis.caches.default` when unset. |
| `DATA_DIR` | Optional | `process.cwd()` | Base data directory for filesystem storage. |
| `WIKI_DIR` | Optional | `<DATA_DIR>/wiki` | Directory for generated wiki markdown pages. |
| `RAW_DIR` | Optional | `<DATA_DIR>/raw` | Directory for ingested raw source documents. |
| `LOG_LEVEL` | Optional | `warn` (`error` in `NODE_ENV=test`) | One of `debug`, `info`, `warn`, `error`, `silent`. See `src/lib/logger.ts`. |
| `NODE_ENV` | Optional | environment-set | Standard Next.js/Node environment flag. `test` lowers the default log level to `error`. |
| `arcpedia_READONLY` | Optional | unset | Set to `1` to force read-only mode (rejects settings writes), independent of storage provider. |
| `arcpedia_SERVICE_TOKEN` | Optional (required for the task-consumer Worker and any automated write caller) | unset | Bearer token for the non-human "service principal" write credential, used by scheduled jobs / CI (e.g. the task-consumer Worker's calls to `/api/tasks/run`). Set as a Worker secret: `wrangler secret put arcpedia_SERVICE_TOKEN`. |
| `arcpedia_SERVICE_PRINCIPAL` | Optional (required alongside `arcpedia_SERVICE_TOKEN`) | unset | The handle the service principal writes as. Set as a Worker secret: `wrangler secret put arcpedia_SERVICE_PRINCIPAL`. Both must be set for the service principal to resolve. |
| `AUTONOMOUS_MAINTENANCE` | Optional | `"on"` (set in `wrangler.jsonc` `vars`) | Anything other than `"on"` puts the daily maintenance cron in dry-run (log only, no enqueue). |
| `PORT` | Optional | `3000` | Container port (set in `Dockerfile` / used by `next start`). |

Cloudflare deployment secrets are set with `wrangler secret put <NAME>` (main Worker: `wrangler.jsonc`;
task-consumer Worker: `wrangler secret put --config workers/task-consumer/wrangler.jsonc`) rather
than via `.env` files. <!-- VERIFY: full production secret inventory in the live Cloudflare account -->

### LLM provider priority order

`detectEnvProvider()` in `src/lib/config.ts` checks provider API keys in this fixed order and stops
at the first one found:

1. `ANTHROPIC_API_KEY` → `anthropic`
2. `OPENAI_API_KEY` → `openai`
3. `GOOGLE_GENERATIVE_AI_API_KEY` → `google`
4. `DEEPSEEK_API_KEY` → `deepseek`
5. `OPENROUTER_API_KEY` → `openrouter`
6. `OLLAMA_BASE_URL` or `OLLAMA_MODEL` set → `ollama` (keyless)

Only one provider is needed. If none of the above are set, `provider` resolves to `null` and LLM
features report "not configured."

### Clerk dashboard configuration (not env vars)

Some auth behavior is configured in the Clerk dashboard rather than through environment variables:

1. Enable Email auth (required for waitlist invitation emails).
2. Require Username at sign-up — the basis for `/u/<handle>` URLs. `resolveHandle()` in
   `src/lib/auth.ts` falls back to the linked X handle, then the raw Clerk user id, if username is
   unset.
3. Waitlist page → toggle "Enable waitlist" (gates new registration only; reading the commons stays
   public). Approve people via the row `…` menu → Invite.

<!-- VERIFY: exact Clerk dashboard URL / project reference for this deployment -->

## Config File Format

Beyond environment variables, LLM/embedding preferences can be persisted in a small JSON config file
managed through the Settings UI (`/api/settings`) rather than hand-edited.

- Path: `<DATA_DIR>/.llm-wiki-config.json` (see `getConfigPath()` in `src/lib/config.ts`).
- Read/written through the active `StorageProvider` (filesystem or R2), so on Cloudflare it lives in
  the `arcpedia_CONFIG` KV-backed storage rather than a literal file.
- Shape (`AppConfig` interface):

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "ollamaBaseUrl": "http://localhost:11434",
  "embeddingProvider": "openai",
  "embeddingModel": "text-embedding-3-small"
}
```

All fields are optional. `provider` must be one of `anthropic`, `openai`, `google`, `deepseek`,
`openrouter`, `ollama` (`VALID_PROVIDERS` in `src/lib/providers.ts`). `embeddingProvider` must be one
of `openai`, `google`, `ollama`, `workers-ai` (`EMBEDDING_PROVIDERS`).

Writes to this file are rejected when `isReadOnly()` returns `true` (see below) — the Settings UI
surfaces this as a read-only state.

## Required vs Optional Settings

**Required for the app to serve requests at all:**
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` — both are required at runtime, even for
  reads. Missing either causes a 500.

**Required for LLM-dependent features (generation, ingest synthesis, chat) to work, but the app still
runs without them** (features report "not configured" instead of erroring):
- At least one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`,
  `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`, or `OLLAMA_BASE_URL`/`OLLAMA_MODEL`.

**Required for embeddings / semantic search** (falls back to BM25-only search when absent):
- An embedding-capable provider resolved via `EMBEDDING_PROVIDER` / `config.embeddingProvider`,
  Workers AI auto-detection (Cloudflare `AI` binding), or an embedding-capable LLM provider
  (`openai`, `google`, `ollama` — not `anthropic` or `deepseek`, which have no embedding models).

**Required for the task-consumer Worker to dispatch scheduled/queued jobs:**
- `arcpedia_SERVICE_TOKEN` and `arcpedia_SERVICE_PRINCIPAL`, matching values on both the main Worker
  and the task-consumer Worker.

**Everything else is optional** and either falls back to a built-in default or disables the associated
feature gracefully (owner-only admin tools, X Article full-body fetch, YouTube transcript API fallback,
analytics).

## Defaults

| Setting | Default | Set in |
|---|---|---|
| LLM model per provider | `anthropic`: `claude-sonnet-4-20250514`, `openai`: `gpt-4o`, `google`: `gemini-2.0-flash`, `deepseek`: `deepseek-v4-flash`, `openrouter`: `tencent/hunyuan-a13b-instruct:free`, `ollama`: `llama3.2` | `DEFAULT_MODELS` in `src/lib/providers.ts` |
| Embedding model per provider | `openai`: `text-embedding-3-small`, `google`: `gemini-embedding-001`, `ollama`: `nomic-embed-text`, `workers-ai`: `@cf/baai/bge-m3` | `DEFAULT_EMBEDDING_MODELS` in `src/lib/embeddings.ts` |
| Vision fallback model | `@cf/llava-hf/llava-1.5-7b-hf` | `src/lib/vision.ts` |
| `DATA_DIR` | `process.cwd()` | `src/lib/paths.ts` |
| `WIKI_DIR` | `<DATA_DIR>/wiki` | `src/lib/paths.ts` |
| `RAW_DIR` | `<DATA_DIR>/raw` | `src/lib/paths.ts` |
| `LOG_LEVEL` | `warn` (`error` under `NODE_ENV=test`) | `src/lib/logger.ts` |
| PostHog key/host | built-in public key `phc_l1jtx4tZRSCf0wcwuvPgC6fXGpyvOxus4bsqOS4BOI2` / `https://us.i.posthog.com` | `src/components/Analytics.tsx` |
| `NEXT_PUBLIC_OWNER_HANDLE` (Cloudflare deploy build) | `arcpedia` | `.github/workflows/deploy-cloudflare.yml` (`vars.NEXT_PUBLIC_OWNER_HANDLE || 'arcpedia'`) |
| `NEXT_PUBLIC_OWNER_HANDLE` (Worker runtime var) | `arcpedia` | `wrangler.jsonc` `vars` |
| `AUTONOMOUS_MAINTENANCE` | `on` | `wrangler.jsonc` `vars` |
| `PORT` | `3000` | `Dockerfile` |

## Per-Environment Overrides

arcpedia does not use `.env.development` / `.env.production` files. Instead, configuration differs
by **runtime target**:

- **`next dev` (local dev)** — reads `.env.local` (gitignored). Storage defaults to the filesystem
  provider under `DATA_DIR` (or `process.cwd()`).
- **Local Wrangler/OpenNext runs** — reads `.dev.vars` (gitignored), following the same variable
  names as `.env.example`.
- **Docker (self-hosted)** — `docker-compose.yml` loads `env_file: .env`; wiki/raw data persist in
  the `wiki-data` / `raw-data` named volumes (or bind-mount a host directory by overriding the
  `volumes:` section).
- **Cloudflare Workers (production)** — non-secret values are set as `vars` in `wrangler.jsonc`
  (`NEXT_PUBLIC_OWNER_HANDLE`, `AUTONOMOUS_MAINTENANCE`) and in `workers/task-consumer/wrangler.jsonc`
  (`arcpedia_URL`); secrets are set individually with `wrangler secret put <NAME>` (never committed).
  `STORAGE_PROVIDER` is not set explicitly here — the Cloudflare Workers runtime is auto-detected via
  `globalThis.caches.default`, which forces R2 storage and read-only config-file writes
  (`isReadOnly()` returns `true` whenever `STORAGE_PROVIDER=cloudflare-r2` or the Workers runtime is
  detected).
  `NEXT_PUBLIC_*` values (e.g. `NEXT_PUBLIC_OWNER_HANDLE`) are additionally re-supplied as build-time
  env in the `Build Cloudflare Worker` step of `.github/workflows/deploy-cloudflare.yml`, since
  `NEXT_PUBLIC_*` vars are inlined into the client bundle at build time and are not read from
  `wrangler.jsonc` `vars` by the browser bundle.
- **CI (GitHub Actions)** — secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `ARCPEDIA_GITHUB_TOKEN`, `arcpedia_SERVICE_TOKEN`, `X_BEARER_TOKEN`, provider API keys) are pulled
  from Bitwarden Secrets Manager via `bitwarden/sm-action` at the start of each workflow, not stored
  as plain GitHub Actions secrets directly in most cases.
  <!-- VERIFY: full list of Bitwarden secret manager entries backing CI workflows -->

Related Cloudflare bindings (not environment variables, but part of the same per-environment
configuration surface) are declared in `wrangler.jsonc`: the `arcpedia_BUCKET` R2 bucket, the
`arcpedia_CONFIG` and `arcpedia_SEARCH` KV namespaces, the `arcpedia_VECTORIZE`/`VECTORIZE` Vectorize
indexes, the `AI` Workers AI binding, and the `TASK_QUEUE` producer binding to the `arcpedia-tasks`
queue. See `DEPLOY.md` and `wrangler.jsonc` comments for provisioning commands.
