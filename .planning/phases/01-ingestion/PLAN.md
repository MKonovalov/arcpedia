# Phase 1: Ingestion Pipeline

**Goal:** Enable the research agent to ingest URLs, extract structured content, and create concept pages with conflict detection.

**Requirements:** ING-01, ING-02, ING-03

## Slices

### S01: URL Ingest & Concept Extraction

**Goal:** Agent can ingest a single URL and produce a structured concept page.

**Success Criteria:**
1. URL fetch succeeds and extracts readable content
2. Concept page is created with proper frontmatter (title, source, confidence, citations)
3. Existing concept pages are merged, not overwritten

**Tasks:**

- [ ] **T01**: Implement URL fetch and content extraction pipeline
  - **description:** Build the URL fetch pipeline using existing `fetch.ts` primitives — extract title, body text, and metadata from any source URL
  - **estimate:** 2h
  - **expectedOutput:** `src/lib/ingest-url.ts` — URL fetch + content extraction module
  - **files:** `src/lib/fetch.ts`, `src/lib/ingest-url.ts`
  - **inputs:** `src/lib/fetch.ts` (existing), `src/lib/ingest.ts` (existing patterns)
  - **observabilityImpact:** Logs ingest source metadata for each fetch
  - **taskId:** T01
  - **title:** Implement URL fetch and content extraction pipeline
  - **verify:** `npx vitest run --reporter=verbose src/lib/ingest-url.test.ts` (or equivalent verification)

- [ ] **T02**: Implement concept extraction from page content
  - **description:** Extract structured concept data (claims, citations, entities) from raw page content
  - **estimate:** 3h
  - **expectedOutput:** `src/lib/extract-concepts.ts` — concept extraction module
  - **files:** `src/lib/extract-concepts.ts`
  - **inputs:** `src/lib/ingest-url.ts` (T01 output), `src/lib/reconcile.ts` (existing patterns)
  - **observabilityImpact:** Logs extracted concepts count and confidence
  - **taskId:** T02
  - **title:** Implement concept extraction from page content
  - **verify:** Unit tests for concept extraction with sample content

- [ ] **T03**: Implement page merge/reconciliation logic for existing concepts
  - **description:** When a concept page already exists, merge new sources into the existing page rather than overwriting; flag contradictions as `disputed`
  - **estimate:** 2h
  - **expectedOutput:** `src/lib/merge-concept.ts` — merge logic module
  - **files:** `src/lib/merge-concept.ts`, `src/lib/reconcile.ts` (existing)
  - **inputs:** `src/lib/extract-concepts.ts` (T02 output), `src/lib/wiki.ts` (existing write path)
  - **observabilityImpact:** Logs merge actions (new page, merged, disputed)
  - **taskId:** T03
  - **title:** Implement page merge/reconciliation logic
  - **verify:** Tests covering new page creation, merge, and dispute flagging

- [ ] **T04**: Wire ingestion pipeline into the agent API
  - **description:** Connect the extraction + merge pipeline to the agent API endpoint so it can be triggered programmatically
  - **estimate:** 2h
  - **expectedOutput:** `src/app/agent-api/ingest/route.ts` — API route for triggering ingestion
  - **files:** `src/app/agent-api/page.tsx`, `src/lib/ingest-url.ts`, `src/lib/merge-concept.ts`
  - **inputs:** Existing agent API infrastructure, ingest pipeline modules
  - **observabilityImpact:** API access logs, ingest job tracking
  - **taskId:** T04
  - **title:** Wire ingestion pipeline into agent API
  - **verify:** Integration test: POST to ingest endpoint creates/updates concept page

### S02: Batch Ingest with Deduplication

**Goal:** Agent can batch-ingest multiple sources with deduplication.

**Success Criteria:**
1. Batch ingest accepts a list of URLs
2. Deduplication prevents creating duplicate concept pages
3. Batch results summarize successes, failures, and skipped duplicates

**Tasks:**

- [ ] **T05**: Implement batch ingest endpoint and queue processor
  - **description:** Create a batch ingest endpoint that accepts multiple URLs and processes them through the queue
  - **estimate:** 2h
  - **expectedOutput:** `src/lib/ingest-batch.ts` — batch processing module
  - **files:** `src/lib/ingest-batch.ts`, `src/lib/ingest-jobs.ts` (existing)
  - **inputs:** `src/lib/ingest-url.ts` (T01 output), `src/lib/ingest-jobs.ts` (existing)
  - **observabilityImpact:** Batch job tracking, per-URL success/failure logging
  - **taskId:** T05
  - **title:** Implement batch ingest endpoint and queue processor
  - **verify:** Tests for batch processing with mixed success/failure results

- [ ] **T06**: Implement deduplication logic (source URL + content hash)
  - **description:** Detect duplicate sources and content to avoid re-processing already-ingested material
  - **estimate:** 2h
  - **expectedOutput:** `src/lib/dedup.ts` — deduplication module
  - **files:** `src/lib/dedup.ts`, `src/lib/sources.ts` (existing), `src/lib/source-index.ts` (existing)
  - **inputs:** `src/lib/ingest-batch.ts` (T05 output), existing source index
  - **observabilityImpact:** Logs skipped duplicates with reason (already-ingested, same-content)
  - **taskId:** T06
  - **title:** Implement deduplication logic
  - **verify:** Tests: duplicate URL → skipped, new URL → processed, same-content different URL → skipped

### S03: Conflict Detection & Dispute Flagging

**Goal:** Agent detects and flags contradictions between sources as `disputed`.

**Success Criteria:**
1. Contradictions between sources are detected during merge
2. Conflicting claims are flagged `disputed` with both sources cited
3. Disputed pages are surfaced for human review

**Tasks:**

- [ ] **T07**: Implement contradiction detection between sources
  - **description:** Compare claims from multiple sources on the same concept; identify conflicts where sources disagree
  - **estimate:** 3h
  - **expectedOutput:** `src/lib/detect-conflicts.ts` — conflict detection module
  - **files:** `src/lib/detect-conflicts.ts`, `src/lib/reconcile.ts` (existing)
  - **inputs:** `src/lib/extract-concepts.ts` output from multiple sources
  - **observabilityImpact:** Logs conflict count, severity, and affected claims
  - **taskId:** T07
  - **title:** Implement contradiction detection between sources
  - **verify:** Tests with known contradictory sources → dispute flag set

- [ ] **T08**: Surface disputed claims for human review
  - **description:** Ensure disputed claims are visible on the concept page and in the discussion thread for human resolution
  - **estimate:** 2h
  - **expectedOutput:** Updated page rendering to show `disputed` flags; discussion thread integration
  - **files:** `src/lib/discuss.ts` (existing), page rendering code
  - **inputs:** Disputed flag from merge/concept extraction pipeline
  - **observabilityImpact:** `disputed` tag visible in page UI and API responses
  - **taskId:** T08
  - **title:** Surface disputed claims for human review
  - **verify:** End-to-end test: contradictory sources → disputed flag in page output