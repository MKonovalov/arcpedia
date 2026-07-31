import { describe, it, expect } from "vitest";
import {
  formatForEmbedding,
  formatTriplesForEmbedding,
  type EmbeddingTriple,
  type EmbeddingFormatMode,
} from "@/lib/embedding-format";
import { type FactTriple } from "@/lib/fact-triples";

describe("formatForEmbedding", () => {
  const baseTriple: FactTriple = {
    subject: "Alice",
    predicate: "is",
    object: "engineer",
    confidence: 0.9,
    citations: ["https://example.com"],
  };

  it("should format triple as natural sentence by default", () => {
    const result = formatForEmbedding(baseTriple);
    expect(result.text).toBe("Alice is an engineer");
    expect(result.mode).toBe("natural");
    expect(result.triple).toEqual(baseTriple);
  });

  it("should format triple as pipe-delimited for 'triple' mode", () => {
    const result = formatForEmbedding(baseTriple, "triple");
    expect(result.text).toBe("Alice|is|engineer");
    expect(result.mode).toBe("triple");
  });

  it("should format triple as full sentence for 'sentence' mode", () => {
    const result = formatForEmbedding(baseTriple, "sentence");
    expect(result.text).toBe("Alice is an engineer (source: https://example.com)");
    expect(result.mode).toBe("sentence");
  });

  it("should handle vowel-initial objects with 'an' article", () => {
    const triple: FactTriple = {
      subject: "Bob",
      predicate: "is",
      object: "engineer",
      confidence: 0.9,
      citations: [],
    };
    const result = formatForEmbedding(triple, "natural");
    expect(result.text).toBe("Bob is an engineer");
  });

  it("should handle predicate 'born in' specially", () => {
    const triple: FactTriple = {
      subject: "Alice",
      predicate: "born in",
      object: "Paris",
      confidence: 0.9,
      citations: [],
    };
    const result = formatForEmbedding(triple, "natural");
    expect(result.text).toBe("Alice was born in Paris");
  });

  it("should handle predicate 'has' specially", () => {
    const triple: FactTriple = {
      subject: "Company",
      predicate: "has",
      object: "products",
      confidence: 0.9,
      citations: [],
    };
    const result = formatForEmbedding(triple, "natural");
    expect(result.text).toBe("Company has products");
  });

  it("should handle unknown predicates with default format", () => {
    const triple: FactTriple = {
      subject: "X",
      predicate: "custom-rel",
      object: "Y",
      confidence: 0.9,
      citations: [],
    };
    const result = formatForEmbedding(triple, "natural");
    expect(result.text).toBe("X custom-rel Y");
  });
});

describe("formatTriplesForEmbedding", () => {
  const triples: FactTriple[] = [
    { subject: "Alice", predicate: "is", object: "engineer", confidence: 0.9, citations: [] },
    { subject: "Bob", predicate: "uses", object: "TypeScript", confidence: 0.8, citations: [] },
    { subject: "Low", predicate: "is", object: "bad", confidence: 0.3, citations: [] },
  ];

  it("should format all triples by default", () => {
    const result = formatTriplesForEmbedding(triples);
    expect(result).toHaveLength(3);
  });

  it("should filter by min confidence", () => {
    const result = formatTriplesForEmbedding(triples, { minConfidence: 0.5 });
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.triple.confidence >= 0.5)).toBe(true);
  });

  it("should apply specified mode", () => {
    const result = formatTriplesForEmbedding(triples, { mode: "triple", minConfidence: 0.5 });
    expect(result[0].text).toBe("Alice|is|engineer");
    expect(result[1].text).toBe("Bob|uses|TypeScript");
  });

  it("should handle empty input", () => {
    const result = formatTriplesForEmbedding([]);
    expect(result).toHaveLength(0);
  });

  it("should return EmbeddingTriple objects with triple and mode", () => {
    const result = formatTriplesForEmbedding(triples, { minConfidence: 0.5 });
    expect(result[0]).toHaveProperty("text");
    expect(result[0]).toHaveProperty("triple");
    expect(result[0]).toHaveProperty("mode");
  });
});
