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
