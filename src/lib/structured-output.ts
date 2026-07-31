/**
 * Structured output engine for agent-readable concept pages.
 *
 * Converts synthesized {@link ConceptExtractionResult} data into a
 * machine-readable JSON structure suitable for agent consumption,
 * including claims with citations, source attributions, confidence,
 * and entity metadata.
 *
 * @module structured-output
 */

import { logger } from "./logger";
import type { ConceptExtractionResult } from "./extract-concepts";
import type { SynthesisDecision } from "./synthesize";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** A single claim in the structured output, enriched with all metadata. */
export interface StructuredClaim {
  /** The claim text (a factual assertion). */
  text: string;
  /** Wiki slugs or URLs cited as evidence for this claim. */
  citations: string[];
  /** Confidence for this claim, 0–1. */
  confidence: number;
  /** The source URL(s) this claim was extracted from. */
  sourceUrls: string[];
  /** When this claim expires and should be re-verified. */
  expiryAt?: Date;
}

/** A named entity in the structured output. */
export interface StructuredEntity {
  /** The entity name. */
  name: string;
  /** The entity type. */
  type: string;
}

/** Metadata describing the structured output generation. */
export interface StructuredMetadata {
  /** When the structured output was generated. */
  synthesizedAt: Date;
  /** Number of unique source URLs contributing to this output. */
  sourceCount: number;
  /** Average confidence across all claims. */
  avgConfidence: number;
  /** Whether any claims are disputed (from conflict detection). */
  disputed: boolean;
}

/** The machine-readable structured output for a concept. */
export interface StructuredOutput {
  /** The canonical concept name. */
  concept: string;
  /** Structured claims with full metadata. */
  claims: StructuredClaim[];
  /** Unique citation slugs/URLs found across all claims. */
  citations: string[];
  /** Named entities identified in the content. */
  entities: StructuredEntity[];
  /** Overall confidence score (0–1). */
  confidence: number;
  /** The primary source URL for this concept. */
  sourceUrl: string;
  /** Metadata about the structured output generation. */
  metadata: StructuredMetadata;
  /** Decisions made during synthesis (conflict resolutions, merges). */
  decisions?: SynthesisDecision[];
  /** Whether the concept page is flagged as disputed. */
  disputed?: boolean;
}

// ---------------------------------------------------------------------------
// Structured output generation
// ---------------------------------------------------------------------------

/**
 * Compute the average expiry across all claims that have an expiry set.
 *
 * @param claims - Claims to scan for expiry dates.
 * @returns The average expiry Date, or undefined if no claims have expiry.
 */
function computeAverageExpiry(claims: StructuredClaim[]): Date | undefined {
  const dates = claims
    .map((c) => c.expiryAt)
    .filter((d): d is Date => d !== undefined);
  if (dates.length === 0) return undefined;
  const avgMs =
    dates.reduce((sum, d) => sum + d.getTime(), 0) / dates.length;
  return new Date(avgMs);
}

/**
 * Convert a {@link ConceptExtractionResult} into a machine-readable
 * {@link StructuredOutput}.
 *
 * This enriches claims with source URLs (from provenance data if available),
 * computes aggregate metrics (source count, average confidence, dispute status),
 * and attaches synthesis decisions and dispute flags from prior processing steps.
 *
 * Logs the structured output generation at `info` level for observability.
 *
 * @param result - The synthesized concept extraction result.
 * @param options - Optional enrichment data.
 * @param options.decisions - Synthesis decisions from the merge phase.
 * @param options.disputed - Whether conflict detection found disputes.
 * @returns A {@link StructuredOutput} JSON object for agent consumption.
 */
export function toStructuredOutput(
  result: ConceptExtractionResult,
  options?: {
    decisions?: SynthesisDecision[];
    disputed?: boolean;
  },
): StructuredOutput {
  const claims: StructuredClaim[] = result.claims.map((claim) => ({
    text: claim.text,
    citations: claim.citations ?? [],
    confidence: claim.confidence ?? 0,
    sourceUrls: [result.sourceUrl].filter((s) => s.length > 0),
  }));

  const sourceCount = new Set(
    result.claims
      .flatMap((c) => c.citations)
      .concat([result.sourceUrl])
      .filter((s) => s.length > 0),
  ).size;

  const avgConfidence =
    claims.length > 0
      ? claims.reduce((sum, c) => sum + c.confidence, 0) / claims.length
      : result.confidence ?? 0;

  const structuredOutput: StructuredOutput = {
    concept: result.concept ?? "",
    claims,
    citations: result.citations ?? [],
    entities: (result.entities ?? []).map((e) => ({
      name: e.name,
      type: e.type,
    })),
    confidence: result.confidence ?? 0,
    sourceUrl: result.sourceUrl ?? "",
    metadata: {
      synthesizedAt: new Date(),
      sourceCount,
      avgConfidence: Number(avgConfidence.toFixed(4)),
      disputed: options?.disputed ?? false,
    },
    decisions: options?.decisions,
    disputed: options?.disputed ?? false,
  };

  logger.info("structured-output", "Structured output generated", {
    concept: structuredOutput.concept,
    claimCount: claims.length,
    sourceCount,
    avgConfidence: structuredOutput.metadata.avgConfidence,
    disputed: structuredOutput.disputed,
  });

  return structuredOutput;
}

/**
 * Convert a {@link StructuredOutput} to a JSON string for API responses.
 *
 * @param output - The structured output to serialize.
 * @returns A JSON string with proper date serialization.
 */
export function toStructuredJson(output: StructuredOutput): string {
  return JSON.stringify(output, (key, value) => {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }, 2);
}
