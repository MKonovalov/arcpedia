/**
 * URL fetch and content extraction module for the ingestion pipeline.
 *
 * Accepts a URL string, fetches the content using existing fetch primitives
 * from `fetch.ts`, extracts title, body text, and metadata, and returns a
 * structured result compatible with the ingest pipeline types.
 */

import { fetchUrlContent } from "./fetch";
import { logger } from "./logger";
import type { SourceEntry } from "./types";
import { buildSourceEntry } from "./sources";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Metadata extracted from a URL source during ingestion. */
export interface UrlSourceMetadata {
  /** The original source URL. */
  sourceUrl: string;
  /** ISO date string of when the source was fetched. */
  fetchedAt: string;
  /** Length of the extracted body text in characters. */
  contentLength: number;
  /** Provenance type for this source. */
  sourceType: SourceEntry["type"];
  /** Who triggered the ingest, if provided. */
  triggeredBy?: string;
}

/**
 * Result of fetching and extracting content from a URL.
 *
 * Compatible with the ingest pipeline — `title` and `content` map directly
 * to the inputs accepted by the `ingest()` function.
 */
export interface UrlIngestResult {
  /** The extracted page title. */
  title: string;
  /** The extracted body text (markdown). */
  content: string;
  /** The original source URL. */
  sourceUrl: string;
  /** Metadata about the source provenance. */
  metadata: UrlSourceMetadata;
  /** A structured source entry for the provenance trail. */
  sourceEntry: SourceEntry;
}

// ---------------------------------------------------------------------------
// URL fetch + extraction
// ---------------------------------------------------------------------------

/**
 * Fetch a URL and extract its title, body text, and metadata.
 *
 * Uses `fetchUrlContent` (which handles HTML, plain-text, markdown, and
 * PDF content-types) to retrieve the source, then builds a structured
 * {@link UrlIngestResult} with provenance metadata.
 *
 * Logs the ingest source metadata at `info` level for observability.
 *
 * @param url - The source URL to fetch and extract.
 * @param triggeredBy - Optional identity of the actor that triggered the ingest
 *                      (e.g. a user handle or agent ID). Recorded in the
 *                      source provenance.
 * @returns A {@link UrlIngestResult} containing the extracted title, body
 *          text, source URL, and provenance metadata.
 * @throws {Error} When the URL fetch fails or no content can be extracted.
 */
export async function extractUrlContent(
  url: string,
  triggeredBy?: string,
): Promise<UrlIngestResult> {
  const { title, content } = await fetchUrlContent(url);

  const fetchedAt = new Date().toISOString().slice(0, 10);
  const sourceType: SourceEntry["type"] = "url";

  const metadata: UrlSourceMetadata = {
    sourceUrl: url,
    fetchedAt,
    contentLength: content.length,
    sourceType,
    triggeredBy,
  };

  const sourceEntry = buildSourceEntry(url, sourceType, triggeredBy ?? "system");

  logger.info("ingest-url", "Fetched URL source:", {
    url,
    title,
    contentLength: content.length,
    triggeredBy: triggeredBy ?? "system",
  });

  return {
    title,
    content,
    sourceUrl: url,
    metadata,
    sourceEntry,
  };
}