/**
 * Citation validation module for synthesized concept claims.
 *
 * Enforces the requirement that every claim must have at least one
 * source URL citation. Claims without citations are flagged as invalid.
 *
 * @module validate-citations
 */

import { logger } from "./logger";
import type { ConceptExtractionResult } from "./extract-concepts";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** A claim confirmed to have at least one source URL citation. */
export interface ValidClaim {
  /** The claim that passed citation validation. */
  claim: ConceptExtractionResult["claims"][number];
  /** The source URL(s) cited for this claim. */
  citations: string[];
}

/** A claim that lacks any source URL citation. */
export interface InvalidClaim {
  /** The claim that failed citation validation. */
  claim: ConceptExtractionResult["claims"][number];
  /** The reason the claim was rejected. */
  reason: string;
}

/** The result of validating citations on a set of claims. */
export interface ValidationResult {
  /** Claims that have at least one source URL citation. */
  valid: ValidClaim[];
  /** Claims that are missing source URL citations. */
  invalid: InvalidClaim[];
  /** Total number of claims checked. */
  totalChecked: number;
  /** Number of claims that passed validation. */
  validCount: number;
  /** Number of claims that failed validation. */
  invalidCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when a claim has at least one source URL citation.
 *
 * A claim is considered to have valid citations when its `citations`
 * array is non-empty, meaning at least one wiki slug or external URL
 * is attached as evidence for the claim text.
 *
 * @param claim - The claim to check for citations.
 * @returns `true` if the claim has one or more citations, `false` otherwise.
 */
export function hasValidCitations(
  claim: ConceptExtractionResult["claims"][number],
): boolean {
  return Array.isArray(claim.citations) && claim.citations.length > 0;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that every claim in a {@link ConceptExtractionResult} has at
 * least one source URL citation.
 *
 * Claims are separated into `valid` (has citations) and `invalid`
 * (missing citations). Citation gaps and validation errors are logged
 * at `warn` and `error` level respectively for observability.
 *
 * @param result - The synthesized extraction result whose claims
 *                 should be validated.
 * @returns A {@link ValidationResult} containing valid and invalid
 *          claims with counts and details.
 */
export function validateCitations(
  result: ConceptExtractionResult,
): ValidationResult {
  const valid: ValidClaim[] = [];
  const invalid: InvalidClaim[] = [];

  for (const claim of result.claims) {
    if (hasValidCitations(claim)) {
      valid.push({
        claim,
        citations: claim.citations,
      });
    } else {
      const reason = `Claim has no source URL citations: "${claim.text.slice(0, 120)}"`;
      invalid.push({ claim, reason });
      logger.warn("validate-citations", "Citation gap detected:", {
        concept: result.concept,
        claim: claim.text.slice(0, 120),
        sourceUrl: result.sourceUrl,
      });
    }
  }

  const totalChecked = result.claims.length;
  const validCount = valid.length;
  const invalidCount = invalid.length;

  if (invalidCount > 0) {
    logger.error("validate-citations", `Citation validation failed: ${invalidCount} of ${totalChecked} claims lack citations for concept "${result.concept}".`, {
      concept: result.concept,
      invalidCount,
      totalChecked,
    });
  } else {
    logger.info("validate-citations", `Citation validation passed: all ${totalChecked} claims have citations for concept "${result.concept}".`, {
      concept: result.concept,
      totalChecked,
    });
  }

  return { valid, invalid, totalChecked, validCount, invalidCount };
}
