/**
 * Conflict detection module for the ingestion pipeline.
 *
 * Compares claims extracted from multiple sources on the same concept,
 * identifies contradictions where sources disagree on key facts (dates,
 * names, outcomes), and assigns a severity level to each conflict.
 *
 * Used by the reconciliation step to flag pages that contain
 * unresolvable contradictions between their sources.
 */

import { logger } from "./logger";
import type { ConceptExtractionResult, ExtractedClaim } from "./extract-concepts";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Severity of a detected conflict between sources. */
export type ConflictSeverity = "warning" | "error";

/** A single conflict between two sources on the same claim topic. */
export interface Conflict {
  /** The claim text that is in conflict across sources. */
  claimText: string;
  /** The conflicting claims from each source, keyed by source URL. */
  conflictingClaims: Record<string, string>;
  /** Severity of the conflict. */
  severity: ConflictSeverity;
  /** Confidence score for the conflict (0–1), based on claim confidence values. */
  confidence: number;
  /** Entity or topic that the conflicting claims reference. */
  topic: string;
}

/** Result of conflict detection across multiple sources. */
export interface ConflictResult {
  /** The canonical concept name being analyzed. */
  concept: string;
  /** All detected conflicts, grouped by claim text. */
  conflicts: ConflictGroup[];
  /** Overall severity: `error` if any conflict is severity error, else `warning` if any warning, else `none`. */
  severity: ConflictSeverity | "none";
  /** Total number of individual conflicts detected. */
  conflictCount: number;
  /** All source URLs that contributed to the conflict analysis. */
  sourceUrls: string[];
  /** The claims that were involved in conflicts. */
  affectedClaims: string[];
}

/** A group of conflicts that share the same base claim text. */
export interface ConflictGroup {
  /** The base claim text that sources disagree on. */
  claimText: string;
  /** Individual conflict entries for this claim across sources. */
  entries: ConflictEntry[];
  /** Highest severity among the entries. */
  severity: ConflictSeverity;
}

