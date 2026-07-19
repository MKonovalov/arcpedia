<!-- generated-by: gsd-doc-writer -->
# Testing

## Test framework and setup

arcpedia uses [Vitest](https://vitest.dev) (`vitest@^3`) as its sole test
framework. There is no separate framework for unit vs. integration tests —
everything runs through the same Vitest runner, configured in
[`vitest.config.ts`](../vitest.config.ts):

- **Environment:** `node` (no jsdom/browser environment — components are
  tested at the logic/render-output level, not via DOM simulation)
- **Test discovery:** `src/**/__tests__/**/*.test.ts`
- **Setup file:** [`vitest.setup.ts`](../vitest.setup.ts) — runs before every
  test file. It isolates `DATA_DIR` to a fresh `mkdtempSync` temp directory
  by default (via Node's `os.tmpdir()`), so any test that writes a wiki page —
  including the commons index, per-tenant silos under `tenants/<tenant>/`,
  and `.indexes` — never touches the repo working directory. Tests that need
  their own storage layout set `DATA_DIR` (and related `WIKI_DIR`/`RAW_DIR`
  env vars) explicitly in a `beforeEach`, overriding the default.
- **Path alias:** `@` resolves to `./src` (matches the alias used throughout
  application code).

No additional setup is required beyond installing dependencies — `pnpm
install` pulls in Vitest and all test dependencies. No database, external
service, or API key is required to run the suite; LLM-provider-dependent
tests mock or skip network calls (see `src/lib/__tests__/llm*.test.ts` and
`src/lib/__tests__/providers.test.ts` for the mocking pattern).

## Running tests

Run the full suite once (this is what CI-equivalent verification uses):

```bash
pnpm test
```

This runs `vitest run`, which executes every `*.test.ts` file under
`src/**/__tests__/` a single time and exits (no watch mode).

To run a single test file, pass its path to Vitest directly:

```bash
pnpm exec vitest run src/lib/__tests__/wiki.test.ts
```

To filter by test name (across all files):

```bash
pnpm exec vitest run -t "should verify vitest works"
```

For interactive development, run Vitest in watch mode (re-runs affected
tests on file save) by invoking the CLI directly, since no `test:watch`
script is defined in `package.json`:

```bash
pnpm exec vitest
```

## Writing new tests

- **File naming:** `<subject>.test.ts`, placed inside a `__tests__/`
  directory alongside the code it exercises. The two conventions in use are
  `src/lib/__tests__/*.test.ts` (the vast majority of tests, covering
  ingest, query, lint, storage, auth, and the API route handlers) and
  `src/components/__tests__/*.test.ts` / `src/app/api/__tests__/*.test.ts`
  for component- and route-scoped tests. Match the location of the module
  under test.
- **Imports:** Use the `describe` / `it` / `expect` API from `"vitest"`
  (see `src/lib/__tests__/smoke.test.ts` for the minimal shape), plus
  `beforeEach` / `afterEach` when a test needs its own isolated storage
  directory or environment variables.
- **Storage isolation pattern:** Tests that read or write wiki pages
  typically create their own temp directory in `beforeEach`, point
  `process.env.DATA_DIR` (and `WIKI_DIR`/`RAW_DIR` where relevant) at it,
  and restore the previous env var value in `afterEach`. See
  `src/lib/__tests__/wiki.test.ts` for the reference implementation of this
  pattern — it is copied by most other test files that touch storage.
- **No shared test-helpers module:** there is currently no
  `tests/helpers.ts` or similar shared fixture file; each test file sets up
  its own fixtures inline or via the `beforeEach` pattern above.
- **Route handler tests:** API route tests (e.g.
  `src/lib/__tests__/ingest-routes.test.ts`, `wiki-routes.test.ts`,
  `mcp-route.test.ts`) import the route's exported handler function
  directly and invoke it with a constructed `Request`, asserting on the
  returned `Response`, rather than spinning up a live Next.js server.

## Coverage requirements

No coverage threshold is configured. There is no `coverage` section in
`vitest.config.ts`, no `.nycrc`, and no `c8`/`@vitest/coverage-*` package in
`devDependencies` — running `pnpm test` does not produce a coverage report
by default.

## CI integration

<!-- VERIFY: Whether test execution is intentionally excluded from CI, or planned but not yet wired up -->
No GitHub Actions workflow in `.github/workflows/` currently runs `pnpm
test` or invokes Vitest. The `build.yml`, `review.yml`, and `architect.yml`
workflows drive the project's autonomous agent pipeline (issue-triggered
build/review/architecture steps) but do not include an explicit test-run
step; `deploy-cloudflare.yml` runs `pnpm build:cloudflare` for deployment
without a preceding test step. In practice, tests are run locally (or by
the agent pipeline as part of its own build verification) via `pnpm test`
before changes are committed — see the root [README.md](../README.md) for
the project's "build + lint + tests + independent eval agent" verification
description.
