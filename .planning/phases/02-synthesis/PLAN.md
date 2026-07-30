# Phase 2: Synthesis & Quality

**Goal:** Enable the research agent to synthesize sources into canonical concept pages with confidence tracking and dispute flagging.

**Requirements:** SYN-01, SYN-02, SYN-03, QUAL-01, QUAL-02, QUAL-03

## Slices

### S01: Canonical Concept Synthesis

**Goal:** The agent can merge multiple source extractions into a single canonical concept page.

**Success Criteria:**
1. Multiple source extractions are merged into one canonical page per concept
2. Source provenance is preserved (each claim tracks its origin)
3. The synthesis respects priority of higher-confidence sources

**Tasks:**

- [ ] **T01**: Build the synthesis engine — merge multiple ConceptExtractionResults into a canonical page
  - **description:** Combine claims from multiple sources into a unified concept page, preserving provenance and resolving conflicts by confidence score
  - **estimate:** 3h
  - **expectedOutput:** `src/lib/synthesize.ts` — synthesis engine module
  - **files:** `src/lib/synthesize.ts`, `src/lib/extract-concepts.ts`, `src/lib/merge-concept.ts`
  - **inputs:** `src/lib/extract-concepts.ts` (Phase 1), `src/lib/merge-concept.ts` (Phase 1), `src/lib/reconcile.ts` (existing)
  - **observabilityImpact:** Logs synthesis decisions, conflict resolutions, and source priority
  - **taskId:** T01
  - **title:** Build synthesis engine for canonical concept pages
  - **verify:** `npx vitest run --reporter=verbose src/lib/synthesize.test.ts`

- [ ] **T02**: Implement source provenance tracking per claim
  - **description:** Each synthesized claim must track which source(s) it came from with citation links
  - **estimate:** 2h
  - **expectedOutput:** `src/lib/provenance.ts` — provenance tracking module
  - **files:** `src/lib/provenance.ts`
  - **inputs:** `src/lib/synthesize.ts` (T01 output), `src/lib/sources.ts` (existing)
  - **observabilityImpact:** Logs citation counts and source attribution per claim
  - **taskId:** T02
  - **title:** Implement source provenance tracking per claim
  - **verify:** Tests confirm every synthesized claim has at least one source citation

### S02: Reconciliation Threads & Confidence

**Goal:** The agent creates reconciliation threads per concept and assigns confidence scores.

**Success Criteria:**
1. A reconciliation thread is created for each concept undergoing synthesis
2. Confidence scores are computed from source agreement and quality
3. Low-confidence claims are flagged for review

**Tasks:**

- [ ] **T03**: Create reconciliation thread infrastructure per concept
  - **description:** For each concept synthesized, create a discussion thread for ongoing curation and human review
  - **estimate:** 2h
  - **expectedOutput:** `src/lib/reconcile-thread.ts` — thread creation module
  - **files:** `src/lib/reconcile-thread.ts`, `src/lib/discuss.ts` (existing)
  - **inputs:** `src/lib/synthesize.ts` (T01 output), `src/lib/talk.ts` (existing thread infrastructure)
  - **observabilityImpact:** Logs thread creation per concept
  - **taskId:** T03
  - **title:** Create reconciliation thread infrastructure
  - **verify:** Tests confirm thread creation per concept

- [ ] **T04**: Implement confidence scoring from source agreement
  - **description:** Compute confidence as weighted agreement across sources; flag low-confidence claims
  - **estimate:** 3h
  - **expectedOutput:** `src/lib/confidence-score.ts` — confidence scoring module
  - **files:** `src/lib/confidence-score.ts`, `src/lib/extract-concepts.ts`
  - **inputs:** `src/lib/synthesize.ts` output (T01), `src/lib/provenance.ts` (T02), `src/lib/ingest.ts` (existing `computeConfidence`)
  - **observabilityImpact:** Logs confidence distribution and low-confidence flags
  - **taskId:** T04
  - **title:** Implement confidence scoring from source agreement
  - **verify:** Tests cover agreement-based scoring, low-confidence flagging

### S03: Quality Assurance

**Goal:** Every claim has proper citations, metadata, and disputed claims are surfaced.

**Success Criteria:**
1. Every claim has at least one citation with source URL
2. Expiry and confidence metadata are set on all synthesized claims
3. Disputed claims are visually flagged and surfaced via the API

**Tasks:**

- [ ] **T05**: Enforce citation requirement — every claim must have at least one source URL
  - **description:** Validate that all synthesized claims have citations; reject or flag claims without sources
  - **estimate:** 2h
  - **expectedOutput:** `src/lib/validate-citations.ts` — citation validation module
  - **files:** `src/lib/validate-citations.ts`
  - **inputs:** `src/lib/synthesize.ts` output (T01), `src/lib/provenance.ts` (T02)
  - **observabilityImpact:** Logs citation gaps and validation errors
  - **taskId:** T05
  - **title:** Enforce citation requirement per claim
  - **verify:** Tests: claims without citations → rejected/flagged, claims with citations → pass

- [ ] **T06**: Add expiry and confidence metadata to synthesized claims
  - **description:** Set expiry dates and confidence metadata on every claim during synthesis
  - **estimate:** 2h
  - **expectedOutput:** Updated `src/lib/synthesize.ts` and `src/lib/confidence-score.ts` with metadata
  - **files:** `src/lib/synthesize.ts`, `src/lib/confidence-score.ts`
  - **inputs:** `src/lib/confidence-score.ts` (T04 output), `src/lib/extract-concepts.ts` (Phase 1)
  - **observabilityImpact:** Logs metadata assignment per claim
  - **taskId:** T06
  - **title:** Add expiry and confidence metadata to claims
  - **verify:** Tests confirm metadata present on all synthesized claims

- [ ] **T07**: Surface disputed claims through the API and page rendering
  - **description:** Ensure disputed claims from Phase 1's detection are visible in API responses and page rendering
  - **estimate:** 2h
  - **expectedOutput:** API response update + page rendering update
  - **files:** `src/lib/discuss.ts` (existing), page rendering code
  - **inputs:** `src/lib/detect-conflicts.ts` (Phase 1), `src/lib/confidence-score.ts` (T04)
  - **observabilityImpact:** `disputed` tag visible in API responses and UI
  - **taskId:** T07
  - **title:** Surface disputed claims via API and page rendering
  - **verify:** End-to-end test: disputed claim → visible in API response and page output