/**
 * Reconciliation thread infrastructure for synthesized concepts.
 *
 * For each concept undergoing synthesis, ensures a discussion thread
 * exists for ongoing curation and human review. Idempotent — skips
 * creation if a synthesis thread already exists for the concept.
 *
 * @module reconcile-thread
 */

import { listThreads, createThread } from "./talk";
import { logger } from "./logger";
import type { ConceptExtractionResult } from "./extract-concepts";

/** Prefix used for synthesis review thread titles — also an idempotency key. */
export const SYNTHESIS_THREAD_PREFIX = "Synthesis review";

/**
 * Result metadata from ensuring a synthesis discussion thread.
 */
export interface ReconcileThreadResult {
  /** Index of the thread in the discuss file. */
  threadId: number;
  /** The concept slug the thread is for. */
  conceptSlug: string;
  /** ISO date of thread creation or reuse. */
  createdAt: string;
  /** Current thread status. */
  status: "open" | "resolved" | "wontfix";
}

/**
 * Ensure a synthesis review discussion thread exists for the given
 * concept. If a thread with the synthesis title already exists for
 * the slug, it is reused and its metadata is returned. Otherwise,
 * a new thread is created with a summary of the synthesis results.
 *
 * Logs thread creation or reuse at `info` level for observability.
 *
 * @param result - The synthesized {@link ConceptExtractionResult}
 *                 containing merged claims, sources, and confidence.
 * @param conceptSlug - The wiki page slug for the concept.
 * @returns {@link ReconcileThreadResult} with thread metadata.
 */
export async function ensureSynthesisThread(
  result: ConceptExtractionResult,
  conceptSlug: string,
): Promise<ReconcileThreadResult> {
  const title = synthesisThreadTitle(result.concept);
  const threads = await listThreads(conceptSlug);

  const existing = threads.find((t) => t.title === title);
  if (existing) {
    const idx = threads.indexOf(existing);
    logger.info("reconcile-thread", `Reusing existing synthesis thread for "${result.concept}"`, {
      conceptSlug,
      threadId: idx,
    });
    return {
      threadId: idx,
      conceptSlug,
      createdAt: existing.created,
      status: existing.status,
    };
  }

  const body = buildThreadBody(result);
  const thread = await createThread(conceptSlug, title, "arc", body);
  const newIdx = threads.length;

  logger.info("reconcile-thread", `Created synthesis thread for "${result.concept}"`, {
    conceptSlug,
    threadId: newIdx,
    confidence: result.confidence,
  });

  return {
    threadId: newIdx,
    conceptSlug,
    createdAt: thread.created,
    status: thread.status,
  };
}

/**
 * Generate the thread title for a concept's synthesis review thread.
 */
function synthesisThreadTitle(concept: string): string {
  return `${SYNTHESIS_THREAD_PREFIX}: ${concept}`;
}

/**
 * Build the body text for a synthesis review thread from the
 * extracted claims, sources, and confidence score.
 */
function buildThreadBody(result: ConceptExtractionResult): string {
  const maxClaims = 10;
  const claimsPreview = result.claims
    .slice(0, maxClaims)
    .map((c) => `- ${c.text}`)
    .join("\n");
  const moreNote =
    result.claims.length > maxClaims
      ? `\n\n... and ${result.claims.length - maxClaims} more claims`
      : "";

  return [
    `The synthesis for **${result.concept}** has been updated. Please review and curate.`,
    "",
    `**Confidence**: ${result.confidence}`,
    "",
    "**Key claims**:",
    claimsPreview + moreNote,
    "",
    `**Sources**: ${result.citations.join(", ") || "none"}`,
    "",
    "Use this thread to flag issues, suggest edits, or request further review.",
  ].join("\n");
}