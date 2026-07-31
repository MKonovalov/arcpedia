import { describe, it, expect } from "vitest";
import { toStructuredOutput, toStructuredJson, type StructuredOutput } from "@/lib/structured-output";
import { type ConceptExtractionResult } from "@/lib/extract-concepts";

describe("toStructuredOutput", () => {
  const baseResult: ConceptExtractionResult = {
    concept: "Test Concept",
    claims: [
      {
        text: "This is a claim about the concept.",
        citations: ["source-slug"],
        confidence: 0.85,
      },
    ],
    citations: ["source-slug", "other-source"],
    entities: [
      { name: "Test Entity", type: "concept" },
      { name: "Test Org", type: "organization" },
    ],
    confidence: 0.9,
    sourceUrl: "https://example.com/source",
  };

  it("should convert a ConceptExtractionResult into StructuredOutput", () => {
    const result = toStructuredOutput(baseResult);

    expect(result.concept).toBe("Test Concept");
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].text).toBe("This is a claim about the concept.");
    expect(result.claims[0].confidence).toBe(0.85);
    expect(result.claims[0].sourceUrls).toContain("https://example.com/source");
    expect(result.citations).toEqual(["source-slug", "other-source"]);
    expect(result.entities).toHaveLength(2);
    expect(result.entities[0].name).toBe("Test Entity");
    expect(result.entities[0].type).toBe("concept");
    expect(result.confidence).toBe(0.9);
    expect(result.sourceUrl).toBe("https://example.com/source");
  });

  it("should include metadata with synthesis timestamp and aggregate metrics", () => {
    const result = toStructuredOutput(baseResult);

    expect(result.metadata.synthesizedAt).toBeInstanceOf(Date);
    expect(result.metadata.sourceCount).toBe(2); // source-slug + other-source + sourceUrl deduped
    expect(result.metadata.avgConfidence).toBeCloseTo(0.85, 2);
    expect(result.metadata.disputed).toBe(false);
  });

  it("should carry over disputed flag from options", () => {
    const result = toStructuredOutput(baseResult, { disputed: true });
    expect(result.disputed).toBe(true);
    expect(result.metadata.disputed).toBe(true);
  });

  it("should carry over synthesis decisions from options", () => {
    const decisions = [
      {
        type: "claim-added" as const,
        claim: "Added claim",
        sourceUrl: "https://example.com",
        confidence: 0.9,
      },
    ];
    const result = toStructuredOutput(baseResult, { decisions });
    expect(result.decisions).toEqual(decisions);
  });

  it("should handle empty claims array", () => {
    const result = toStructuredOutput({
      ...baseResult,
      claims: [],
    });

    expect(result.claims).toEqual([]);
    expect(result.metadata.avgConfidence).toBe(0.9);
    expect(result.metadata.sourceCount).toBe(1);
  });

  it("should handle empty entities array", () => {
    const result = toStructuredOutput({
      ...baseResult,
      entities: [],
    });
    expect(result.entities).toEqual([]);
  });

  it("should handle multiple claims with correct avgConfidence", () => {
    const result = toStructuredOutput({
      ...baseResult,
      claims: [
        { text: "Claim A", citations: ["a"], confidence: 0.8 },
        { text: "Claim B", citations: ["b"], confidence: 0.6 },
      ],
    });
    expect(result.metadata.avgConfidence).toBeCloseTo(0.7, 2);
  });
});

describe("toStructuredJson", () => {
  const output: StructuredOutput = {
    concept: "Test",
    claims: [],
    citations: [],
    entities: [],
    confidence: 0.5,
    sourceUrl: "https://example.com",
    metadata: {
      synthesizedAt: new Date("2024-01-01T00:00:00.000Z"),
      sourceCount: 1,
      avgConfidence: 0.5,
      disputed: false,
    },
  };

  it("should serialize dates to ISO strings in JSON output", () => {
    const json = toStructuredJson(output);
    const parsed = JSON.parse(json) as StructuredOutput;
    expect(parsed.metadata.synthesizedAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("should produce valid JSON", () => {
    const json = toStructuredJson(output);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});
