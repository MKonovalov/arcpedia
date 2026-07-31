import { describe, it, expect } from "vitest";
import {
  extractFactTriples,
  extractTriplesFromClaim,
  extractEntityTriples,
  type FactTriple,
  type TripleOptions,
} from "@/lib/fact-triples";
import {
  type StructuredOutput,
  type StructuredClaim,
} from "@/lib/structured-output";

describe("extractTriplesFromClaim", () => {
  it("should extract a triple from an 'is' claim", () => {
    const claim: StructuredClaim = {
      text: "Alice is an engineer.",
      citations: [],
      confidence: 0.9,
      sourceUrls: ["https://example.com"],
    };
    const result = extractTriplesFromClaim(claim, { minConfidence: 0.5 });

    expect(result).toHaveLength(1);
    expect(result[0].subject).toBe("Alice");
    expect(result[0].predicate).toBe("is");
    expect(result[0].object).toBe("an engineer");
  });

  it("should extract a triple from a 'uses' claim", () => {
    const claim: StructuredClaim = {
      text: "React uses a virtual DOM.",
      citations: [],
      confidence: 0.8,
      sourceUrls: ["https://react.dev"],
    };
    const result = extractTriplesFromClaim(claim, { minConfidence: 0.5 });

    expect(result).toHaveLength(1);
    expect(result[0].subject).toBe("React");
    expect(result[0].predicate).toBe("uses");
    expect(result[0].object).toBe("a virtual DOM");
  });

  it("should return empty for claims below min confidence", () => {
    const claim: StructuredClaim = {
      text: "Alice is an engineer.",
      citations: [],
      confidence: 0.3,
      sourceUrls: ["https://example.com"],
    };
    const result = extractTriplesFromClaim(claim, { minConfidence: 0.5 });
    expect(result).toHaveLength(0);
  });

  it("should return empty for claims with no matching pattern", () => {
    const claim: StructuredClaim = {
      text: "A simple statement.",
      citations: [],
      confidence: 0.9,
      sourceUrls: [],
    };
    const result = extractTriplesFromClaim(claim, { minConfidence: 0.5 });
    expect(result).toHaveLength(0);
  });

  it("should include confidence and citations in the triple", () => {
    const claim: StructuredClaim = {
      text: "Alice is an engineer.",
      citations: ["slug"],
      confidence: 0.85,
      sourceUrls: ["https://example.com"],
    };
    const result = extractTriplesFromClaim(claim, { minConfidence: 0.5 });

    expect(result[0].confidence).toBe(0.85);
    expect(result[0].citations).toContain("https://example.com");
  });
});

describe("extractEntityTriples", () => {
  it("should create type triples for each entity", () => {
    const entities = [
      { name: "Alice", type: "person" },
      { name: "Acme Corp", type: "organization" },
    ];
    const output: StructuredOutput = {
      concept: "Test",
      claims: [],
      citations: ["url1"],
      entities: entities,
      confidence: 0.9,
      sourceUrl: "https://example.com",
      metadata: {
        synthesizedAt: new Date(),
        sourceCount: 1,
        avgConfidence: 0.9,
        disputed: false,
      },
    };

    const result = extractEntityTriples(entities, output);

    expect(result).toHaveLength(2);
    expect(result[0].subject).toBe("Alice");
    expect(result[0].predicate).toBe("is a");
    expect(result[0].object).toBe("person");
    expect(result[1].subject).toBe("Acme Corp");
    expect(result[1].object).toBe("organization");
  });
});

describe("extractFactTriples", () => {
  const baseOutput: StructuredOutput = {
    concept: "Test Concept",
    claims: [
      {
        text: "Alice is an engineer.",
        citations: ["alice-slug"],
        confidence: 0.9,
        sourceUrls: ["https://example.com"],
      },
      {
        text: "Bob was born in Paris.",
        citations: ["bob-slug"],
        confidence: 0.85,
        sourceUrls: ["https://example.com"],
      },
      {
        text: "This is just a neutral statement.",
        citations: [],
        confidence: 0.3,
        sourceUrls: [],
      },
    ],
    citations: ["alice-slug", "bob-slug"],
    entities: [
      { name: "Alice", type: "person" },
    ],
    confidence: 0.85,
    sourceUrl: "https://example.com",
    metadata: {
      synthesizedAt: new Date(),
      sourceCount: 1,
      avgConfidence: 0.85,
      disputed: false,
    },
  };

  it("should extract triples from high-confidence claims and entities", () => {
    const { triples, summary } = extractFactTriples(baseOutput, { minConfidence: 0.5 });

    expect(triples.length).toBeGreaterThanOrEqual(3);
    expect(summary.tripleCount).toBe(triples.length);
  });

  it("should filter claims below min confidence", () => {
    const { triples } = extractFactTriples(baseOutput, { minConfidence: 0.8 });

    expect(triples.some((t) => t.subject.includes("neutral"))).toBe(false);
  });

  it("should compute coverage ratio", () => {
    const { summary } = extractFactTriples(baseOutput, { minConfidence: 0.5 });

    expect(summary.coverage).toBeGreaterThan(0);
    expect(summary.coverage).toBeLessThanOrEqual(1);
  });

  it("should provide source breakdown", () => {
    const { summary } = extractFactTriples(baseOutput, { minConfidence: 0.5 });

    expect(summary.sourceBreakdown.length).toBeGreaterThan(0);
    expect(summary.sourceBreakdown[0]).toHaveProperty("sourceUrl");
    expect(summary.sourceBreakdown[0]).toHaveProperty("tripleCount");
  });

  it("should handle empty claims", () => {
    const result = extractFactTriples(
      { ...baseOutput, claims: [], entities: [] },
      { minConfidence: 0.5 },
    );
    expect(result.triples).toHaveLength(0);
    expect(result.summary.tripleCount).toBe(0);
    expect(result.summary.coverage).toBe(0);
  });
});
