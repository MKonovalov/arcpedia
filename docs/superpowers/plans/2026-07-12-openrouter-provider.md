# OpenRouter LLM Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenRouter as a selectable LLM provider so the app can use any OpenRouter-hosted model (starting with Tencent Hunyuan A13B free tier) alongside the existing Anthropic/OpenAI/Google/DeepSeek/Ollama providers.

**Architecture:** OpenRouter speaks the OpenAI Chat Completions wire format, so it's wired in exactly like DeepSeek: `@ai-sdk/openai`'s `createOpenAI({ baseURL })` pointed at OpenRouter's endpoint, called via `.chat(model)` (not the default `.responses()` callable). No new dependency. Slots into the existing single-active-provider resolution chain in `src/lib/config.ts` at the lowest-priority API-key slot (after DeepSeek, before Ollama).

**Tech Stack:** TypeScript, Vercel AI SDK (`@ai-sdk/openai`), Vitest.

## Global Constraints

- Provider env var: `OPENROUTER_API_KEY`.
- Base URL: `https://openrouter.ai/api/v1`.
- Default model: `tencent/hunyuan-a13b-instruct:free` (per approved spec).
- Priority order: Anthropic > OpenAI > Google > DeepSeek > OpenRouter > Ollama.
- Not in scope: embeddings support, vision special-casing, UI component changes, multi-model routing (see spec's "Out of scope").
- Spec: `docs/superpowers/specs/2026-07-12-openrouter-provider-design.md`.

---

### Task 1: Register the provider in `src/lib/providers.ts`

**Files:**
- Modify: `src/lib/providers.ts:12-18` (`PROVIDER_INFO`), `:54-60` (`DEFAULT_MODELS`)
- Test: `src/lib/__tests__/providers.test.ts` (create — no existing test file for this module)

**Interfaces:**
- Produces: `PROVIDER_INFO` includes `{ value: "openrouter", label: "OpenRouter" }`; `DEFAULT_MODELS.openrouter === "tencent/hunyuan-a13b-instruct:free"`; `VALID_PROVIDERS.has("openrouter") === true` (derived automatically from `PROVIDER_INFO`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/providers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PROVIDER_INFO, VALID_PROVIDERS, DEFAULT_MODELS, providerLabel } from "../providers";

describe("providers — OpenRouter registration", () => {
  it("includes openrouter in PROVIDER_INFO with label 'OpenRouter'", () => {
    const entry = PROVIDER_INFO.find((p) => p.value === "openrouter");
    expect(entry).toBeDefined();
    expect(entry?.label).toBe("OpenRouter");
  });

  it("includes openrouter in VALID_PROVIDERS (derived from PROVIDER_INFO)", () => {
    expect(VALID_PROVIDERS.has("openrouter")).toBe(true);
  });

  it("defaults openrouter's model to the Tencent Hy3 free tier", () => {
    expect(DEFAULT_MODELS.openrouter).toBe("tencent/hunyuan-a13b-instruct:free");
  });

  it("providerLabel resolves 'openrouter' to 'OpenRouter'", () => {
    expect(providerLabel("openrouter")).toBe("OpenRouter");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/providers.test.ts`
Expected: FAIL — `entry` is `undefined`, `DEFAULT_MODELS.openrouter` is `undefined`, `providerLabel("openrouter")` returns `"openrouter"` (fallback).

- [ ] **Step 3: Implement**

In `src/lib/providers.ts`, change:

```ts
export const PROVIDER_INFO = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "ollama", label: "Ollama" },
] as const;
```

to:

```ts
export const PROVIDER_INFO = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "ollama", label: "Ollama" },
] as const;
```

And change:

```ts
export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  google: "gemini-2.0-flash",
  deepseek: "deepseek-v4-flash",
  ollama: "llama3.2",
};
```

to:

```ts
export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  google: "gemini-2.0-flash",
  deepseek: "deepseek-v4-flash",
  openrouter: "tencent/hunyuan-a13b-instruct:free",
  ollama: "llama3.2",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/providers.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers.ts src/lib/__tests__/providers.test.ts
