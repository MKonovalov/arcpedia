/**
 * Confidence scoring module for synthesized claims.
 *
 * Computes confidence as weighted agreement across sources
 * and flags low-confidence claims for human review.
 *
 * @module confidence-score
 */

import { logger } from "./logger";
import type { SourcedClaim } from "./synthesize";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of confidence scoring for a single claim. */
export interface ConfidenceResult {
  /** The claim text. */
  claim: string;
  /** Computed confidence score between 0 and 1. */
  confidence: number;
  /** True when the claim is flagged as low-confidence. */
  flagLowConfidence: boolean;
  /** Number of independent sources that agree on this claim. */
  agreeingSources: number;
  /** Total number of unique sources considered. */
  totalSources: number;
}

/** Options for confidence scoring. */
export interface ConfidenceScoreOptions {
  /** Threshold below which claims are flagged as low-confidence (default 0.5). */
  lowConfidenceThreshold?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default low-confidence threshold when none is provided. */
const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.5;

/** Default source quality weight when no explicit weight is provided. */
const DEFAULT_SOURCE_WEIGHT = 0.5;

/** Default expiry period (days) for claims with acceptable confidence. */
const DEFAULT_EXPIRY_DAYS = 30;

/** Expiry period (days) for low-confidence claims. */
const LOW_CONFIDENCE_EXPIRY_DAYS = 7;

// ---------------------------------------------------------------------------
// Expiry computation
// ---------------------------------------------------------------------------

/**
 * Computes an expiry date for a claim based on its confidence score.
 *
 * Claims with confidence at or above the low-confidence threshold
 * receive a 30-day expiry. Claims below the threshold receive a
 * 7-day expiry, ensuring they are refreshed sooner.
 *
 * @param confidence - The claim's confidence score (0–1).
 * @param lowConfidenceThreshold - Threshold below which claims
 *        are considered low-confidence (default 0.5).
 * @returns A `Date` representing when the claim should expire.
 */
export function computeExpiry(
  confidence: number,
  lowConfidenceThreshold?: number,
): Date {
  const threshold =
    lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE_THRESHOLD;
  const days = confidence < threshold ? LOW_CONFIDENCE_EXPIRY_DAYS : DEFAULT_EXPIRY_DAYS;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  return expiry;
}

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------

/**
 * Computes confidence scores for synthesized claims based on weighted
 * agreement across sources.
 *
 * For each unique claim text (normalized), counts the number of
 * independent sources that assert the same claim, averages their
 * source quality weights, and applies the formula:
 *
 *   confidence = (agreeing sources × avg source quality weight) / total sources
 *
 * Claims scoring below {@link lowConfidenceThreshold} are flagged
 * for human review. Confidence distribution (binned by 0.1 intervals)
 * and the count of low-confidence claims are logged at `info` level.
 *
 * @param claims - Synthesized claims with source provenance from
 *                 `synthesizeConcepts`. Each claim must carry a
 *                 `sourceUrl` for source identification.
 * @param sourceWeights - Optional map of source URL → quality weight
 *                        (0–1). Weights default to
 *                        {@link DEFAULT_SOURCE_WEIGHT} for sources
 *                        not present in the map.
 * @param options - Scoring options including the low-confidence threshold.
 * @returns Array of {@link ConfidenceResult}, one per unique claim.
 */
export function scoreConfidence(
  claims: SourcedClaim[],
  sourceWeights?: Map<string, number>,
  options?: ConfidenceScoreOptions,
): ConfidenceResult[] {
  const threshold =
    options?.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE_THRESHOLD;

  if (claims.length === 0) {
    logger.info("confidence-score", "No claims to score");
    return [];
  }

  // Group claims by normalized text.
  const claimGroups = new Map<string, SourcedClaim[]>();
  for (const claim of claims) {
    const key = normalizeClaimText(claim.text);
    const group = claimGroups.get(key) ?? [];
    group.push(claim);
    claimGroups.set(key, group);
  }

  // Collect all unique source URLs across all claims.
  const allSourceUrls = new Set<string>();
  for (const claim of claims) {
    allSourceUrls.add(claim.sourceUrl);
  }
  const totalSources = allSourceUrls.size;

  // Compute confidence for each unique claim.
  const results: ConfidenceResult[] = [];
  for (const [, group] of claimGroups) {
    const uniqueSources = new Set<string>();
    let weightSum = 0;
    for (const claim of group) {
      uniqueSources.add(claim.sourceUrl);
      weightSum += getSourceWeight(claim.sourceUrl, sourceWeights);
    }
    const agreeingSources = uniqueSources.size;
    const avgWeight = weightSum / agreeingSources;
    const confidence =
      (agreeingSources * avgWeight) / totalSources;
    const roundedConfidence = Math.round(confidence * 100) / 100;

    results.push({
      claim: group[0].text,
      confidence: roundedConfidence,
      flagLowConfidence: roundedConfidence < threshold,
      agreeingSources,
      totalSources,
    });
  }

  // Log confidence distribution and low-confidence flags.
  logConfidenceDistribution(results, threshold);

  return results;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize claim text for grouping: lowercase, trim, collapse whitespace. */
function normalizeClaimText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Returns the quality weight for a source URL, falling back to the default. */
function getSourceWeight(
  sourceUrl: string,
  sourceWeights?: Map<string, number>,
): number {
  if (sourceWeights?.has(sourceUrl)) {
    return sourceWeights.get(sourceUrl) ?? DEFAULT_SOURCE_WEIGHT;
  }
  return DEFAULT_SOURCE_WEIGHT;
}

/**
 * Logs the confidence distribution in 0.1-width bins and the count
 * of low-confidence claims at `info` level.
 */
function logConfidenceDistribution(
  results: ConfidenceResult[],
  threshold: number,
): void {
  const bins = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  let lowConfidenceCount = 0;

  for (const result of results) {
    const binIndex = Math.min(
      9,
      Math.floor(result.confidence * 10),
    );
    bins[binIndex]++;
    if (result.flagLowConfidence) {
      lowConfidenceCount++;
    }
  }

  const distribution = bins
    .map((count, i) => `${i * 0.1}-${(i + 1) * 0.1}:${count}`)
    .join(" ");

  logger.info("confidence-score", "Confidence distribution:", {
    distribution,
    totalClaims: results.length,
    lowConfidenceCount,
    threshold,
  });
}