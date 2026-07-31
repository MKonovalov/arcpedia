import { describe, it, expect, vi } from "vitest";
import {
  validateStructuredOutput,
  sanitizeStructuredOutput,
  hasValidCitations,
  STRUCTURED_OUTPUT_SCHEMA,
} from "@/lib/output-schema";
import {
  type StructuredOutput,
  type StructuredClaim,
} from "@/lib/structured-output";
import { toStructuredOutput } from "@/lib/structured-output";

describe("validateStructuredOutput", () => {
  const validOutput: StructuredOutput = {
    concept: "Test Concept",
    claims: [
      {
        text: "Test claim",
        citations: ["slug"],
        confidence: 0.8,
        sourceUrls: ["https://example.com"],
      },
    ],
    citations: ["slug"],
    entities: [{ name: "Entity", type: "concept" }],
    confidence: 0.9,
    sourceUrl: "https://example.com",
    metadata: {
      synthesizedAt: new Date(),
      sourceCount: 1,
      avgConfidence: 0.9,
      disputed: false,
    },
  };

  it("should pass validation for valid output", () => {
    const result = validateStructuredOutput(validOutput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should fail when concept is missing", () => {
    const result = validateStructuredOutput({ ...validOutput, concept: "" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "concept" }),
    );
  });

  it("should fail when claims is not an array", () => {
    const result = validateStructuredOutput({
      ...validOutput,
      claims: "not an array" as unknown as StructuredOutput["claims"],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "claims" }),
    );
  });

  it("should fail when confidence is out of range", () => {
    const result = validateStructuredOutput({
      ...validOutput,
      confidence: 1.5,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "confidence" }),
    );
  });

  it("should fail when avgConfidence is out of range", () => {
    const result = validateStructuredOutput({
      ...validOutput,
      metadata: { ...validOutput.metadata, avgConfidence: -0.1 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "metadata.avgConfidence" }),
    );
  });

  it("should fail when a claim has empty text", () => {
    const result = validateStructuredOutput({
      ...validOutput,
      claims: [
        {
          text: "",
          citations: ["slug"],
          confidence: 0.8,
          sourceUrls: [],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "claims[0].text" }),
    );
  });

  it("should fail when a claim lacks citations", () => {
    const result = validateStructuredOutput({
      ...validOutput,
      claims: [
        {
          text: "Test claim",
          citations: [],
          confidence: 0.8,
          sourceUrls: [],
        },
      ],
    });
    expect(result.valid).toBe(true);
  });
});

describe("hasValidCitations", () => {
  it("should return true when all claims have citations", () => {
    const output: StructuredOutput = {
      concept: "Test",
      claims: [
        { text: "Claim 1", citations: ["a"], confidence: 0.8, sourceUrls: [] },
        { text: "Claim 2", citations: ["b", "c"], confidence: 0.7, sourceUrls: [] },
      ],
      citations: ["a", "b", "c"],
      entities: [],
      confidence: 0.75,
      sourceUrl: "https://example.com",
      metadata: {
        synthesizedAt: new Date(),
        sourceCount: 1,
        avgConfidence: 0.75,
        disputed: false,
      },
    };
    expect(hasValidCitations(output)).toBe(true);
  });

  it("should return false when any claim lacks citations", () => {
    const output: StructuredOutput = {
      concept: "Test",
      claims: [
        { text: "Claim 1", citations: ["a"], confidence: 0.8, sourceUrls: [] },
        { text: "Claim 2", citations: [], confidence: 0.7, sourceUrls: [] },
      ],
      citations: ["a"],
      entities: [],
      confidence: 0.75,
      sourceUrl: "https://example.com",
      metadata: {
        synthesizedAt: new Date(),
        sourceCount: 1,
        avgConfidence: 0.75,
        disputed: false,
      },
    };
    expect(hasValidCitations(output)).toBe(false);
  });
});

describe("sanitizeStructuredOutput", () => {
  it("should fill in defaults for missing fields", () => {
    const result = sanitizeStructuredOutput({
      concept: "",
      claims: [],
      citations: [],
      entities: [],
      confidence: 0,
      sourceUrl: "",
    });

    expect(result.concept).toBe("");
    expect(result.claims).toEqual([]);
    expect(result.metadata.synthesizedAt).toBeInstanceOf(Date);
    expect(result.metadata.disputed).toBe(false);
  });

  it("should preserve existing values", () => {
    const now = new Date();
    const input: Partial<StructuredOutput> = {
      concept: "Test",
      claims: [
        { text: "Claim", citations: ["a"], confidence: 0.9, sourceUrls: ["url"] },
      ],
      citations: ["a"],
      entities: [{ name: "Entity", type: "concept" }],
      confidence: 0.9,
      sourceUrl: "https://example.com",
    };

    const result = sanitizeStructuredOutput(input);
    expect(result.concept).toBe("Test");
    expect(result.claims).toHaveLength(1);
    expect(result.entities).toHaveLength(1);
  });
});
