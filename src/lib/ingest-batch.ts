/**
 * Batch ingest module for the ingestion pipeline.
 *
 * Accepts an array of URLs, deduplicates by source URL (skipping already-ingested
 * URLs), processes each through the job queue using {@link extractUrlContent}, and
 * returns batch results with per-URL success/failure summary.
 *
 * Batch job status is tracked via {@link createIngestJob} / {@link updateIngestJob}
 * for observability — the UI can poll the outcome of a batch ingest the same way
 * it polls a single URL ingest.
 */

import { extractUrlContent } from "./ingest-url";
import { createIngestJob, updateIngestJob } from "./ingest-jobs";
import { resolveSourceUrl } from "./source-index";
import { enqueueTask, type Task } from "./tasks";
import { getErrorMessage } from "./errors";
import { logger } from "./logger";
import { MAX_BATCH_URLS } from "./constants";
import type { IngestJobStatus } from "./ingest-jobs";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** The outcome of ingesting a single URL within a batch. */
export interface BatchUrlResult {
  /** The source URL that was processed. */
  url: string;
  /** Whether the URL was successfully ingested. */
  success: boolean;
  /** The slug of the created/updated page, set when {@link success} is true. */
  slug?: string;
  /** Failure reason, set when {@link success} is false. */
  error?: string;
  /** True when this URL was skipped because it was already ingested. */
  skipped?: boolean;
}

/** Summary of a completed batch ingest job. */
export interface BatchIngestResult {
  /** The batch job ID for observability and status polling. */
  jobId: string;
  /** Total number of URLs submitted to the batch. */
  totalUrls: number;
  /** Number of URLs successfully ingested. */
  succeeded: number;
  /** Number of URLs that failed to ingest. */
  failed: number;
  /** Number of URLs skipped because they were already ingested. */
  skipped: number;
  /** Per-URL result details. */
  results: BatchUrlResult[];
  /** When the batch job was created. */
  createdAt: string;
  /** Current status of the batch job. */
  status: IngestJobStatus;
}

// ---------------------------------------------------------------------------
// Batch ingest
// ---------------------------------------------------------------------------

/**
 * Process an array of URLs through the batch ingest pipeline.
 *
 * Each URL is deduplicated against the source index — URLs that have already
 * been ingested are skipped. Remaining URLs are enqueued as individual ingest
 * tasks via the task queue. The batch itself is tracked as an {@link IngestJob}
 * so callers can poll its status.
 *
 * Per-URL success/failure is recorded in the returned {@link BatchIngestResult}
 * and logged at info level for observability.
 *
 * @param urls - Array of source URLs to ingest. Duplicates within the array
 *               are deduplicated by URL string.
 * @param owner - Handle of the user who triggered the batch ingest.
 * @param triggeredBy - Optional identity of the actor that triggered the ingest
 *                      (e.g. a user handle or agent ID). Recorded in the source
 *                      provenance for each URL.
 * @param tags - Optional tags to attach to all pages created by this batch.
 * @param vaultId - Optional vault ID to auto-file resulting pages into.
 * @returns A {@link BatchIngestResult} with per-URL outcomes and batch-level
 *          status.
 * @throws {Error} When the URL count exceeds {@link MAX_BATCH_URLS}.
 */
export async function batchIngestUrls(
  urls: string[],
  owner: string,
  triggeredBy?: string,
  tags?: string[],
  vaultId?: string,
): Promise<BatchIngestResult> {
  if (urls.length > MAX_BATCH_URLS) {
    throw new Error(
      `Batch exceeds the maximum size of ${MAX_BATCH_URLS} URLs`,
    );
  }

  const deduped = dedupUrls(urls);
  const jobId = generateJobId();
  const createdAt = new Date().toISOString();

  await createIngestJob({
    jobId,
    owner,
    title: `Batch ingest: ${deduped.length} URL(s)`,
  });

  const results: BatchUrlResult[] = [];

  for (const url of deduped) {
    const existingSlug = await resolveSourceUrl(url);
    if (existingSlug) {
      const result: BatchUrlResult = {
        url,
        success: true,
        slug: existingSlug,
        skipped: true,
      };
      results.push(result);
      logger.info("ingest-batch", "Skipped already-ingested URL:", {
        url,
        existingSlug,
      });
      continue;
    }

    let slug: string | undefined;
    let error: string | undefined;
    let success = false;

    try {
      const ingestResult = await extractUrlContent(url, triggeredBy);
      slug = ingestResult.sourceEntry.url;

      const task: Task = {
        kind: "ingest",
        url,
        owner,
        jobId,
        title: ingestResult.title,
        tags,
        vaultId,
        sourceType: "url",
        triggeredBy,
      };

      await enqueueTask(task);
      success = true;
      logger.info("ingest-batch", "Batch ingest succeeded for URL:", {
        url,
        slug,
      });
    } catch (err) {
      error = getErrorMessage(err);
      logger.warn("ingest-batch", "Batch ingest failed for URL:", {
        url,
        error,
      });
    }

    results.push({
      url,
      success,
      slug,
      error,
    });
  }

  const succeeded = results.filter((r) => r.success && !r.skipped).length;
  const failed = results.filter((r) => !r.success).length;
  const skipped = results.filter((r) => r.skipped).length;

  const overallStatus = failed > 0 ? "failed" : "done";
  await updateIngestJob(jobId, {
    status: overallStatus,
    title: `Batch ingest: ${succeeded} succeeded, ${failed} failed`,
  });

  return {
    jobId,
    totalUrls: urls.length,
    succeeded,
    failed,
    skipped,
    results,
    createdAt,
    status: overallStatus,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deduplicate URLs by normalized string, preserving first-seen order. */
function dedupUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const key = url.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Generate a unique job ID for batch tracking. */
function generateJobId(): string {
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}