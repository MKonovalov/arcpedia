<!-- generated-by: gsd-doc-writer -->
# Getting Started

This guide gets arcpedia running locally for development. For a Docker-based self-hosting
setup, see [`DEPLOY.md`](../DEPLOY.md) instead — this guide covers running the Next.js app
directly with `pnpm`.

## Prerequisites

- **Node.js 20+** — the local dev server and test suite run fine on Node 20. The Cloudflare
  production build (`.github/workflows/deploy-cloudflare.yml`) specifically targets Node 22, and
  the `Dockerfile` uses `node:22-alpine`, so Node 22 is recommended if you want your local
  environment to match production exactly. No `.nvmrc` or `engines` field is pinned in
  `package.json` — either Node 20 or 22 works for local dev.
- **pnpm 9**, via [corepack](https://nodejs.org/api/corepack.html):
  ```bash
  corepack enable
  ```
  This picks up the exact version pinned in `package.json` (`packageManager: pnpm@9.15.9`).
- **At least one LLM provider key** — required for generation, ingest synthesis, and query
  features. The app auto-detects a provider from environment variables, checking in this fixed
  order and stopping at the first match (`detectEnvProvider()` in `src/lib/config.ts`):

  | Provider | Env var | Default model |
  |---|---|---|
  | Anthropic | `ANTHROPIC_API_KEY=sk-ant-...` | `claude-sonnet-4-20250514` |
  | OpenAI | `OPENAI_API_KEY=sk-...` | `gpt-4o` |
  | Google | `GOOGLE_GENERATIVE_AI_API_KEY=...` | `gemini-2.0-flash` |
  | DeepSeek | `DEEPSEEK_API_KEY=sk-...` | `deepseek-v4-flash` |
  | OpenRouter | `OPENROUTER_API_KEY=sk-or-...` | `tencent/hunyuan-a13b-instruct:free` |
  | Ollama (local, keyless) | `OLLAMA_BASE_URL=http://localhost:11434/api` | `llama3.2` |

  You only need one. Set `LLM_MODEL` to override the default model for whichever provider is
  selected. See [`docs/CONFIGURATION.md`](CONFIGURATION.md) for the full variable reference.
- **Clerk auth keys** — `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. Both are
  required at runtime, even for anonymous/read-only browsing — the app returns HTTP 500 on every
  page without them. <!-- VERIFY: Clerk test-mode keys / how to obtain them for local dev are not documented in-repo -->

## Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/MKonovalov/arcpedia.git
   cd arcpedia
   ```

2. **Enable corepack and install dependencies**

   ```bash
   corepack enable
   pnpm install
   ```

3. **Create `.env.local`** with your Clerk keys and one LLM provider key. `.env.example` in the
   project root is the canonical, commented list of every variable the app reads:

   ```bash
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ANTHROPIC_API_KEY=sk-ant-...   # or any other provider from the table above
   ```

## First Run

Start the dev server:

```bash
pnpm dev        # next dev --turbopack -> http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000). Wiki pages are read from and written to the
filesystem under `WIKI_DIR` (default `<cwd>/wiki`) and `RAW_DIR` (default `<cwd>/raw`) when
running locally — no external database is required.

To confirm everything is wired correctly, run the test suite and linter:

```bash
pnpm test       # vitest run — every *.test.ts under src/**/__tests__/
pnpm lint       # eslint
```

There's also a CLI and an MCP server for interacting with the wiki outside the browser:

```bash
pnpm cli help   # list CLI commands (ingest, query, search, read, create, update, lint, ...)
pnpm mcp        # start the MCP server over stdio
```

## Common Setup Issues

- **App returns a 500 on every page** — Clerk auth is misconfigured. Both
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` must be set in `.env.local`, even for
  anonymous/read-only browsing.
- **"No LLM provider configured" errors on ingest or query** — set at least one of
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `DEEPSEEK_API_KEY`,
  `OPENROUTER_API_KEY`, or point `OLLAMA_BASE_URL` at a running local Ollama server.
- **`pnpm install` fails or uses the wrong package manager** — run `corepack enable` first so the
  pinned `pnpm@9.15.9` is used instead of a system-wide npm/yarn.
- **Wrong Node version errors during build** — use Node 20 or newer; the Cloudflare production
  build specifically targets Node 22 (see `.github/workflows/deploy-cloudflare.yml`), and the
  Dockerfile uses `node:22-alpine`.
- **Semantic search silently falls back to BM25-only** — embeddings require an
  embedding-capable provider (`openai`, `google`, or `ollama` — not `anthropic` or `deepseek`,
  which have no embedding models), set via `EMBEDDING_PROVIDER` or auto-detected from your LLM
  provider key. See [`docs/CONFIGURATION.md`](CONFIGURATION.md#required-vs-optional-settings).

## Next Steps

- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) — system overview, component diagram, and key
  abstractions.
- [`docs/CONFIGURATION.md`](CONFIGURATION.md) — the full environment variable reference, config
  file format, and per-environment overrides.
- [`DEPLOY.md`](../DEPLOY.md) — self-hosting with Docker Compose, or building from source for
  production.
- [`SCHEMA.md`](../SCHEMA.md) — wiki page conventions and operations (frontmatter, wikilinks,
  confidence/expiry).
- [`README.md`](../README.md) — project overview, the agent pipeline, and how the project is
  built.
