/**
 * Fact triple extraction module for embedding-based retrieval.
 *
 * Extracts subject-predicate-object triples from synthesized concept
 * data. Each triple includes confidence scores and source citations
 * for traceability.
 *
 * @module fact-triples
 */

import { logger } from "./logger";
import type { StructuredOutput, StructuredClaim, StructuredEntity } from "./structured-output";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A subject-predicate-object fact triple with metadata. */
export interface FactTriple {
  /** The subject of the triple (a concept, person, place, etc.). */
  subject: string;
  /** The relationship or predicate between subject and object. */
  predicate: string;
  /** The object of the triple (the target of the relationship). */
  object: string;
  /** Confidence score for this triple (0–1). */
  confidence: number;
  /** Source URL(s) this triple was derived from. */
  citations: string[];
}

/** Options for triple extraction. */
export interface TripleOptions {
  /** Minimum confidence threshold for extracting triples (default 0.5). */
  minConfidence?: number;
}

/** Summary of triple extraction for a concept. */
export interface TripleExtractionSummary {
  /** Number of triples extracted. */
  tripleCount: number;
  /** Coverage ratio of claims that yielded triples (0–1). */
  coverage: number;
  /** Per-source triple breakdown. */
  sourceBreakdown: Array<{ sourceUrl: string; tripleCount: number }>;
}

// ---------------------------------------------------------------------------
// Predicate patterns
// ---------------------------------------------------------------------------

/** Common predicate patterns for extracting triples from claim text. */
const PREDICATE_PATTERNS: { pattern: RegExp; predicate: string }[] = [
  { pattern: /(.+?)\s+(?:is|was|are|were)\s+(.+?)\s*(?:\.|$)/i, predicate: "is" },
  { pattern: /(.+?)\s+(?:was born in|born in)\s+(.+?)\s*(?:\.|$)/i, predicate: "born in" },
  { pattern: /(.+?)\s+(?:was founded in|founded in|founded)\s+(.+?)\s*(?:\.|$)/i, predicate: "founded in" },
  { pattern: /(.+?)\s+(?:is located in|located in|based in)\s+(.+?)\s*(?:\.|$)/i, predicate: "located in" },
  { pattern: /(.+?)\s+(?:has|have)\s+(.+?)\s*(?:\.|$)/i, predicate: "has" },
  { pattern: /(.+?)\s+(?:includes|contains)\s+(.+?)\s*(?:\.|$)/i, predicate: "includes" },
  {
    pattern: /(.+?)\s+(?:uses|uses the|relies on|relies on (?:the)?)\s+(.+?)\s*(?:\.|$)/i,
    predicate: "uses",
  },
  { pattern: /(.+?)\s+(?:was created by|created by|by)\s+(.+?)\s*(?:\.|$)/i, predicate: "created by" },
  { pattern: /(.+?)\s+(?:a|an|the)\s+(.+?)\s*(?:of|in)\s+(.+?)\s*(?:\.|$)/i, predicate: "type of" },
];

// ---------------------------------------------------------------------------
// Triple extraction
// ---------------------------------------------------------------------------

/**
 * Extract fact triples from a single claim using pattern matching.
 *
 * Scans the claim text for predicate patterns and extracts
 * subject-predicate-object triples. Falls back to entity-based
 * triples if no patterns match.
 *
 * @param claim - The claim to extract triples from.
 * @param options - Extraction options.
 * @returns An array of {@link FactTriple} objects.
 */
export function extractTriplesFromClaim(
  claim: StructuredClaim,
  options?: TripleOptions,
): FactTriple[] {
  const minConfidence = options?.minConfidence ?? 0.5;
  if (claim.confidence < minConfidence) return [];

  const triples: FactTriple[] = [];
  const text = claim.text.trim();

  for (const { pattern, predicate } of PREDICATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      triples.push({
        subject: match[1].trim(),
        predicate,
        object: match[2].trim(),
        confidence: claim.confidence,
        citations: claim.sourceUrls.length > 0 ? claim.sourceUrls : claim.citations,
      });
      break;
    }
  }

  return triples;
}

/**
 * Extract fact triples from all entities in a structured output.
 *
 * Creates type-relationship triples for each entity (e.g.,
 * "EntityName is a <type>").
 *
 * @param entities - The entities to generate triples for.
 * @param output - The parent structured output for citation context.
 * @returns An array of entity type triples.
 */
export function extractEntityTriples(
  entities: StructuredEntity[],
  output: StructuredOutput,
): FactTriple[] {
  return entities.map((entity) => ({
    subject: entity.name,
    predicate: "is a",
    object: entity.type,
    confidence: output.confidence,
    citations: output.citations,
  }));
}

/**
 * Extract all fact triples from a {@link StructuredOutput}.
 *
 * This combines claim-based triples (extracted via pattern matching)
 * and entity-based triples (type relationships). Returns both
 * the triples and a summary of extraction statistics.
 *
 * Logs triple count and coverage at `info` level.
 *
 * @param output - The structured output to extract triples from.
 * @param options - Options for triple extraction.
 * @returns An object with `triples` and `summary`.
 */
export function extractFactTriples(
  output: StructuredOutput,
  options?: TripleOptions,
): { triples: FactTriple[]; summary: TripleExtractionSummary } {
  const minConfidence = options?.minConfidence ?? 0.5;
  const claimTriples = output.claims
    .filter((c) => c.confidence >= minConfidence)
    .flatMap((claim) => extractTriplesFromClaim(claim, options));

  const entityTriples = extractEntityTriples(
    output.entities as StructuredEntity[],
    output,
  );

  const allTriples = [...claimTriples, ...entityTriples];

  const sourceBreakdownMap = new Map<string, number>();
  for (const triple of allTriples) {
    for (const url of triple.citations) {
      sourceBreakdownMap.set(url, (sourceBreakdownMap.get(url) ?? 0) + 1);
    }
  }

  const eligibleClaims = output.claims.filter(
    (c) => c.confidence >= minConfidence,
  );
  const claimsWithTriples = new Set(
    claimTriples.map((t) => t.citations).flat(),
  );
  const coverage =
    eligibleClaims.length > 0
      ? claimsWithTriples.size / eligibleClaims.length
      : 0;

  const summary: TripleExtractionSummary = {
    tripleCount: allTriples.length,
    coverage: Number(coverage.toFixed(4)),
    sourceBreakdown: Array.from(sourceBreakdownMap.entries()).map(
      ([sourceUrl, tripleCount]) => ({ sourceUrl, tripleCount }),
    ),
  };

  logger.info("fact-triples", "Fact triples extracted", {
    concept: output.concept,
    tripleCount: allTriples.length,
    coverage: summary.coverage,
  });

  return { triples: allTriples, summary };
}
