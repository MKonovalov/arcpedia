# v1.0 Research Agent — Requirements

## Active

### Ingestion
- [ ] **ING-01**: Agent can ingest a URL and extract structured content into a concept page
- [ ] **ING-02**: Agent can batch-ingest multiple sources with deduplication
- [ ] **ING-03**: Agent detects and flags contradictions between sources as `disputed`

### Synthesis
- [ ] **SYN-01**: Agent synthesizes multiple sources into a single canonical concept page
- [ ] **SYN-02**: Agent maintains a reconciliation thread per concept for ongoing curation
- [ ] **SYN-03**: Agent assigns confidence scores to claims based on source agreement

### Structured Output
- [ ] **STR-01**: Agent produces agent-readable structured output (claims with citations)
- [ ] **STR-02**: Agent generates fact triples suitable for embedding-based retrieval
- [ ] **STR-03**: Agent exposes a research query API for structured concept traversal

### Quality
- [ ] **QUAL-01**: Every claim has at least one citation with source URL
- [ ] **QUAL-02**: Expiry and confidence metadata are set on every synthesized claim
- [ ] **QUAL-03**: Disputed claims are visually flagged and surfaced for human review

## Future

- [ ] Embedding-based semantic search across concept pages
- [ ] Multi-agent research pipeline (parallel source analysis, merge synthesis)
- [ ] Automated fact triple extraction from structured output

## Out of Scope

- [ ] RAG-based query answering (arcpedia accumulates, not re-derives)
- [ ] Private vault cloning and paid access (separate milestone)
- [ ] Direct human prose editing of commons pages (humans use discussion threads)

## Traceability

(none yet — populated by roadmap)