/** A single entry within a conflict group — one source's version of the claim. */
export interface ConflictEntry {
  /** The source URL that produced this claim. */
  sourceUrl: string;
  /** The claim text from this source. */
  claim: string;
  /** Confidence of this claim (0–1). */
  confidence: number;
  /** Whether this entry represents a conflicting claim (as opposed to the base claim). */
  isConflictSide: boolean;
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

/**
 * Detect conflicts between multiple `ConceptExtractionResult` objects
 * that cover the same concept from different sources.
 *
 * Compares claims across sources using a simple heuristic: claims that
 * reference the same entity/topic but disagree on key facts (dates,
 * names, outcomes) are flagged as conflicts.
 *
 * Assigns severity:
 *  - `error` for direct contradictions (e.g., different dates for the
 *    same event, opposing factual claims about the same entity)
 *  - `warning` for minor discrepancies (e.g., slightly different
 *    wording, partial overlaps with non-critical differences)
 *
 * Logs the conflict count, severity, and affected claims at `info`
 * level for observability.
 *
 * @param results - Array of `ConceptExtractionResult` from different
 *   sources on the same concept. At least 2 results are required.
 * @returns A {@link ConflictResult} with the conflict list, overall
 *   severity, and affected claims.
 */
export function detectConflicts(
  results: ConceptExtractionResult[],
): ConflictResult {
  if (results.length < 2) {
    return {
      concept: results[0]?.concept ?? "unknown",
      conflicts: [],
      severity: "none",
      conflictCount: 0,
      sourceUrls: results.map((r) => r.sourceUrl),
      affectedClaims: [],
    };
  }

  const concept = results[0].concept;
  const sourceUrls = results.map((r) => r.sourceUrl);

  // Build a map of topic keys to claims from each source
  const claimTopics = new Map<
    string,
    Array<{ sourceUrl: string; claim: ExtractedClaim }>
  >();

  for (const result of results) {
    for (const claim of result.claims) {
      const topics = extractTopicKeywords(claim.text);
      for (const topic of topics) {
        const key = topic.toLowerCase().trim();
        if (!claimTopics.has(key)) {
          claimTopics.set(key, []);
        }
        claimTopics.get(key)!.push({ sourceUrl: result.sourceUrl, claim });
      }
    }
  }

  const conflicts: Conflict[] = [];
  const affectedClaims = new Set<string>();

  for (const [_topic, entries] of claimTopics) {
    const uniqueSources = new Set(entries.map((e) => e.sourceUrl));
    if (uniqueSources.size < 2) continue;

    // Keep only the highest-confidence claim per source
    const bestPerSource = new Map<string, ExtractedClaim>();
    for (const entry of entries) {
      const existing = bestPerSource.get(entry.sourceUrl);
      if (!existing || entry.claim.confidence > existing.confidence) {
        bestPerSource.set(entry.sourceUrl, entry.claim);
      }
    }

    // Compare each pair of sources for the same topic
    const sourceKeys = [...bestPerSource.keys()];
    for (let i = 0; i < sourceKeys.length; i++) {
      for (let j = i + 1; j < sourceKeys.length; j++) {
        const sourceA = sourceKeys[i];
        const sourceB = sourceKeys[j];
        const claimA = bestPerSource.get(sourceA)!;
        const claimB = bestPerSource.get(sourceB)!;

        const conflict = compareClaims(sourceA, claimA, sourceB, claimB);
        if (conflict) {
          conflicts.push(conflict);
          affectedClaims.add(claimA.text);
          affectedClaims.add(claimB.text);
        }
      }
    }
  }

  const groupedByClaim = groupConflictsByClaim(conflicts);
  const conflictCount = conflicts.length;
  const severity = computeOverallSeverity(conflicts);

  logger.info("detect-conflicts", "Conflict detection complete:", {
    concept,
    conflictCount,
    severity,
    affectedClaims: [...affectedClaims],
    sourceUrls,
  });

  return {
    concept,
    conflicts: groupedByClaim,
    severity,
    conflictCount,
    sourceUrls,
    affectedClaims: [...affectedClaims],
  };
}

// ---------------------------------------------------------------------------
// Claim comparison
// ---------------------------------------------------------------------------

/**
 * Compare two claims from different sources for the same topic.
 *
 * Returns a `Conflict` if the claims appear to contradict each other,
 * or `null` if the claims are consistent or too similar to be meaningful.
 */
function compareClaims(
  sourceUrlA: string,
  claimA: ExtractedClaim,
  sourceUrlB: string,
  claimB: ExtractedClaim,
): Conflict | null {
  const textA = claimA.text.trim();
  const textB = claimB.text.trim();

  if (normalizeText(textA) === normalizeText(textB)) return null;

  const topicKeywords = extractTopicKeywords(textA);
  const severity = determineSeverity(textA, textB, topicKeywords);
  if (!severity) return null;

  const minConfidence = Math.min(claimA.confidence, claimB.confidence);

  return {
    claimText: textA,
    conflictingClaims: {
      [sourceUrlA]: textA,
      [sourceUrlB]: textB,
    },
    severity,
    confidence: minConfidence,
    topic: topicKeywords[0] ?? "unknown",
  };
}

/**
 * Determine the severity of a conflict between two claims.
 *
 * Returns `error` for direct contradictions (opposing dates, names,
 * outcomes on the same entity), `warning` for partial disagreements
 * or minor discrepancies. Returns `null` if no meaningful conflict
 * is detected.
 */
function determineSeverity(
  textA: string,
  textB: string,
  topicKeywords: string[],
): ConflictSeverity | null {
  const datesA = extractDatePatterns(textA);
  const datesB = extractDatePatterns(textB);
  if (datesA.length > 0 && datesB.length > 0) {
    const conflicting = datesA.some(
      (da) => !datesB.some((db) => datesMatch(da, db)),
    );
    if (conflicting) return "error";
  }

  const entitiesA = extractNamedEntities(textA);
  const entitiesB = extractNamedEntities(textB);
  for (const ea of entitiesA) {
    for (const eb of entitiesB) {
      if (ea.toLowerCase() !== eb.toLowerCase() && areEntitiesRelated(ea, eb, topicKeywords)) {
        return "error";
      }
    }
  }

  if (findOpposingLanguage(textA, textB)) return "error";

  const overlap = computeTextOverlap(textA, textB);
  if (overlap > 0.3 && overlap < 0.9) {
    return "warning";
  }

  return null;
}

// ---------------------------------------------------------------------------
// Topic and entity extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract keyword topics from a claim text for grouping and comparison.
 *
 * Looks for known topic patterns: dates, proper nouns (person/place names),
 * technology terms, and domain-specific concepts that serve as topic anchors.
 */
function extractTopicKeywords(text: string): string[] {
  const keywords: string[] = [];

  const dateRe = /(\d{4}[-/]\d{2}[-/]\d{2}|\d{4})/g;
  let m: RegExpExecArray | null;
  while ((m = dateRe.exec(text)) !== null) {
    keywords.push(m[1]);
  }

  const properNounRe = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)\b/g;
  while ((m = properNounRe.exec(text)) !== null) {
    keywords.push(m[1]);
  }

  const singleCapRe = /(?<!\w)([A-Z][a-z]{2,})(?!\w)/g;
  while ((m = singleCapRe.exec(text)) !== null) {
    const word = m[1];
    if (
      ![
        "The",
        "And",
        "For",
        "But",
        "Not",
        "Are",
        "Was",
        "Were",
      ].includes(word)
    ) {
      keywords.push(word);
    }
  }

