import { describe, it, expect, vi, beforeEach } from "vitest";
import { synthesizeConcepts } from "../synthesize";
import { computeExpiry } from "../confidence-score";
import type { SourcedClaim } from "../synthesize";
import type { ConceptExtractionResult } from "../extract-concepts";
import { logger } from "../logger";

vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockedLogger = vi.mocked(logger);

function makeExtractionResult(overrides: Partial<ConceptExtractionResult>): ConceptExtractionResult {
  return {
    concept: "Test Concept",
    claims: [],
    citations: [],
    entities: [],
    confidence: 0.7,
    sourceUrl: "https://example.com",
    ...overrides,
  };
}

describe("synthesizeConcepts", () => {
  beforeEach(() => {
    mockedLogger.info.mockClear();
  });

  it("returns an empty result for an empty input array", () => {
    const result = synthesizeConcepts([]);

    expect(result.concept).toBe("");
    expect(result.claims).toEqual([]);
    expect(result.citations).toEqual([]);
    expect(result.entities).toEqual([]);
    expect(result.confidence).toBe(0);
  });

  it("returns a single-source result unchanged with provenance attached", () => {
    const result = makeExtractionResult({
      concept: "Machine Learning",
      claims: [
        { text: "ML is a subset of AI.", citations: ["AI.md"], confidence: 0.8 },
      ],
      citations: ["AI.md"],
      entities: [{ name: "Machine Learning", type: "concept" }],
      confidence: 0.8,
      sourceUrl: "https://source-a.com",
    });

    const synthesized = synthesizeConcepts([result]);
    const claims = synthesized.claims as SourcedClaim[];

    expect(synthesized.concept).toBe("Machine Learning");
    expect(claims).toHaveLength(1);
    expect(claims[0].sourceUrl).toBe("https://source-a.com");
    expect(claims[0].text).toBe("ML is a subset of AI.");
    expect(synthesized.citations).toContain("AI.md");
    expect(synthesized.confidence).toBe(0.8);
    expect(synthesized.sourceUrl).toBe("https://source-a.com");
  });

  it("merges claims from multiple sources without conflicts", () => {
    const sourceA = makeExtractionResult({
      concept: "RAG",
      claims: [
        { text: "RAG retrieves relevant documents.", citations: ["rag.md"], confidence: 0.8 },
      ],
      citations: ["rag.md"],
      confidence: 0.8,
      sourceUrl: "https://source-a.com",
    });
    const sourceB = makeExtractionResult({
      concept: "RAG",
      claims: [
        { text: "RAG improves LLM accuracy.", citations: ["llm.md"], confidence: 0.7 },
      ],
      citations: ["llm.md"],
      confidence: 0.7,
      sourceUrl: "https://source-b.com",
    });

    const synthesized = synthesizeConcepts([sourceA, sourceB]);

    expect(synthesized.concept).toBe("RAG");
    expect(synthesized.claims).toHaveLength(2);
    expect(synthesized.citations).toContain("rag.md");
    expect(synthesized.citations).toContain("llm.md");
    expect(synthesized.sourceUrl).toBe("https://source-a.com; https://source-b.com");
  });

  it("resolves conflicting claims by keeping the higher-confidence source", () => {
    const sourceA = makeExtractionResult({
      concept: "Transformers",
      claims: [
        { text: "Transformers use self-attention.", citations: ["transformer.md"], confidence: 0.9 },
      ],
      citations: ["transformer.md"],
      confidence: 0.9,
      sourceUrl: "https://high-confidence.com",
    });
    const sourceB = makeExtractionResult({
      concept: "Transformers",
      claims: [
        { text: "Transformers use self-attention.", citations: ["attention.md"], confidence: 0.6 },
      ],
      citations: ["attention.md"],
      confidence: 0.6,
      sourceUrl: "https://low-confidence.com",
    });

    const synthesized = synthesizeConcepts([sourceA, sourceB]);
    const claims = synthesized.claims as SourcedClaim[];

    expect(claims).toHaveLength(1);
    expect(claims[0].sourceUrl).toBe("https://high-confidence.com");
    expect(claims[0].confidence).toBe(0.9);
    expect(mockedLogger.info).toHaveBeenCalled();
  });

  it("preserves provenance for each claim", () => {
    const sourceA = makeExtractionResult({
      concept: "LLM",
      claims: [
        { text: "LLMs generate text.", citations: [], confidence: 0.8 },
      ],
      confidence: 0.8,
      sourceUrl: "https://source-a.com",
    });
    const sourceB = makeExtractionResult({
      concept: "LLM",
      claims: [
        { text: "LLMs are language models.", citations: [], confidence: 0.7 },
      ],
      confidence: 0.7,
      sourceUrl: "https://source-b.com",
    });

    const synthesized = synthesizeConcepts([sourceA, sourceB]);
    const claims = synthesized.claims as SourcedClaim[];

    const sourceUrls = claims.map((c) => c.sourceUrl);
    expect(sourceUrls).toContain("https://source-a.com");
    expect(sourceUrls).toContain("https://source-b.com");
  });

  it("deduplicates citations across sources", () => {
    const sourceA = makeExtractionResult({
      concept: "AI",
      claims: [],
      citations: ["ai.md", "ml.md"],
      confidence: 0.8,
      sourceUrl: "https://source-a.com",
    });
    const sourceB = makeExtractionResult({
      concept: "AI",
      claims: [],
      citations: ["ai.md", "dl.md"],
      confidence: 0.7,
      sourceUrl: "https://source-b.com",
    });

    const synthesized = synthesizeConcepts([sourceA, sourceB]);

    expect(synthesized.citations).toContain("ai.md");
    expect(synthesized.citations).toContain("ml.md");
    expect(synthesized.citations).toContain("dl.md");
    expect(synthesized.citations.filter((c) => c === "ai.md")).toHaveLength(1);
  });

  it("deduplicates entities across sources", () => {
    const sourceA = makeExtractionResult({
      concept: "AI",
      claims: [],
      entities: [
        { name: "Artificial Intelligence", type: "concept" },
        { name: "Google", type: "organization" },
      ],
      confidence: 0.8,
      sourceUrl: "https://source-a.com",
    });
    const sourceB = makeExtractionResult({
      concept: "AI",
      claims: [],
      entities: [
        { name: "Artificial Intelligence", type: "concept" },
        { name: "OpenAI", type: "organization" },
      ],
      confidence: 0.7,
      sourceUrl: "https://source-b.com",
    });

    const synthesized = synthesizeConcepts([sourceA, sourceB]);

    const conceptEntities = synthesized.entities.filter(
      (e) => e.type === "concept",
    );
    expect(conceptEntities).toHaveLength(1);
    expect(synthesized.entities.some((e) => e.name === "Google")).toBe(true);
    expect(synthesized.entities.some((e) => e.name === "OpenAI")).toBe(true);
  });

  it("computes merged confidence with corroboration bonus", () => {
    const sourceA = makeExtractionResult({
      concept: "Test",
      claims: [],
      confidence: 0.8,
      sourceUrl: "https://source-a.com",
    });
    const sourceB = makeExtractionResult({
      concept: "Test",
      claims: [],
      confidence: 0.7,
      sourceUrl: "https://source-b.com",
    });

    const synthesized = synthesizeConcepts([sourceA, sourceB]);

    expect(synthesized.confidence).toBe(0.8);
  });

  it("logs synthesis decisions for conflict resolutions", () => {
    const sourceA = makeExtractionResult({
      concept: "Conflict",
      claims: [
        { text: "Same claim.", citations: [], confidence: 0.9 },
      ],
      confidence: 0.9,
      sourceUrl: "https://winner.com",
    });
    const sourceB = makeExtractionResult({
      concept: "Conflict",
      claims: [
        { text: "Same claim.", citations: [], confidence: 0.5 },
      ],
      confidence: 0.5,
      sourceUrl: "https://loser.com",
    });

    synthesizeConcepts([sourceA, sourceB]);

    const conflictLogs = mockedLogger.info.mock.calls.filter(
      (call) =>
        typeof call[1] === "string" &&
        call[1].includes("claim-conflict-resolved"),
    );
    expect(conflictLogs.length).toBeGreaterThanOrEqual(1);
  });

  it("logs synthesis completion with summary stats", () => {
    const sourceA = makeExtractionResult({
      concept: "Summary Test",
      claims: [
        { text: "Claim one.", citations: [], confidence: 0.8 },
      ],
      confidence: 0.8,
      sourceUrl: "https://source-a.com",
    });
    const sourceB = makeExtractionResult({
      concept: "Summary Test",
      claims: [
        { text: "Claim two.", citations: [], confidence: 0.7 },
      ],
      confidence: 0.7,
      sourceUrl: "https://source-b.com",
    });

    synthesizeConcepts([sourceA, sourceB]);

    const completionLog = mockedLogger.info.mock.calls.find(
      (call) =>
        typeof call[1] === "string" && call[1] === "Synthesis complete:",
    );
    expect(completionLog).toBeDefined();
    if (completionLog) {
      expect(completionLog[2]).toMatchObject({
        concept: "Summary Test",
        sourceCount: 2,
      });
    }
  });

  it("attaches expiryAt and confidenceMeta to every synthesized claim", () => {
    const sourceA = makeExtractionResult({
      concept: "ML",
      claims: [
        { text: "ML is a subset of AI.", citations: [], confidence: 0.8 },
      ],
      confidence: 0.8,
      sourceUrl: "https://source-a.com",
    });

    const synthesized = synthesizeConcepts([sourceA]);
    const claims = synthesized.claims as SourcedClaim[];

    expect(claims).toHaveLength(1);
    expect(claims[0].expiryAt).toBeInstanceOf(Date);
    expect(claims[0].confidenceMeta).toBeDefined();
    expect(claims[0].confidenceMeta).toMatchObject({
      confidenceScore: 0.8,
      sourceCount: 1,
      lastSynthesizedAt: expect.any(Date),
      expiryAt: expect.any(Date),
    });
    expect(claims[0].confidenceMeta!.expiryAt.getTime()).toBe(
      claims[0].expiryAt!.getTime(),
    );
  });

  it("sets 30-day expiry for claims with confidence >= 0.5", () => {
    const sourceA = makeExtractionResult({
      concept: "HighConf",
      claims: [
        { text: "This is a high-confidence claim.", citations: [], confidence: 0.8 },
      ],
      confidence: 0.8,
      sourceUrl: "https://source-a.com",
    });

    const synthesized = synthesizeConcepts([sourceA]);
    const claims = synthesized.claims as SourcedClaim[];

    const expiryAt = claims[0].expiryAt!;
    const now = new Date();
    const diffDays =
      (expiryAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(30, 0);
  });

  it("sets 7-day expiry for low-confidence claims (< 0.5)", () => {
    const sourceA = makeExtractionResult({
      concept: "LowConf",
      claims: [
        { text: "This is a low-confidence claim.", citations: [], confidence: 0.3 },
      ],
      confidence: 0.3,
      sourceUrl: "https://source-a.com",
    });

    const synthesized = synthesizeConcepts([sourceA]);
    const claims = synthesized.claims as SourcedClaim[];

    const expiryAt = claims[0].expiryAt!;
    const now = new Date();
    const diffDays =
      (expiryAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 0);
  });

  it("logs metadata assignment per claim", () => {
    const sourceA = makeExtractionResult({
      concept: "Logging",
      claims: [
        { text: "Claims should be logged.", citations: [], confidence: 0.7 },
      ],
      confidence: 0.7,
      sourceUrl: "https://source-a.com",
    });

    synthesizeConcepts([sourceA]);

    const metaLogs = mockedLogger.info.mock.calls.filter(
      (call) =>
        typeof call[0] === "string" && call[0] === "synthesize" && call[1] === "Metadata assigned to claim:",
    );
    expect(metaLogs.length).toBeGreaterThanOrEqual(1);
  });

  it("includes confidenceMeta with correct sourceCount and timestamps", () => {
    const sourceA = makeExtractionResult({
      concept: "Meta",
      claims: [
        { text: "Meta claim.", citations: [], confidence: 0.6 },
      ],
      confidence: 0.6,
      sourceUrl: "https://source-a.com",
    });

    const beforeSynth = new Date();
    const synthesized = synthesizeConcepts([sourceA]);
    const afterSynth = new Date();
    const claims = synthesized.claims as SourcedClaim[];

    const meta = claims[0].confidenceMeta!;
    expect(meta.sourceCount).toBe(1);
    expect(meta.confidenceScore).toBe(0.6);
    expect(meta.lastSynthesizedAt.getTime()).toBeGreaterThanOrEqual(beforeSynth.getTime());
    expect(meta.lastSynthesizedAt.getTime()).toBeLessThanOrEqual(afterSynth.getTime());
  });
});