git commit -m "feat: register openrouter as a valid LLM provider"
```

---

### Task 2: Detect `OPENROUTER_API_KEY` in `src/lib/config.ts`

**Files:**
- Modify: `src/lib/config.ts:205-225` (`detectEnvProvider`), `:375-415` (`getResolvedCredentials`)
- Test: `src/lib/__tests__/config.test.ts:31-46` (`ENV_KEYS`), `:57-65` (`beforeEach` cleanup), `:300-355` (`getResolvedCredentials` describe block)

**Interfaces:**
- Consumes: `PROVIDER_INFO`, `DEFAULT_MODELS` from `./providers` (already imported in `config.ts`; `DEFAULT_MODELS.openrouter` now defined per Task 1).
- Produces: `detectEnvProvider()` returns `{ provider: "openrouter", apiKey: <OPENROUTER_API_KEY> }` when that env var is set and no higher-priority key is; `getResolvedCredentials()` resolves `apiKey` from `OPENROUTER_API_KEY` when `provider === "openrouter"`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/__tests__/config.test.ts`, add `"OPENROUTER_API_KEY"` to the `ENV_KEYS` array (line 38, right after `"DEEPSEEK_API_KEY"`):

```ts
const ENV_KEYS = [
  "DATA_DIR",
  "WIKI_DIR",
  "RAW_DIR",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "DEEPSEEK_API_KEY",
  "OPENROUTER_API_KEY",
  "OLLAMA_BASE_URL",
  "OLLAMA_MODEL",
  "LLM_MODEL",
  "EMBEDDING_MODEL",
  "EMBEDDING_PROVIDER",
  "arcpedia_READONLY",
  "STORAGE_PROVIDER",
];
```

And add a delete line in `beforeEach` (line 61, right after the `DEEPSEEK_API_KEY` delete):

```ts
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_MODEL;
  delete process.env.LLM_MODEL;
  delete process.env.EMBEDDING_PROVIDER;
```

Then add these tests inside the `describe("getResolvedCredentials", ...)` block (after the existing DeepSeek tests, before the closing `});` at line 355):

```ts
  it("detects openrouter from OPENROUTER_API_KEY with its default model", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-key";

    const creds = getResolvedCredentials();
    expect(creds.provider).toBe("openrouter");
    expect(creds.apiKey).toBe("sk-or-key");
    // Falls back to DEFAULT_MODELS["openrouter"] when no override is set.
    expect(creds.model).toBe("tencent/hunyuan-a13b-instruct:free");
  });

  it("honors LLM_MODEL override for openrouter (e.g. a different hosted model)", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-key";
    process.env.LLM_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

    const creds = getResolvedCredentials();
    expect(creds.provider).toBe("openrouter");
    expect(creds.model).toBe("meta-llama/llama-3.3-70b-instruct:free");
  });

  it("prefers deepseek over openrouter when both keys are set", () => {
    process.env.DEEPSEEK_API_KEY = "sk-ds-key";
    process.env.OPENROUTER_API_KEY = "sk-or-key";

    const creds = getResolvedCredentials();
    expect(creds.provider).toBe("deepseek");
  });

  it("prefers openrouter over ollama when both are configured", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-key";
    process.env.OLLAMA_BASE_URL = "http://localhost:11434/api";

    const creds = getResolvedCredentials();
    expect(creds.provider).toBe("openrouter");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/__tests__/config.test.ts`
Expected: FAIL — the 4 new tests fail because `detectEnvProvider`/`getResolvedCredentials` don't recognize `OPENROUTER_API_KEY` yet (`creds.provider` is `null`, or falls through to `ollama` in the last test).

- [ ] **Step 3: Implement**

In `src/lib/config.ts`, change `detectEnvProvider()` (currently lines 205-225):

```ts
export function detectEnvProvider(): {
  provider: string | null;
  apiKey: string | null;
} {
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: "openai", apiKey: process.env.OPENAI_API_KEY };
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return { provider: "google", apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY };
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return { provider: "deepseek", apiKey: process.env.DEEPSEEK_API_KEY };
  }
  if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL) {
    return { provider: "ollama", apiKey: null };
  }
  return { provider: null, apiKey: null };
}
```

to (adds the `OPENROUTER_API_KEY` check between DeepSeek and Ollama):

