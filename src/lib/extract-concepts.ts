/**
 * Concept extraction module for the ingestion pipeline.
 *
 * Accepts a {@link UrlIngestResult} from `ingest-url.ts`, parses the
 * raw page content to extract structured claims (with citations),
 * named entities, and overall confidence, and returns a
 * {@link ConceptExtractionResult}.
 *
 * Claims are identified as sentences that make factual assertions
 * (contain a claim marker such as a citation, a bold assertion, or
 * a statement with a source reference). Citations are extracted from
 * markdown link patterns `](slug.md)` and external URLs. Entities are
 * surfaced as proper nouns and known concept patterns. Confidence is
 * derived from the source type weight and corroboration signals,
 * following the same heuristic as {@link computeConfidence} in `ingest.ts`.
 */

import { computeConfidence } from "./ingest";
import { logger } from "./logger";
import type { SourceEntry } from "./types";
import type { UrlIngestResult } from "./ingest-url";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** A single extracted claim with its citations and confidence. */
export interface ExtractedClaim {
  /** The claim text (a factual assertion from the source content). */
  text: string;
  /** Wiki slugs or URLs cited as evidence for this claim. */
  citations: string[];
  /** Confidence for this claim, 0–1. */
  confidence: number;
}

/** A named entity extracted from the page content. */
export interface ExtractedEntity {
  /** The entity name (e.g. a person, place, concept, or organization). */
  name: string;
  /** The entity type inferred from context. */
  type: "concept" | "person" | "place" | "organization" | "date" | "technology";
}

/** Result of concept extraction from a {@link UrlIngestResult}. */
export interface ConceptExtractionResult {
  /** The canonical concept name, derived from the page title or CONCEPT marker. */
  concept: string;
  /** Structured claims extracted from the content, each with citations and confidence. */
  claims: ExtractedClaim[];
  /** Unique citation slugs/URLs found across all claims. */
  citations: string[];
  /** Named entities identified in the content. */
  entities: ExtractedEntity[];
  /** Overall confidence score (0–1) based on source quality and corroboration. */
  confidence: number;
  /** The source URL the concepts were extracted from. */
  sourceUrl: string;
}

// ---------------------------------------------------------------------------
// Claim extraction
// ---------------------------------------------------------------------------

/**
 * Split raw markdown content into claim-bearing sentences.
 *
 * A sentence is treated as a claim when it contains at least one of:
 *  - a wiki internal citation link `](slug.md)`,
 *  - an external URL link `](https://...)`,
 *  - a bold assertion (text wrapped in `**...**`),
 *  - a numbered footnote reference like `[1]`,
 *  - a source attribution phrase (e.g. "according to", "per", "sourced from").
 *
 * Sentences are split on `. `, `? `, `! `, and paragraph breaks,
 * with the same sentence-boundary logic as {@link chunkText} in `ingest.ts`.
 *
 * @param content - Raw markdown content from the ingested page.
 * @returns Array of claim strings (each stripped of surrounding whitespace).
 */
export function extractClaims(content: string): string[] {
  const sentences = splitContentIntoSentences(content);
  return sentences.filter(isClaimSentence);
}

/**
 * Split markdown content into individual sentences.
 *
 * Preserves markdown image/link references so their internal
 * punctuation doesn't trigger false sentence boundaries. Shields
 * them with a placeholder, splits, then restores.
 */
function splitContentIntoSentences(text: string): string[] {
  const placeholders: string[] = [];
  const shielded = text
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, (match) => {
      const idx = placeholders.length;
      placeholders.push(match);
      return `\x00MDREF${idx}\x00`;
    })
    .replace(/https?:\/\/[^\s)]+/g, (match) => {
      const idx = placeholders.length;
      placeholders.push(match);
      return `\x00URLREF${idx}\x00`;
    });

  const parts = shielded.split(/(?<=[.!?])\s+/);

  const restored = parts
    .map((s) =>
      s.replace(/\x00MDREF(\d+)\x00/g, (_, idx) => placeholders[Number(idx)]),
    )
    .map((s) =>
      s.replace(/\x00URLREF(\d+)\x00/g, (_, idx) => placeholders[Number(idx)]),
    )
    .filter((s) => s.trim().length > 0);

  return restored;
}

