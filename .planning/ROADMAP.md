# Roadmap — Milestone v1.0 Research Agent

**Goal:** Build the research agent capability for autonomous knowledge ingestion, synthesis, and concept page reconciliation.

**Phases:** 3 | **Requirements:** 12 | All covered ✓

---

### Phase 1: Ingestion Pipeline

**Goal:** Enable the research agent to ingest URLs, extract structured content, and create concept pages.

**Requirements:** ING-01, ING-02, ING-03

**Success Criteria:**
1. Agent can ingest a single URL and produce a structured concept page
2. Agent can batch-ingest multiple sources with deduplication
3. Contradictions between sources are detected and flagged as `disputed`

### Phase 2: Synthesis & Quality

**Goal:** Enable the research agent to synthesize sources into canonical concept pages with confidence tracking.

**Requirements:** SYN-01, SYN-02, SYN-03, QUAL-01, QUAL-02, QUAL-03

**Success Criteria:**
1. Multiple sources are merged into a single canonical concept page
2. Reconciliation threads are created per concept for ongoing curation
3. Confidence scores assigned based on source agreement
4. Every claim has at least one citation
5. Expiry and confidence metadata set on all claims
6. Disputed claims are surfaced for human review

### Phase 3: Structured Output & Query API

**Goal:** Expose agent-readable structured output and a research query API.

**Requirements:** STR-01, STR-02, STR-03

**Success Criteria:**
1. Agent produces structured output with claims and citations
2. Fact triples are generated for embedding-based retrieval
3. A research query API enables structured concept traversal

---

## Phase Details

### Phase 1: Ingestion Pipeline

| # | Requirement | Success Criteria |
|---|-------------|------------------|
| 1 | ING-01 | URL ingest produces structured concept page |
| 2 | ING-02 | Batch ingest with dedup works |
| 3 | ING-03 | Contradictions flagged as `disputed` |

### Phase 2: Synthesis & Quality

| # | Requirement | Success Criteria |
|---|-------------|------------------|
| 4 | SYN-01 | Sources merged into canonical page |
| 5 | SYN-02 | Reconciliation threads per concept |
| 6 | SYN-03 | Confidence scores from source agreement |
| 7 | QUAL-01 | Every claim has a citation |
| 8 | QUAL-02 | Expiry and confidence metadata set |
| 9 | QUAL-03 | Disputed claims surfaced for review |

### Phase 3: Structured Output & Query API

| # | Requirement | Success Criteria |
|---|-------------|------------------|
| 10 | STR-01 | Structured output with claims + citations |
| 11 | STR-02 | Fact triples for embeddings |
| 12 | STR-03 | Research query API for concept traversal |