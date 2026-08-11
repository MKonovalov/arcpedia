/**
 * Synthesis engine for canonical concept pages.
 *
 * Combines claims from multiple sources into a unified concept page,
 * preserving source provenance and resolving conflicts by confidence
 * score. Higher-confidence sources take priority when claims conflict.
 *
 * @module synthesize
 */

import { computeExpiry } from "./confidence-score";
import { logger } from "./logger";
import type {
  ConceptExtractionResult,
  ExtractedClaim,
  ExtractedEntity,
} from "./extract-concepts";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** A claim enriched with the source URL it was extracted from. */
export interface SourcedClaim extends ExtractedClaim {
  /** The source URL this claim was extracted from. */
  sourceUrl: string;
  /** Expiry date for this claim after synthesis. */
  expiryAt?: Date;
  /** Confidence metadata for this claim. */
  confidenceMeta?: {
    /** The confidence score of the claim. */
    confidenceScore: number;
    /** Number of sources contributing to this claim. */
    sourceCount: number;
    /** Timestamp of when the claim was last synthesized. */
    lastSynthesizedAt: Date;
    /** The date when this claim expires. */
    expiryAt: Date;
  };
}

/** A decision made during synthesis (conflict resolution or merge). */
export interface SynthesisDecision {
  /** The kind of decision that was made. */
  type: "claim-added" | "claim-merged" | "claim-conflict-resolved";
  /** The claim text involved in the decision. */
  claim: string;
  /** The winning source URL. */
  sourceUrl: string;
  /** The confidence of the winning claim. */
  confidence: number;
  /** Optional explanation of how the conflict was resolved. */
  resolution?: string;
}

// ---------------------------------------------------------------------------
// Synthesis
// ---------------------------------------------------------------------------

/**
 * Synthesize an array of {@link ConceptExtractionResult} objects into a
 * single canonical {@link ConceptExtractionResult} for a concept.
 *
 * Claims from all sources are merged; when conflicting claims exist
 * (same normalized claim text from different sources), the
 * higher-confidence source wins. Source provenance is preserved by
 * attaching each claim's source URL. Citations and entities are
 * deduplicated across all sources. Overall confidence is computed as
 * the average of source confidences plus a corroboration bonus.
 *
 * Logs every synthesis decision and conflict resolution at `info`
 * level for observability.
 *
 * @param results - Array of extraction results from multiple sources
 *                  for the same concept.
 * @returns A unified {@link ConceptExtractionResult} with merged claims,
 *          resolved conflicts, and preserved provenance.
 */