  return keywords;
}

/** Extract ISO-style date strings from text. */
function extractDatePatterns(text: string): string[] {
  const dates: string[] = [];
  const dateRe = /\b(\d{4}[-/]\d{2}[-/]\d{2}|\d{4})\b/g;
  let m: RegExpExecArray | null;
  while ((m = dateRe.exec(text)) !== null) {
    dates.push(m[1]);
  }
  return dates;
}

/** Check whether two date strings refer to the same date or year. */
function datesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const yearA = a.match(/\d{4}/)?.[0];
  const yearB = b.match(/\d{4}/)?.[0];
  return yearA !== undefined && yearA === yearB;
}

/** Extract capitalized named entities (person names, org names) from text. */
function extractNamedEntities(text: string): string[] {
  const entities: string[] = [];
  const nameRe = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = nameRe.exec(text)) !== null) {
    entities.push(m[1]);
  }
  return entities;
}

/**
 * Check whether two named entities are related to the same topic
 * by comparing against shared topic keywords.
 */
function areEntitiesRelated(
  entityA: string,
  entityB: string,
  topicKeywords: string[],
): boolean {
  const aLower = entityA.toLowerCase();
  const bLower = entityB.toLowerCase();
  if (aLower === bLower) return true;
  return topicKeywords.some(
    (kw) =>
      aLower.includes(kw.toLowerCase()) || bLower.includes(kw.toLowerCase()),
  );
}

/**
 * Detect opposing outcome language between two claims.
 *
 * Looks for pairs of words/phrases that indicate contradictory outcomes
 * (e.g., "succeeded" vs "failed", "accepted" vs "rejected", "yes" vs "no").
 */
function findOpposingLanguage(textA: string, textB: string): boolean {
  const opposingPairs: [string, string][] = [
    ["succeed", "fail"],
    ["accepted", "rejected"],
    ["approved", "denied"],
    ["increased", "decreased"],
    ["grew", "declined"],
    ["expanded", "contracted"],
    ["yes", "no"],
    ["true", "false"],
    ["win", "lose"],
    ["wins", "loses"],
    ["won", "lost"],
    ["gain", "loss"],
    ["positive", "negative"],
    ["confirmed", "denied"],
    ["verified", "disputed"],
    ["established", "refuted"],
    ["proven", "disproven"],
  ];

  const lowerA = textA.toLowerCase();
  const lowerB = textB.toLowerCase();

  for (const [wordA, wordB] of opposingPairs) {
    if (lowerA.includes(wordA) && lowerB.includes(wordB)) return true;
    if (lowerA.includes(wordB) && lowerB.includes(wordA)) return true;
  }

  return false;
}

/**
 * Compute a simple overlap ratio between two claim texts.
 *
 * Uses token-based Jaccard similarity on lowercased words.
 */
function computeTextOverlap(textA: string, textB: string): number {
  const wordsA = new Set(normalizeText(textA).split(/\s+/));
  const wordsB = new Set(normalizeText(textB).split(/\s+/));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Grouping and severity helpers
// ---------------------------------------------------------------------------

/**
 * Group a flat list of conflicts by their base claim text.
 *
 * Each group collects all conflicting versions of the same claim
 * from different sources for easier consumption.
 */
function groupConflictsByClaim(conflicts: Conflict[]): ConflictGroup[] {
  const groups = new Map<string, ConflictGroup>();

  for (const conflict of conflicts) {
    const key = normalizeText(conflict.claimText);
    const existing = groups.get(key);

    const entries: ConflictEntry[] = Object.entries(
      conflict.conflictingClaims,
    ).map(([sourceUrl, claim]) => ({
      sourceUrl,
      claim,
      confidence: conflict.confidence,
      isConflictSide: sourceUrl !== Object.keys(conflict.conflictingClaims)[0],
    }));

    if (existing) {
      existing.entries.push(...entries);
      existing.severity =
        existing.severity === "error" || conflict.severity === "error"
          ? "error"
          : "warning";
    } else {
      groups.set(key, {
        claimText: conflict.claimText,
        entries,
        severity: conflict.severity,
      });
    }
  }

  return [...groups.values()];
}

/**
 * Compute the overall severity across all conflicts.
 *
 * Returns `error` if any conflict is `error`, `warning` if any is
 * `warning`, or `none` if there are no conflicts.
 */
function computeOverallSeverity(
  conflicts: Conflict[],
): ConflictSeverity | "none" {
  if (conflicts.length === 0) return "none";
  if (conflicts.some((c) => c.severity === "error")) return "error";
  return "warning";
}

// ---------------------------------------------------------------------------
// Text normalization
// ---------------------------------------------------------------------------

/** Normalize text for comparison by lowercasing and stripping whitespace/punctuation. */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}