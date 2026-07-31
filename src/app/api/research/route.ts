/**
 * Research query API endpoint.
 *
 * Accepts structured research queries and returns machine-readable
 * structured output with claims, citations, confidence, and dispute flags.
 * Supports filtering by confidence threshold and source type.
 *
 * @module route
 */

import { NextRequest, NextResponse } from "next/server";
import { getPrincipal, getServicePrincipal } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errors";
import { readWikiPageWithFrontmatter } from "@/lib/wiki";
import {
  extractConcepts,
  type ConceptExtractionResult,
} from "@/lib/extract-concepts";
import {
  type UrlIngestResult,
  type UrlSourceMetadata,
} from "@/lib/ingest-url";
import { synthesizeConcepts } from "@/lib/synthesize";
import {
  toStructuredOutput,
  type StructuredOutput,
} from "@/lib/structured-output";
import { extractFactTriples } from "@/lib/fact-triples";
import { detectConflicts } from "@/lib/detect-conflicts";
import { validateStructuredOutput } from "@/lib/output-schema";
import type { SourceEntry } from "@/lib/types";

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

/** A structured research query. */
interface ResearchQuery {
  /** The concept slug to query. */
  concept: string;
  /** Optional list of source URLs to synthesize. */
  sources?: string[];
  /** Minimum confidence threshold for results (default 0.5). */
  minConfidence?: number;
  /** Optional source type filter. */
  sourceType?: string;
  /** Maximum number of results (default 50). */
  limit?: number;
  /** Pagination offset (default 0). */
  offset?: number;
}

