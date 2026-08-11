import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateCitations, hasValidCitations } from "../validate-citations";
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

describe("hasValidCitations", () => {
  it("returns true when a claim has citations", () => {
    const claim = { text: "AI is transformative.", citations: ["AI.md"], confidence: 0.9 };
    expect(hasValidCitations(claim)).toBe(true);
  });

  it("returns true when a claim has multiple citations", () => {
    const claim = { text: "RAG improves retrieval.", citations: ["rag.md", "https://example.com"], confidence: 0.8 };
    expect(hasValidCitations(claim)).toBe(true);
  });

  it("returns false when a claim has no citations", () => {
    const claim = { text: "Some unverified claim.", citations: [], confidence: 0.5 };
    expect(hasValidCitations(claim)).toBe(false);
  });

  it("returns false when citations is undefined", () => {
    const claim = { text: "No citations here.", citations: [], confidence: 0.5 };
    expect(hasValidCitations(claim)).toBe(false);
  });
});

describe("validateCitations", () => {
  beforeEach(() => {
    mockedLogger.info.mockClear();
    mockedLogger.warn.mockClear();
    mockedLogger.error.mockClear();
  });

  it("returns all claims valid when every claim has citations", () => {
    const result = makeExtractionResult({
      concept: "Machine Learning",
      claims: [
        { text: "ML is a subset of AI.", citations: ["AI.md"], confidence: 0.8 },
        { text: "ML models learn from data.", citations: ["ML.md"], confidence: 0.75 },
      ],
    });

    const validation = validateCitations(result);

    expect(validation.validCount).toBe(2);
    expect(validation.invalidCount).toBe(0);
    expect(validation.totalChecked).toBe(2);
    expect(validation.valid).toHaveLength(2);
    expect(validation.invalid).toHaveLength(0);
    expect(validation.valid[0].claim.text).toBe("ML is a subset of AI.");
    expect(validation.valid[1].claim.text).toBe("ML models learn from data.");
  });

  it("separates valid claims from invalid claims", () => {
    const result = makeExtractionResult({
      concept: "RAG",
      claims: [
        { text: "RAG retrieves relevant documents.", citations: ["rag.md"], confidence: 0.8 },
        { text: "Unverified claim without source.", citations: [], confidence: 0.5 },
      ],
    });

    const validation = validateCitations(result);

    expect(validation.validCount).toBe(1);
    expect(validation.invalidCount).toBe(1);
    expect(validation.totalChecked).toBe(2);
    expect(validation.valid[0].claim.text).toBe("RAG retrieves relevant documents.");
    expect(validation.invalid[0].reason).toContain("Unverified claim without source");
  });

  it("flags all claims as invalid when none have citations", () => {
    const result = makeExtractionResult({
      concept: "Unverified Topic",
      claims: [
        { text: "Claim one without source.", citations: [], confidence: 0.5 },
        { text: "Claim two without source.", citations: [], confidence: 0.4 },
      ],
    });

    const validation = validateCitations(result);

    expect(validation.validCount).toBe(0);
    expect(validation.invalidCount).toBe(2);
    expect(validation.totalChecked).toBe(2);
    expect(validation.invalid).toEqual(
      validation.invalid.map((c) => ({ claim: c.claim, reason: expect.stringContaining("has no source URL citations") })),
    );
  });

  it("handles an empty claims array", () => {
    const result = makeExtractionResult({
      concept: "Empty Concept",
      claims: [],
    });

    const validation = validateCitations(result);

    expect(validation.validCount).toBe(0);
    expect(validation.invalidCount).toBe(0);
    expect(validation.totalChecked).toBe(0);
    expect(validation.valid).toEqual([]);
    expect(validation.invalid).toEqual([]);
  });

  it("logs a warning for each citation gap", () => {
    const result = makeExtractionResult({
      concept: "Broken Concept",
      claims: [
        { text: "Claim with no citation.", citations: [], confidence: 0.5 },
      ],
    });

    validateCitations(result);

    expect(mockedLogger.warn).toHaveBeenCalledWith(
      "validate-citations",
      "Citation gap detected:",
      expect.objectContaining({
        concept: "Broken Concept",
      }),
    );
  });

  it("logs an error when validation fails", () => {
    const result = makeExtractionResult({
      concept: "Broken Concept",
      claims: [
        { text: "Claim with no citation.", citations: [], confidence: 0.5 },
      ],
    });

    validateCitations(result);

    expect(mockedLogger.error).toHaveBeenCalledWith(
      "validate-citations",
      expect.stringContaining("Citation validation failed"),
      expect.objectContaining({
        concept: "Broken Concept",
        invalidCount: 1,
        totalChecked: 1,
      }),
    );
  });

  it("logs an info message when all claims pass validation", () => {
    const result = makeExtractionResult({
      concept: "Clean Concept",
      claims: [
        { text: "Claim with citation.", citations: ["ref.md"], confidence: 0.8 },
      ],
    });

    validateCitations(result);

    expect(mockedLogger.info).toHaveBeenCalledWith(
      "validate-citations",
      expect.stringContaining("Citation validation passed"),
      expect.objectContaining({
        concept: "Clean Concept",
        totalChecked: 1,
      }),
    );
  });

  it("includes the source URL from the result in validation logs", () => {
    const result = makeExtractionResult({
      concept: "Sourced Concept",
      sourceUrl: "https://source.example.com",
      claims: [
        { text: "Claim with no citation.", citations: [], confidence: 0.5 },
      ],
    });

    validateCitations(result);

    expect(mockedLogger.warn).toHaveBeenCalledWith(
      "validate-citations",
      "Citation gap detected:",
      expect.objectContaining({
        sourceUrl: "https://source.example.com",
      }),
    );
  });
});