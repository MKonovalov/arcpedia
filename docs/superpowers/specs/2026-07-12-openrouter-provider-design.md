# OpenRouter LLM provider — design

## Goal

Add OpenRouter as a selectable LLM provider, alongside the existing
Anthropic / OpenAI / Google / DeepSeek / Ollama options, so the app can use
any model OpenRouter proxies — starting with Tencent Hunyuan A13B Instruct
(free tier, `tencent/hunyuan-a13b-instruct:free`) — without adding a new SDK
dependency or changing the app's single-active-provider architecture.

## Context

The app runs exactly one active LLM provider at a time. Which one is
active is resolved by `getEffectiveProvider()` / `getResolvedCredentials()`
in `src/lib/config.ts`:

1. `detectEnvProvider()` checks env vars in priority order and returns the
   first match (currently: `ANTHROPIC_API_KEY` > `OPENAI_API_KEY` >
   `GOOGLE_GENERATIVE_AI_API_KEY` > `DEEPSEEK_API_KEY` > `OLLAMA_BASE_URL` /
   `OLLAMA_MODEL`).
2. If no env var matches, falls back to the `provider` field in the config
   file (`.llm-wiki-config.json`, settings UI).
3. Model name resolution: `LLM_MODEL` env override > config file `model` >
   provider default (`DEFAULT_MODELS[provider]`).

`src/lib/llm.ts`'s `getModel()` switches on the resolved provider to build
the Vercel AI SDK model instance. DeepSeek is not a separate SDK package —
it's OpenAI wire-compatible, so it reuses `@ai-sdk/openai`'s
`createOpenAI({ baseURL: DEEPSEEK_BASE_URL })`, called via `.chat(model)`
(not the default callable, which targets OpenAI's `/responses` endpoint that
DeepSeek doesn't implement).

OpenRouter is also OpenAI Chat Completions-compatible
(`https://openrouter.ai/api/v1/chat/completions`), so the same pattern
applies directly — no new dependency needed.

## Design

### 1. `src/lib/providers.ts`

- Add `{ value: "openrouter", label: "OpenRouter" }` to `PROVIDER_INFO`.
- Add `openrouter: "tencent/hunyuan-a13b-instruct:free"` to `DEFAULT_MODELS`.

This automatically flows into `VALID_PROVIDERS`, the settings UI's provider
`<select>` (`ProviderForm.tsx`), and the model field's placeholder text —
no UI code changes needed, since those are all derived from `PROVIDER_INFO`
/ `DEFAULT_MODELS`.

### 2. `src/lib/config.ts`

- `detectEnvProvider()`: add a check for `OPENROUTER_API_KEY`, placed
  **after** the `DEEPSEEK_API_KEY` check and **before** the Ollama check —
  i.e. priority order becomes Anthropic > OpenAI > Google > DeepSeek >
  OpenRouter > Ollama. This is the lowest-priority API-key-based provider:
  it only activates if none of the higher-priority keys are set, preserving
  existing behavior for anyone already relying on the current order.
- `getResolvedCredentials()`: add an `openrouter` branch reading
  `OPENROUTER_API_KEY` into `apiKey`, mirroring the existing per-provider
  branches.
- Doc comments listing supported providers/env vars (in `hasLLMKey()` and
  `getResolvedCredentials()`) updated to mention `OPENROUTER_API_KEY`.

### 3. `src/lib/llm.ts`

- Add an `openrouter` case to the `getModel()` switch:

  ```ts
  case "openrouter": {
    const openrouter = createOpenAI({
      apiKey: creds.apiKey!,
      baseURL: "https://openrouter.ai/api/v1",
    });
    return openrouter.chat(model);
  }
  ```

- Update the "No LLM API key found" error message to mention
  `OPENROUTER_API_KEY` alongside the other supported env vars.
- Add an `OPENROUTER_BASE_URL` constant next to `DEEPSEEK_BASE_URL`, same
  style (a named constant rather than an inline string).

### 4. `.env.example`

- Document `OPENROUTER_API_KEY` in the LLM section, with a comment showing
  that `LLM_MODEL` (free-text override, already supported) is how you pick
  a *specific* OpenRouter-hosted model — e.g.
  `LLM_MODEL=tencent/hunyuan-a13b-instruct:free`, or swap in any other
  OpenRouter model slug (Llama, Gemini, DeepSeek variants, etc.) without any
  code change.

### 5. Tests

Mirror the existing DeepSeek coverage:

- `src/lib/__tests__/config.test.ts` — add cases equivalent to the existing
  `"detects deepseek from DEEPSEEK_API_KEY with its default model"` and
  `"honors LLM_MODEL override for deepseek"` tests, for `openrouter`.
- Add a priority-order test confirming OpenRouter is only selected when no
  higher-priority key is set, and that it's picked over Ollama when both
  `OPENROUTER_API_KEY` and `OLLAMA_BASE_URL` are present.
- `src/lib/__tests__/*llm*` (wherever `getModel()`'s switch is covered,
  following the DeepSeek `.chat()` precedent) — add an equivalent case for
  `openrouter` confirming `.chat(model)` is used with the OpenRouter base
  URL.

## Out of scope

- **Embeddings** — OpenRouter is not added to `EMBEDDING_PROVIDERS`. Same
  as DeepSeek today (no embedding models).
- **Vision** — no special-casing. `callVisionLLM()` already works
  generically against whatever model `getModel()` returns; if the
  configured OpenRouter model is multimodal, it works — same code path as
  every other provider.
- **UI changes** — the settings page's provider `<select>` and model
  `<input>` are already generic over `PROVIDER_INFO` / `DEFAULT_MODELS`; no
  component changes required.
- **Multi-model / per-feature routing** — still exactly one active
  provider+model at a time, resolved the same way as today. Switching
  between OpenRouter-hosted models (Tencent Hy3:Free vs. something else) is
  done by changing `LLM_MODEL`, not by running multiple models
  concurrently.