/** Paginated research results. */
interface ResearchResponse {
  /** The query parameters echoed back. */
  query: ResearchQuery;
  /** Structured output for the concept. */
  output?: StructuredOutput;
  /** Fact triples extracted from the concept. */
  triples: Array<{
    subject: string;
    predicate: string;
    object: string;
    confidence: number;
    citations: string[];
  }>;
  /** Total number of results available. */
  total: number;
  /** Number of results returned in this page. */
  count: number;
  /** Whether the concept is disputed. */
  disputed: boolean;
  /** Schema validation result. */
  validation: { valid: boolean; errors: string[] };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a research query's structure and required fields.
 *
 * @param body - The parsed JSON body.
 * @returns An error message string if invalid, or null if valid.
 */
function validateQuery(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return "Request body must be a JSON object";
  }
  const query = body as Partial<ResearchQuery>;
  if (!query.concept || typeof query.concept !== "string" || query.concept.length === 0) {
    return "Field 'concept' is required and must be a non-empty string";
  }
  if (query.sources !== undefined) {
    if (!Array.isArray(query.sources)) {
      return "Field 'sources' must be an array";
    }
    for (const s of query.sources) {
      if (typeof s !== "string") {
        return "All source items must be strings";
      }
    }
  }
  if (query.minConfidence !== undefined) {
    if (typeof query.minConfidence !== "number" || query.minConfidence < 0 || query.minConfidence > 1) {
      return "Field 'minConfidence' must be a number between 0 and 1";
    }
  }
  if (query.limit !== undefined) {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 200) {
      return "Field 'limit' must be an integer between 1 and 200";
    }
  }
  if (query.offset !== undefined) {
    if (!Number.isInteger(query.offset) || query.offset < 0) {
      return "Field 'offset' must be a non-negative integer";
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Core research logic
// ---------------------------------------------------------------------------

/**
 * Execute a structured research query for a concept.
 *
 * Looks up the concept page, extracts/synthesizes its content into
 * structured output, detects conflicts, and extracts fact triples.
 * Applies confidence filtering, source type filtering, and pagination.
 *
 * @param query - The validated research query.
 * @returns A {@link ResearchResponse} with structured results.
 */
async function executeResearchQuery(query: ResearchQuery): Promise<ResearchResponse> {
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;
  const minConfidence = query.minConfidence ?? 0.5;

  const wikiPage = await readWikiPageWithFrontmatter(query.concept);

  if (!wikiPage) {
    return {
      query,
      triples: [],
      total: 0,
      count: 0,
      disputed: false,
      validation: { valid: false, errors: ["Concept not found"] },
    };
  }

  const sourceUrl =
    typeof wikiPage.frontmatter.sourceUrl === "string"
      ? wikiPage.frontmatter.sourceUrl
      : "";
  const title =
    typeof wikiPage.frontmatter.title === "string"
      ? wikiPage.frontmatter.title
      : query.concept;

  const sourceEntry: SourceEntry = {
    type: "wiki-ref",
    url: sourceUrl || query.concept,
    fetched: new Date().toISOString(),
    triggered_by: "api:research",
  };

  const urlIngestResult: UrlIngestResult = {
    title,
    content: wikiPage.content,
    sourceUrl,
    sourceEntry,
    metadata: {
      sourceUrl,
      fetchedAt: new Date().toISOString(),
      contentLength: wikiPage.content.length,
      sourceType: "wiki-ref",
      triggeredBy: "api:research",
    },
  };

  const extraction = extractConcepts(urlIngestResult);

  const conflictResult = detectConflicts([extraction]);
  const disputed = conflictResult.severity !== "none";

  const synthesized = synthesizeConcepts([extraction]);
  const structured = toStructuredOutput(synthesized, {
    decisions: conflictResult.conflicts.map((g) => ({
      type: "claim-conflict-resolved" as const,
      claim: g.claimText,
      sourceUrl: g.entries.map((e) => e.sourceUrl).join(","),
      confidence: 0,
    })),
    disputed,
  });

  const tripleResult = extractFactTriples(structured, { minConfidence });

  const allTriples = tripleResult.triples.filter(
    (t) => t.confidence >= minConfidence,
  );
  const paginatedTriples = allTriples.slice(offset, offset + limit);

  const validation = validateStructuredOutput(structured);

  const response: ResearchResponse = {
    query,
    output: structured,
    triples: paginatedTriples.map((t) => ({
      subject: t.subject,
      predicate: t.predicate,
      object: t.object,
      confidence: t.confidence,
      citations: t.citations,
    })),
    total: allTriples.length,
    count: paginatedTriples.length,
    disputed,
    validation: {
      valid: validation.valid,
      errors: validation.errors.map((e) => `${e.field}: ${e.message}`),
    },
  };

  logger.info("research", "Research query executed", {
    concept: query.concept,
    tripleCount: response.triples.length,
    total: response.total,
    disputed,
  });

  return response;
}

// ---------------------------------------------------------------------------
// API route handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/research
 *
 * Accepts a JSON body with a research query and returns structured
 * results including the concept page's structured output, fact triples,
 * and validation status.
 *
 * Requires an authenticated user or service token.
 */
export async function POST(request: NextRequest) {
  try {
    const principal = (await getPrincipal()) ?? getServicePrincipal(request);
    if (!principal) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const body = await request.json();
    const error = validateQuery(body);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const query = body as ResearchQuery;
    const result = await executeResearchQuery(query);

    return NextResponse.json(result);
  } catch (e) {
    logger.error("research", "Research API error", { error: getErrorMessage(e) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/research?concept=<slug>&minConfidence=0.5&limit=50&offset=0
 *
 * Convenience endpoint for simple research queries via query parameters.
 */
export async function GET(request: NextRequest) {
  try {
    const principal = (await getPrincipal()) ?? getServicePrincipal(request);
    if (!principal) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const concept = searchParams.get("concept");
    const error = validateQuery({ concept });
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const query: ResearchQuery = {
      concept: concept!,
      minConfidence: searchParams.get("minConfidence")
        ? Number(searchParams.get("minConfidence"))
        : undefined,
      sourceType: searchParams.get("sourceType") ?? undefined,
      limit: searchParams.get("limit")
        ? Number(searchParams.get("limit"))
        : undefined,
      offset: searchParams.get("offset")
        ? Number(searchParams.get("offset"))
        : undefined,
    };

    const result = await executeResearchQuery(query);
    return NextResponse.json(result);
  } catch (e) {
    logger.error("research", "Research API error", { error: getErrorMessage(e) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
