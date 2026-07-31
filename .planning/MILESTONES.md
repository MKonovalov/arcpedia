# Milestones

## v1.0 Research Agent

**Status:** Phase 1 complete — Ingestion Pipeline
**Goal:** Build the research agent capability for autonomous knowledge ingestion, synthesis, and concept page reconciliation.

### Phase 1: Ingestion Pipeline — ✅ Complete

- ING-01: ✅ Agent can ingest a URL and extract structured content into a concept page
- ING-02: ✅ Agent can batch-ingest multiple sources with deduplication
- ING-03: ✅ Agent detects and flags contradictions between sources as `disputed`
- ING-03: ✅ Contradictions flagged as `disputed` with both sources cited

### Phase 2: Synthesis & Quality — ✅ Complete

- SYN-01: ✅ Agent synthesizes multiple sources into a single canonical concept page
- SYN-02: ✅ Agent maintains a reconciliation thread per concept for ongoing curation
- SYN-03: ✅ Agent assigns confidence scores to claims based on source agreement
- QUAL-01: ✅ Every claim has at least one citation with source URL
- QUAL-02: ✅ Expiry and confidence metadata are set on every synthesized claim
- QUAL-03: ✅ Disputed claims are visually flagged and surfaced for human review

### Phase 3: Structured Output & Query API — Pending