```ts
export function detectEnvProvider(): {
  provider: string | null;
  apiKey: string | null;
} {
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: "openai", apiKey: process.env.OPENAI_API_KEY };
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return { provider: "google", apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY };
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return { provider: "deepseek", apiKey: process.env.DEEPSEEK_API_KEY };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return { provider: "openrouter", apiKey: process.env.OPENROUTER_API_KEY };
  }
  if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL) {
    return { provider: "ollama", apiKey: null };
  }
  return { provider: null, apiKey: null };
}
```

And in `getResolvedCredentials()`, change the API-key resolution block (currently lines ~384-396):

```ts
  // API key: env only
  let apiKey: string | null;
  if (provider === "anthropic") {
    apiKey = process.env.ANTHROPIC_API_KEY ?? null;
  } else if (provider === "openai") {
    apiKey = process.env.OPENAI_API_KEY ?? null;
  } else if (provider === "google") {
    apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? null;
  } else if (provider === "deepseek") {
    apiKey = process.env.DEEPSEEK_API_KEY ?? null;
  } else {
    apiKey = null; // ollama is keyless
  }
```

to:

```ts
  // API key: env only
  let apiKey: string | null;
  if (provider === "anthropic") {
    apiKey = process.env.ANTHROPIC_API_KEY ?? null;
  } else if (provider === "openai") {
    apiKey = process.env.OPENAI_API_KEY ?? null;
  } else if (provider === "google") {
    apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? null;
  } else if (provider === "deepseek") {
    apiKey = process.env.DEEPSEEK_API_KEY ?? null;
  } else if (provider === "openrouter") {
    apiKey = process.env.OPENROUTER_API_KEY ?? null;
  } else {
    apiKey = null; // ollama is keyless
  }
```

Also update the doc comment above `hasLLMKey()` (currently lines 168-176) to list OpenRouter:

```ts
 * Supported providers and their env vars:
 *   - Anthropic: ANTHROPIC_API_KEY
 *   - OpenAI:    OPENAI_API_KEY
 *   - Google:    GOOGLE_GENERATIVE_AI_API_KEY
 *   - DeepSeek:  DEEPSEEK_API_KEY (OpenAI-compatible endpoint)
 *   - OpenRouter: OPENROUTER_API_KEY (OpenAI-compatible endpoint)
 *   - Ollama:    OLLAMA_BASE_URL or OLLAMA_MODEL (Ollama is typically keyless;
 *                presence of either env var signals intent to use a local
 *                Ollama server)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/__tests__/config.test.ts`
Expected: PASS (all tests, including the 4 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.ts src/lib/__tests__/config.test.ts
git commit -m "feat: detect OPENROUTER_API_KEY in the provider resolution chain"
```

---

### Task 3: Build the OpenRouter model in `src/lib/llm.ts`

**Files:**
- Modify: `src/lib/llm.ts:29-31` (base URL constant), `:222-272` (`getModel`)
- Test: Create `src/lib/__tests__/llm-openrouter.test.ts` (mirrors `src/lib/__tests__/llm-deepseek.test.ts`)

**Interfaces:**
- Consumes: `getResolvedCredentials()` from `./config` (already imported; now returns `provider: "openrouter"` per Task 2), `createOpenAI` from `@ai-sdk/openai` (already imported).
- Produces: `getModel()` returns `createOpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" }).chat(model)` when `creds.provider === "openrouter"`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/llm-openrouter.test.ts` (copy of `llm-deepseek.test.ts` structure, adjusted for OpenRouter):

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock every provider SDK + the `ai` module so getModel()/callLLM construct
// models without any network calls. We assert HOW the openrouter model is
// built: via createOpenAI pointed at the OpenRouter base URL.
// `vi.hoisted` so the mock fn exists before the hoisted vi.mock factory runs.
// The provider is both callable (default = Responses API) AND exposes `.chat()`
// (Chat Completions); openrouter must use `.chat()`, so we assert on it.
const { createOpenAIMock } = vi.hoisted(() => ({
  createOpenAIMock: vi.fn(() =>
    Object.assign((id: string) => ({ id, api: "responses" }), {
      chat: vi.fn((id: string) => ({ id, api: "chat" })),
    }),
  ),
}));
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: createOpenAIMock }));
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: vi.fn(() => vi.fn()) }));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn()),
}));
vi.mock("ollama-ai-provider-v2", () => ({ createOllama: vi.fn(() => vi.fn()) }));
vi.mock("ai", () => ({
  generateText: vi.fn(async () => ({ text: "ok" })),
  streamText: vi.fn(() => ({ toTextStreamResponse: vi.fn() })),
}));