export function synthesizeConcepts(
  results: ConceptExtractionResult[],
): ConceptExtractionResult {
  if (results.length === 0) {
    return {
      concept: "",
      claims: [],
      citations: [],
      entities: [],
      confidence: 0,
      sourceUrl: "",
    };
  }

  if (results.length === 1) {
    const sole = results[0];
    const now = new Date();
    const claims: SourcedClaim[] = sole.claims.map((c) => {
      const expiryAt = computeExpiry(c.confidence);
      const confidenceMeta = {
        confidenceScore: c.confidence,
        sourceCount: 1,
        lastSynthesizedAt: now,
        expiryAt,
      };
      logger.info("synthesize", "Metadata assigned to claim:", {
        claim: c.text.slice(0, 120),
        expiryAt,
        confidenceMeta,
      });
      return { ...c, sourceUrl: sole.sourceUrl, expiryAt, confidenceMeta };
    });
    logger.info("synthesize", "Single source — using claims as-is:", {
      concept: sole.concept,
      claimCount: claims.length,
      sourceUrl: sole.sourceUrl,
    });
    return { ...sole, claims };
  }

  const decisions: SynthesisDecision[] = [];

  // Collect all claims with source provenance attached.
  const allClaims: SourcedClaim[] = [];
  for (const result of results) {
    for (const claim of result.claims) {
      allClaims.push({ ...claim, sourceUrl: result.sourceUrl });
    }
  }

  // Group claims by normalized text to detect duplicates across sources.
  const claimGroups = new Map<string, SourcedClaim[]>();
  for (const claim of allClaims) {
    const key = normalizeClaimText(claim.text);
    const group = claimGroups.get(key) ?? [];
    group.push(claim);
    claimGroups.set(key, group);
  }

  // Resolve conflicts and build the merged claim list.
  const mergedClaims: SourcedClaim[] = [];
  for (const [, group] of claimGroups) {
    if (group.length === 1) {
      mergedClaims.push(group[0]);
      decisions.push({
        type: "claim-added",
        claim: group[0].text,
        sourceUrl: group[0].sourceUrl,
        confidence: group[0].confidence,
      });
    } else {
      const sorted = [...group].sort((a, b) => b.confidence - a.confidence);
      const winner = sorted[0];
      const losers = sorted.slice(1);
      mergedClaims.push(winner);
      decisions.push({
        type: "claim-conflict-resolved",
        claim: winner.text,
        sourceUrl: winner.sourceUrl,
        confidence: winner.confidence,
        resolution: `Kept claim from ${winner.sourceUrl} (conf ${winner.confidence}) over ${losers.map((l) => `${l.sourceUrl} (conf ${l.confidence})`).join(", ")}`,
      });
    }
  }

  // Merge citations and entities across all sources.
  const mergedCitations = mergeDedupedStrings(
    results.map((r) => r.citations),
  );
  const mergedEntities = mergeDedupedEntities(
    results.map((r) => r.entities),
  );
  const mergedConfidence = computeMergedConfidence(results);
  const concept = results[0].concept;
  const sourceUrl = results.map((r) => r.sourceUrl).join("; ");

  // Attach expiry and confidence metadata to every merged claim.
  const now = new Date();
  const claimedWithMeta: SourcedClaim[] = mergedClaims.map((claim) => {
    const expiryAt = computeExpiry(claim.confidence);
    const confidenceMeta = {
      confidenceScore: claim.confidence,
      sourceCount: 1,
      lastSynthesizedAt: now,
      expiryAt,
    };
    logger.info("synthesize", "Metadata assigned to claim:", {
      claim: claim.text.slice(0, 120),
      expiryAt,
      confidenceMeta,
    });
    return { ...claim, expiryAt, confidenceMeta };
  });

  // Log all synthesis decisions.
  for (const decision of decisions) {
    logger.info("synthesize", `Synthesis decision [${decision.type}]:`, {
      claim: decision.claim.slice(0, 120),
      sourceUrl: decision.sourceUrl,
      confidence: decision.confidence,
      resolution: decision.resolution,
    });
  }

  logger.info("synthesize", "Synthesis complete:", {
    concept,
    sourceCount: results.length,
    claimCount: claimedWithMeta.length,
    conflictCount: decisions.filter(
      (d) => d.type === "claim-conflict-resolved",
    ).length,
    mergedConfidence,
  });

  return {
    concept,
    claims: claimedWithMeta as ExtractedClaim[],
    citations: mergedCitations,
    entities: mergedEntities,
    confidence: mergedConfidence,
    sourceUrl,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize claim text for conflict detection: lowercase, trim, collapse whitespace. */
function normalizeClaimText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Merge arrays of strings, deduplicating by value, preserving first-seen order. */
function mergeDedupedStrings(arrays: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const arr of arrays) {
    for (const item of arr) {
      if (!seen.has(item)) {
        seen.add(item);
        out.push(item);
      }
    }
  }
  return out;
}

/** Merge arrays of entities, deduplicating by name+type, preserving first-seen order. */
function mergeDedupedEntities(arrays: ExtractedEntity[][]): ExtractedEntity[] {
  const seen = new Set<string>();
  const out: ExtractedEntity[] = [];
  for (const arr of arrays) {
    for (const item of arr) {
      const key = `${item.name.toLowerCase()}:${item.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
  }
  return out;
}

/**
 * Compute merged confidence from multiple source confidence scores.
 *
 * Uses the average of source confidences plus a corroboration bonus
 * of +0.05 per additional source (capped at +0.15), clamped to
 * [0.3, 0.95] and rounded to 2 decimals.
 *
 * @param results - The source results whose confidences are combined.
 * @returns A merged confidence score between 0.3 and 0.95.
 */
function computeMergedConfidence(
  results: ConceptExtractionResult[],
): number {
  if (results.length === 0) return 0;
  const confidences = results.map((r) => r.confidence);
  const avg =
    confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
  const corroboration = Math.min(
    0.15,
    Math.max(0, confidences.length - 1) * 0.05,
  );
  return Math.round(Math.min(0.95, Math.max(0.3, avg + corroboration)) * 100) / 100;
}