/**
 * Returns true when a sentence looks like it makes a factual claim
 * rather than a purely structural or transitional utterance.
 */
function isClaimSentence(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (trimmed.length < 10) return false;

  // Skip headings and structural markdown.
  if (/^(#|\*|-|\||\d+\.\s)/.test(trimmed)) return false;
  if (trimmed.startsWith("CONCEPT:") || trimmed.startsWith("ALIASES:")) return false;
  if (trimmed.startsWith("TAGS:")) return false;
  if (trimmed.startsWith("DISPUTED:")) return false;

  // Claim markers: internal wiki link, external URL, bold assertion,
  // footnote reference, or source attribution phrase.
  if (/\]\([^)]+\.md\)/.test(trimmed)) return true;
  if (/\](https?:\/\/[^)]+)/.test(trimmed)) return true;
  if (/\*\*[^*]+\*\*/.test(trimmed)) return true;
  if (/\[\d+\]/.test(trimmed)) return true;
  if (/\b(according to|per|sourced from|as reported by|cite(?:s|d)?|references?)\b/i.test(trimmed)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Citation extraction
// ---------------------------------------------------------------------------

/**
 * Extract citation slugs and URLs from markdown content.
 *
 * Finds:
 *  - Internal wiki links: `](slug.md)` → returns `slug`
 *  - External links: `](https://...)` → returns the full URL
 *
 * @param content - Raw markdown content.
 * @returns Unique citation strings (slugs without `.md` extension, or full URLs).
 */
export function extractCitations(content: string): string[] {
  const seen = new Set<string>();
  const citations: string[] = [];

  // Wiki internal links: ](slug.md)
  const internalRe = /]\(([^)]+?)\.md\)/g;
  let m: RegExpExecArray | null;
  while ((m = internalRe.exec(content)) !== null) {
    const slug = m[1];
    if (!seen.has(slug)) {
      seen.add(slug);
      citations.push(slug);
    }
  }

  // External links: ](https://...) ](http://...)
  const externalRe = /]\((https?:\/\/[^)]+)\)/g;
  while ((m = externalRe.exec(content)) !== null) {
    const url = m[1];
    if (!seen.has(url)) {
      seen.add(url);
      citations.push(url);
    }
  }

  return citations;
}

// ---------------------------------------------------------------------------
// Entity extraction
// ---------------------------------------------------------------------------

/**
 * Extract named entities from the page content.
 *
 * Uses heuristic patterns to identify:
 *  - **Concepts**: words that appear as CONCEPT markers (from `parseConceptMarker`)
 *    or capitalized multi-word phrases that look like domain terms.
 *  - **Persons**: patterns like "John Doe", "Smith", etc. — capitalized
 *    words adjacent to known person-title words or after "by"/"from".
 *  - **Places**: capitalized words after "in", "at", "from", "located in".
 *  - **Organizations**: entities containing "Inc", "LLC", "Institute",
 *    "Foundation", "Association", "Lab", "University".
 *  - **Dates**: ISO dates and common date patterns.
 *  - **Technology**: terms containing "ML", "AI", "model", "framework",
 *    "algorithm", "system", "protocol".
 *
 * @param content - Raw markdown content.
 * @returns Array of {@link ExtractedEntity} objects.
 */
