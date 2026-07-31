/**
 * Embedding-ready formatting for fact triples.
 *
 * Converts {@link FactTriple} objects into vector-friendly text
 * representations suitable for embedding-based retrieval systems.
 *
 * @module embedding-format
 */

import { logger } from "./logger";
import type { FactTriple } from "./fact-triples";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Formatting modes for embedding-friendly text. */
export type EmbeddingFormatMode = "natural" | "triple" | "sentence";

/** An embedding-ready formatted triple. */
export interface EmbeddingTriple {
  /** The formatted text representation suitable for embedding. */
  text: string;
  /** The original triple data. */
  triple: FactTriple;
  /** The format mode used. */
  mode: EmbeddingFormatMode;
}

/** Options for embedding formatting. */
export interface EmbeddingFormatOptions {
  /** The formatting mode to use (default "natural"). */
  mode?: EmbeddingFormatMode;
  /** Whether to include confidence threshold filtering. */
  minConfidence?: number;
}

// ---------------------------------------------------------------------------
// Formatting functions
// ---------------------------------------------------------------------------

/**
 * Format a triple as a natural language sentence.
 *
 * Example: `{subject: "Alice", predicate: "is", object: "engineer"}`
 * → `"Alice is an engineer"`
 *
 * @param triple - The triple to format.
 * @returns A natural language sentence.
 */
function toNaturalSentence(triple: FactTriple): string {
  const { subject, predicate, object } = triple;
  const article = ["a", "e", "i", "o", "u"].includes(
    object[0]?.toLowerCase() ?? "",
  )
    ? "an"
    : "a";

  switch (predicate) {
    case "is":
      return `${subject} is ${article} ${object}`;
    case "born in":
      return `${subject} was born in ${object}`;
    case "founded in":
      return `${subject} was founded in ${object}`;
    case "located in":
      return `${subject} is located in ${object}`;
    case "has":
      return `${subject} has ${object}`;
    case "includes":
      return `${subject} includes ${object}`;
    case "uses":
      return `${subject} uses ${object}`;
    case "created by":
      return `${subject} was created by ${object}`;
    case "type of":
      return `${subject} is ${article} ${object}`;
    default:
      return `${subject} ${predicate} ${object}`;
  }
}

/**
 * Format a triple as a compact "subject|predicate|object" string.
 *
 * Example: `{subject: "Alice", predicate: "is", object: "engineer"}`
 * → `"Alice|is|engineer"`
 *
 * @param triple - The triple to format.
 * @returns A pipe-delimited triple string.
 */
function toTripleString(triple: FactTriple): string {
  return `${triple.subject}|${triple.predicate}|${triple.object}`;
}

/**
 * Format a triple as a full sentence with source attribution.
 *
 * Example: `{subject: "Alice", predicate: "is", object: "engineer"}`
 * → `"Alice is an engineer (source: example.com)"`
 *
 * @param triple - The triple to format.
 * @returns A full sentence with source attribution.
 */
function toSentence(triple: FactTriple): string {
  const base = toNaturalSentence(triple);
  const source =
    triple.citations.length > 0 ? ` (source: ${triple.citations[0]})` : "";
  return `${base}${source}`;
}

/**
 * Convert a {@link FactTriple} into an embedding-friendly text format.
 *
 * @param triple - The triple to format.
 * @param mode - The formatting mode to use.
 * @returns An {@link EmbeddingTriple} with formatted text and original data.
 */
export function formatForEmbedding(
  triple: FactTriple,
  mode: EmbeddingFormatMode = "natural",
): EmbeddingTriple {
  const text =
    mode === "natural"
      ? toNaturalSentence(triple)
      : mode === "triple"
        ? toTripleString(triple)
        : toSentence(triple);

  return { text, triple, mode };
}

/**
 * Convert multiple fact triples into embedding-ready text representations.
 *
 * Filters by minimum confidence if specified, then formats each triple
 * according to the selected mode. Returns both the formatted texts
 * (for embedding input) and the structured embedding triples (with metadata).
 *
 * Logs the conversion count at `info` level.
 *
 * @param triples - The fact triples to format.
 * @param options - Formatting options.
 * @returns An array of embedding-ready triples with formatted text.
 */
export function formatTriplesForEmbedding(
  triples: FactTriple[],
  options?: EmbeddingFormatOptions,
): EmbeddingTriple[] {
  const minConfidence = options?.minConfidence ?? 0;
  const mode = options?.mode ?? "natural";

  const filtered = triples.filter(
    (t) => t.confidence >= minConfidence,
  );

  const result = filtered.map((triple) =>
    formatForEmbedding(triple, mode),
  );

  logger.info("embedding-format", "Triples formatted for embedding", {
    inputCount: triples.length,
    outputCount: result.length,
    mode,
    minConfidence,
  });

  return result;
}
