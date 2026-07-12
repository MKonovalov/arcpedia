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