import { callLLM } from "../llm";
import { _resetConfigCache } from "../config";

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "DEEPSEEK_API_KEY",
  "OPENROUTER_API_KEY",
  "OLLAMA_BASE_URL",
  "OLLAMA_MODEL",
  "LLM_MODEL",
  "DATA_DIR",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // No config file at this path.
  process.env.DATA_DIR = "/tmp/llm-wiki-or-test-nonexistent";
  vi.clearAllMocks();
  // clearAllMocks keeps implementations, but re-assert the factory impl to be safe.
  createOpenAIMock.mockImplementation(() =>
    Object.assign((id: string) => ({ id, api: "responses" }), {
      chat: vi.fn((id: string) => ({ id, api: "chat" })),
    }),
  );
  _resetConfigCache();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  _resetConfigCache();
});

describe("OpenRouter getModel construction", () => {
  it("builds openrouter via createOpenAI with the OpenRouter base URL", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or";
    _resetConfigCache();

    await callLLM("system", "message");

    expect(createOpenAIMock).toHaveBeenCalledWith({
      apiKey: "sk-or",
      baseURL: "https://openrouter.ai/api/v1",
    });
    // Must use Chat Completions (.chat), NOT the default Responses API.
    // Default model is the Tencent Hy3 free tier.
    const provider = createOpenAIMock.mock.results[0].value;
    expect(provider.chat).toHaveBeenCalledWith("tencent/hunyuan-a13b-instruct:free");
  });

  it("honors LLM_MODEL override for openrouter", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or";
    process.env.LLM_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
    _resetConfigCache();

    await callLLM("system", "message");

    const provider = createOpenAIMock.mock.results[0].value;
    expect(provider.chat).toHaveBeenCalledWith("meta-llama/llama-3.3-70b-instruct:free");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/llm-openrouter.test.ts`
Expected: FAIL — `getModel()` throws `"Unsupported provider: openrouter"` because `getModel()`'s switch has no `openrouter` case yet.

- [ ] **Step 3: Implement**

In `src/lib/llm.ts`, add a base URL constant next to `DEEPSEEK_BASE_URL` (currently lines 29-31):

```ts
/** DeepSeek's OpenAI-compatible API base URL. DeepSeek speaks the OpenAI
 *  wire format, so we reuse the `@ai-sdk/openai` provider pointed here. */
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

/** OpenRouter's OpenAI-compatible API base URL. Like DeepSeek, OpenRouter
 *  speaks the OpenAI Chat Completions wire format, proxying many hosted
 *  models (e.g. Tencent Hunyuan, Llama, Gemini) behind one API key. */
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
```

Add the `openrouter` case to the `getModel()` switch (currently the `deepseek` case is at lines 245-258, `google` follows at 259-262):

```ts
    case "deepseek": {
      // DeepSeek exposes an OpenAI-compatible endpoint, so we reuse the
      // OpenAI provider with a custom baseURL rather than adding a new
      // dependency. Default model is deepseek-v4-flash (see DEFAULT_MODELS).
      //
      // Use `.chat()` (Chat Completions, /chat/completions) explicitly: the
      // provider's default callable targets OpenAI's Responses API
      // (/responses), which DeepSeek does not implement — it would 404.
      const deepseek = createOpenAI({
        apiKey: creds.apiKey!,
        baseURL: DEEPSEEK_BASE_URL,
      });
      return deepseek.chat(model);
    }
    case "openrouter": {
      // Same rationale as deepseek above: OpenRouter is OpenAI Chat
      // Completions-compatible, so no new SDK dependency is needed. Model
      // name selects which of OpenRouter's hosted models to use (see
      // DEFAULT_MODELS.openrouter for the default: Tencent Hunyuan A13B,
      // free tier). Use `.chat()` for the same /responses-vs-/chat reason.
      const openrouter = createOpenAI({
        apiKey: creds.apiKey!,
        baseURL: OPENROUTER_BASE_URL,
      });
      return openrouter.chat(model);
    }
```

Update the "no key" error message in `getModel()` (currently lines 226-231):

```ts
  if (!creds.provider) {
    throw new Error(
      "No LLM API key found. Set one of ANTHROPIC_API_KEY, OPENAI_API_KEY, " +
        "GOOGLE_GENERATIVE_AI_API_KEY, DEEPSEEK_API_KEY, or " +
        "OLLAMA_BASE_URL / OLLAMA_MODEL in your environment, or configure a " +
        "provider in Settings.",
    );
  }
```

to:

```ts
  if (!creds.provider) {
    throw new Error(
      "No LLM API key found. Set one of ANTHROPIC_API_KEY, OPENAI_API_KEY, " +
        "GOOGLE_GENERATIVE_AI_API_KEY, DEEPSEEK_API_KEY, OPENROUTER_API_KEY, " +
        "or OLLAMA_BASE_URL / OLLAMA_MODEL in your environment, or configure " +
        "a provider in Settings.",
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/llm-openrouter.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `pnpm vitest run`
Expected: PASS (all suites, including `config.test.ts`, `llm-deepseek.test.ts`, `providers.test.ts`, `llm-openrouter.test.ts`)

- [ ] **Step 6: Commit**

```bash
git add src/lib/llm.ts src/lib/__tests__/llm-openrouter.test.ts
git commit -m "feat: build OpenRouter models via the OpenAI-compatible endpoint"
```

---

### Task 4: Document `OPENROUTER_API_KEY` in `.env.example`

**Files:**
- Modify: `.env.example:27-32`

**Interfaces:**
- None (documentation only — no code consumes this file at runtime).

- [ ] **Step 1: Update the LLM section**

Change (current lines 27-32):

```
# --- LLM + vision (generation, image description) ---
# DeepSeek (multimodal, used for ingest synthesis and image vision).
DEEPSEEK_API_KEY=sk-...
# Optional overrides:
# LLM_MODEL=deepseek-v4-flash
# VISION_MODEL=@cf/llava-hf/llava-1.5-7b-hf   # Workers AI fallback when no LLM key
```

to:

```
# --- LLM + vision (generation, image description) ---
# DeepSeek (multimodal, used for ingest synthesis and image vision).
DEEPSEEK_API_KEY=sk-...
# Optional overrides:
# LLM_MODEL=deepseek-v4-flash
# VISION_MODEL=@cf/llava-hf/llava-1.5-7b-hf   # Workers AI fallback when no LLM key
#
# OpenRouter (alternative: one key, many hosted models). Only used if none of
# ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY /
# DEEPSEEK_API_KEY are set (see priority order in src/lib/config.ts).
# OPENROUTER_API_KEY=sk-or-...
# Pick which OpenRouter-hosted model to use via LLM_MODEL — any OpenRouter
# model slug works, no code changes needed. Default if unset:
# LLM_MODEL=tencent/hunyuan-a13b-instruct:free
```

- [ ] **Step 2: Verify no other doc references the old provider list needs updating**

Run: `grep -rn "DEEPSEEK_API_KEY, or\|ANTHROPIC_API_KEY, OPENAI_API_KEY" README.md docs/ 2>/dev/null`
Expected: no output, or only references already updated in Task 2's doc-comment change. If any README/docs sections list supported providers verbatim, note them but do not edit outside this file — out of scope for this plan.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: document OPENROUTER_API_KEY in .env.example"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers spec section 1 (`providers.ts`). Task 2 covers spec section 2 (`config.ts`, including the confirmed priority slot and the deepseek-vs-openrouter / openrouter-vs-ollama priority tests). Task 3 covers spec section 3 (`llm.ts`, base URL constant, `.chat()` usage, error message). Task 4 covers spec section 4 (`.env.example`). Spec section 5 (tests) is folded into Tasks 1–3 rather than a separate task, since each test suite change is tied to the code it verifies. Spec's "Out of scope" list (embeddings, vision, UI, multi-model routing) has no corresponding task — correct, nothing to build there.
- **Placeholder scan:** none found — every step has complete, copy-pasteable code and exact commands.
- **Type consistency:** `getResolvedCredentials()` return shape (`{ provider, apiKey, model, ollamaBaseUrl }`) used identically in Tasks 2 and 3. `DEFAULT_MODELS.openrouter` string (`"tencent/hunyuan-a13b-instruct:free"`) matches exactly across Tasks 1, 2, and 3. `OPENROUTER_BASE_URL` constant name introduced in Task 3 only — no earlier task references a conflicting name.