export function extractEntities(content: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  const addEntity = (name: string, type: ExtractedEntity["type"]) => {
    const key = `${name.toLowerCase()}:${type}`;
    if (seen.has(key) || name.trim().length < 2) return;
    seen.add(key);
    entities.push({ name: name.trim(), type });
  };

  // CONCEPT marker
  const conceptM = content.match(/^CONCEPT:[ \t]*(.+?)\s*$/im);
  if (conceptM) addEntity(conceptM[1].trim(), "concept");

  // ALIASES marker
  const aliasesM = content.match(/^ALIASES:[ \t]*(.+?)\s*$/im);
  if (aliasesM) {
    const aliases = aliasesM[1]
      .split(/[;,]/)
      .map((a) => a.trim())
      .filter((a) => a && a.toLowerCase() !== "none");
    for (const alias of aliases) addEntity(alias, "concept");
  }

  // Organizations
  const orgPatterns = [
    /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*(?:\s+(?:Inc|LLC|Ltd|Corp|Co|Institute|Foundation|Association|Lab|University|Academy|Consortium|Partnership|Group|Holdings))\b)/g,
  ];
  for (const pattern of orgPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      addEntity(match[1], "organization");
    }
  }

  // Dates (ISO and common patterns)
  const dateRe = /\b(\d{4}[-/]\d{2}[-/]\d{2}|\d{4}\b|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},?\s*\d{4})/g;
  let dm: RegExpExecArray | null;
  while ((dm = dateRe.exec(content)) !== null) {
    addEntity(dm[1], "date");
  }

  // Technology terms
  const techTerms = [
    /\b(artificial intelligence|machine learning|deep learning|neural network|large language model|LLM|transformer|GPT|diffusion model|reinforcement learning|natural language processing|computer vision|RAG|agentic|AI agent)\b/gi,
  ];
  for (const pattern of techTerms) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      addEntity(match[1], "technology");
    }
  }

  return entities;
}

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------

/**
 * Compute extraction confidence based on the source entry's type.
 *
 * Delegates to {@link computeConfidence} in `ingest.ts` which
 * applies the authority baseline per source type, corroboration
 * bonus, and disputed cap. Since extraction operates on a single
 * source, corroboration is zero and disputed is false.
 *
 * @param sourceEntry - The provenance entry for the source.
 * @returns Confidence score between 0.3 and 0.95.
 */
export function computeExtractionConfidence(sourceEntry: SourceEntry): number {
  return computeConfidence([sourceEntry], false);
}

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

/**
 * Extract structured concept data from a {@link UrlIngestResult}.
 *
 * Parses the ingested page content to produce claims (each with
 * citations and per-claim confidence), a deduplicated citation list,
 * named entities, and an overall confidence score derived from the
 * source entry's provenance type.
 *
 * Logs the count of extracted concepts and the confidence score
 * at `info` level for observability.
 *
 * @param result - The {@link UrlIngestResult} from a URL ingest step.
 * @returns A {@link ConceptExtractionResult} with structured claims,
 *          citations, entities, and confidence.
 */
export function extractConcepts(result: UrlIngestResult): ConceptExtractionResult {
  const { content, title, sourceUrl, sourceEntry } = result;

  const claims = extractClaims(content);
  const citations = extractCitations(content);
  const entities = extractEntities(content);
  const confidence = computeExtractionConfidence(sourceEntry);

  // Build claims with citations and per-claim confidence.
  const enrichedClaims: ExtractedClaim[] = claims.map((claim) => {
    const claimCitations = extractCitations(claim);
    return {
      text: claim,
      citations: claimCitations,
      confidence,
    };
  });

  // Derive the concept name from a CONCEPT marker or fall back to the page title.
  const conceptM = content.match(/^CONCEPT:[ \t]*(.+?)\s*$/im);
  const concept = conceptM ? conceptM[1].trim() : title;

  logger.info("extract-concepts", "Extracted concepts:", {
    concept,
    claimCount: enrichedClaims.length,
    citationCount: citations.length,
    entityCount: entities.length,
    confidence,
    sourceUrl,
  });

  return {
    concept,
    claims: enrichedClaims,
    citations,
    entities,
    confidence,
    sourceUrl,
  };
}