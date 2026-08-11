import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractConcepts,
  extractClaims,
  extractCitations,
  extractEntities,
  computeExtractionConfidence,
} from "../extract-concepts";
import type { UrlIngestResult } from "../ingest-url";
import { buildSourceEntry } from "../sources";
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

function makeUrlIngestResult(overrides: Partial<UrlIngestResult>): UrlIngestResult {
  const sourceEntry = buildSourceEntry(overrides.sourceUrl ?? "https://example.com", overrides.sourceEntry?.type ?? "url", overrides.sourceEntry?.triggered_by ?? "system");
  return {
    title: "Example Concept",
    content: "",
    sourceUrl: "https://example.com",
    metadata: {
      sourceUrl: overrides.sourceUrl ?? "https://example.com",
      fetchedAt: "2026-01-01",
      contentLength: 0,
      sourceType: "url",
    },
    sourceEntry,
    ...overrides,
  };
}

describe("extractConcepts", () => {
  beforeEach(() => {
    mockedLogger.info.mockClear();
  });

  it("returns a structured result with concept, claims, citations, entities, and confidence", () => {
    const result = makeUrlIngestResult({
      title: "Machine Learning",
       content:
        "CONCEPT: Machine Learning\n\nMachine learning is a subset of artificial intelligence that provides systems the ability to automatically learn and improve from experience **without being explicitly programmed**.\n\nAccording to recent studies [1], ML models can generalize from training data. See [ML](ML.md) and [AI](AI.md).\n",
    });

    const extraction = extractConcepts(result);

    expect(extraction.concept).toBe("Machine Learning");
    expect(extraction.claims.length).toBeGreaterThan(0);
    expect(extraction.citations).toContain("ML");
    expect(extraction.citations).toContain("AI");
    expect(extraction.entities.length).toBeGreaterThan(0);
    expect(extraction.confidence).toBeGreaterThanOrEqual(0.3);
    expect(extraction.confidence).toBeLessThanOrEqual(0.95);
    expect(extraction.sourceUrl).toBe("https://example.com");
  });

  it("falls back to the page title when no CONCEPT marker is present", () => {
    const result = makeUrlIngestResult({
      title: "Transformers Architecture",
      content: "The transformer architecture is based on self-attention mechanisms. See `attention.md`.",
    });

    const extraction = extractConcepts(result);

    expect(extraction.concept).toBe("Transformers Architecture");
  });

  it("logs extraction metrics at info level", () => {
    const result = makeUrlIngestResult({
      title: "Test Concept",
      content: "This is a test claim [1].",
    });

    extractConcepts(result);

    expect(mockedLogger.info).toHaveBeenCalledWith(
      "extract-concepts",
      "Extracted concepts:",
      expect.objectContaining({
        concept: "Test Concept",
        claimCount: expect.any(Number),
        citationCount: expect.any(Number),
        entityCount: expect.any(Number),
        confidence: expect.any(Number),
        sourceUrl: "https://example.com",
      }),
    );
  });

  it("returns empty claims for content with no claim sentences", () => {
    const result = makeUrlIngestResult({
      title: "Simple Page",
      content: "# Simple Page\n\nThis is just a paragraph with no claims or citations.\n",
    });

    const extraction = extractConcepts(result);

    expect(extraction.claims).toEqual([]);
  });
});

describe("extractClaims", () => {
  it("identifies sentences with wiki internal citations as claims", () => {
    const content = "Machine learning is a subset of AI [ML](ML.md). Neural networks are a key component [NN](nn.md).";
    const claims = extractClaims(content);

    expect(claims.length).toBeGreaterThanOrEqual(1);
  });

  it("identifies sentences with external URLs as claims", () => {
    const content = 'Deep learning has revolutionized NLP according to [this paper](https://example.com/paper).';
    const claims = extractClaims(content);

    expect(claims.length).toBeGreaterThanOrEqual(1);
  });

  it("identifies sentences with bold assertions as claims", () => {
    const content = "The **Transformers** architecture is the dominant approach for NLP tasks at present.";
    const claims = extractClaims(content);

    expect(claims.length).toBe(1);
  });

  it("identifies sentences with footnote references as claims", () => {
    const content = "The first neural network was proposed in 1958 [1].";
    const claims = extractClaims(content);

    expect(claims.length).toBe(1);
  });

  it("identifies sentences with source attribution as claims", () => {
    const content = "According to recent research, diffusion models have improved significantly.";
    const claims = extractClaims(content);

    expect(claims.length).toBe(1);
  });

  it("does not treat headings or structural lines as claims", () => {
    const content = "# Heading\n## Summary\nCONCEPT: Test\n\n- A bullet point";
    const claims = extractClaims(content);

    expect(claims.length).toBe(0);
  });

  it("returns an empty array for empty content", () => {
    expect(extractClaims("")).toEqual([]);
  });
});

describe("extractCitations", () => {
  it("extracts wiki internal link citations", () => {
    const content = "See [transformer](transformer.md) and [attention](attention.md) for details.";
    const citations = extractCitations(content);

    expect(citations).toContain("transformer");
    expect(citations).toContain("attention");
  });

  it("extracts external URL citations", () => {
    const content = "See [this paper](https://example.com/research) for more info.";
    const citations = extractCitations(content);

    expect(citations).toContain("https://example.com/research");
  });

  it("returns unique citations only", () => {
    const content = "See [model](model.md) for details. Also see [model](model.md) again.";
    const citations = extractCitations(content);

    expect(citations.filter((c) => c === "model").length).toBe(1);
  });

  it("returns an empty array for content with no citations", () => {
    expect(extractCitations("No citations here.")).toEqual([]);
  });
});

describe("extractEntities", () => {
  it("extracts a concept from the CONCEPT marker", () => {
    const content = "CONCEPT: Natural Language Processing\n\nSome content here.";
    const entities = extractEntities(content);

    expect(entities.some((e) => e.name === "Natural Language Processing" && e.type === "concept")).toBe(true);
  });

  it("extracts organizations containing known suffixes", () => {
    const content = "Research at Google LLC and Stanford University shows significant progress.";
    const entities = extractEntities(content);

    expect(entities.some((e) => e.name === "Google LLC" && e.type === "organization")).toBe(true);
    expect(entities.some((e) => e.name === "Stanford University" && e.type === "organization")).toBe(true);
  });

  it("extracts technology terms", () => {
    const content = "Deep learning and neural networks are key AI technologies.";
    const entities = extractEntities(content);

    expect(entities.some((e) => e.type === "technology")).toBe(true);
  });

  it("extracts dates", () => {
    const content = "The model was released on 2024-03-15.";
    const entities = extractEntities(content);

    expect(entities.some((e) => e.type === "date" && e.name === "2024-03-15")).toBe(true);
  });
});

describe("computeExtractionConfidence", () => {
  it("returns a higher confidence for url-type sources than text-type", () => {
    const urlEntry = buildSourceEntry("https://example.com", "url", "system");
    const textEntry = buildSourceEntry("text-paste", "text", "system");

    const urlConfidence = computeExtractionConfidence(urlEntry);
    const textConfidence = computeExtractionConfidence(textEntry);

    expect(urlConfidence).toBeGreaterThan(textConfidence);
  });

  it("returns a value within the expected range", () => {
    const entry = buildSourceEntry("https://example.com", "url");
    const confidence = computeExtractionConfidence(entry);

    expect(confidence).toBeGreaterThanOrEqual(0.3);
    expect(confidence).toBeLessThanOrEqual(0.95);
  });
});

