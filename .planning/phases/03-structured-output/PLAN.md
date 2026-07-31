# Phase 3: Structured Output & Query API

**Goal:** Expose agent-readable structured output and a research query API.

**Requirements:** STR-01, STR-02, STR-03

## Slices

### S01: Structured Output Engine

**Goal:** Agent produces structured output with claims and citations.

**Success Criteria:**
1. Structured output includes all claims with their citations
2. Output format is machine-readable (JSON with schema)
3. Output includes source metadata and confidence scores

**Tasks:**

- [ ] **T01**: Build structured output engine
  - **description:** Create a module that converts synthesized concept data into a machine-readable structured format (JSON) with claims, citations, confidence, and metadata
  - **estimate:** 2h
  - **expectedOutput:** `src/lib/structured-output.ts` — structured output engine
  - **files:** `src/lib/structured-output.ts`
  - **inputs:** `src/lib/synthesize.ts` (Phase 2), `src/lib/provenance.ts` (Phase 2), `src/lib/confidence-score.ts` (Phase 2)
  - **observabilityImpact:** Logs structured output generation per concept
  - **taskId:** T01
  - **title:** Build structured output engine
  - **verify:** `npx vitest run --reporter=verbose src/lib/structured-output.test.ts`

- [ ] **T02**: Implement JSON schema validation for structured output
  - **description:** Validate that structured output conforms to a defined schema for agent consumption
  - **estimate:** 2h
  - **expectedOutput:** `src/lib/output-schema.ts` — schema validation module
  - **files:** `src/lib/output-schema.ts`
  - **inputs:** `src/lib/structured-output.ts` (T01 output)
  - **observabilityImpact:** Logs schema validation errors
  - **taskId:** T02
  - **title:** Implement JSON schema validation
  - **verify:** Tests for valid and invalid structured output

### S02: Fact Triple Extraction

**Goal:** Agent generates fact triples suitable for embedding-based retrieval.

**Success Criteria:**
1. Fact triples (subject-predicate-object) are extracted from concept pages
2. Triples include confidence scores and source citations
3. Triples are formatted for embedding-based retrieval systems

**Tasks:**

- [ ] **T03**: Implement fact triple extraction from concept pages
  - **description:** Extract subject-predicate-object triples from synthesized concept data
  - **estimate:** 3h
  - **expectedOutput:** `src/lib/fact-triples.ts` — triple extraction module
  - **files:** `src/lib/fact-triples.ts`
  - **inputs:** `src/lib/structured-output.ts` (T01), `src/lib/extract-concepts.ts` (Phase 1)
  - **observabilityImpact:** Logs triple count and coverage per concept
  - **taskId:** T03
  - **title:** Implement fact triple extraction
  - **verify:** Tests cover simple, compound, and nested triples

- [ ] **T04**: Implement embedding-ready triple formatting
  - **description:** Format triples with vector-friendly encoding for embedding retrieval systems
  - **estimate:** 2h
  - **expectedOutput:** `src/lib/embedding-format.ts` — embedding formatting module
  - **files:** `src/lib/embedding-format.ts`
  - **inputs:** `src/lib/fact-triples.ts` (T03 output), `src/lib/embeddings.ts` (existing)
  - **observabilityImpact:** Logs embedding format conversions
  - **taskId:** T04
  - **title:** Implement embedding-ready triple formatting
  - **verify:** Tests confirm triples are correctly formatted for embedding systems

### S03: Research Query API

**Goal:** Expose a research query API for structured concept traversal.

**Success Criteria:**
1. API accepts structured queries (concept traversal, claim lookup)
2. API returns results in structured format with citations
3. API supports filtering by confidence threshold and source type

**Tasks:**

- [ ] **T05**: Build research query API endpoint
  - **description:** Create an API route that accepts structured research queries and returns structured results
  - **estimate:** 2h
  - **expectedOutput:** `src/app/api/research/route.ts` — research query API endpoint
  - **files:** `src/app/api/research/route.ts` (new)
  - **inputs:** `src/lib/structured-output.ts` (T01), `src/lib/fact-triples.ts` (T03)
  - **observabilityImpact:** API access logs, query performance metrics
  - **taskId:** T05
  - **title:** Build research query API endpoint
  - **verify:** Integration test: POST to research endpoint returns structured results

- [ ] **T06**: Implement query filtering and pagination
  - **description:** Add confidence threshold filtering, source type filtering, and pagination to the research query API
  - **estimate:** 2h
  - **expectedOutput:** Updated `src/app/api/research/route.ts` with filtering and pagination
  - **files:** `src/app/api/research/route.ts` (update)
  - **inputs:** `src/app/api/research/route.ts` (T05 output)
  - **observabilityImpact:** Query performance metrics, filter usage logging
  - **taskId:** T06
  - **title:** Implement query filtering and pagination
  - **verify:** Tests for confidence filtering, source filtering, pagination