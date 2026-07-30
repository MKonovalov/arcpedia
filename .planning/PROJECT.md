# arcpedia

## What This Is

A wiki for the agent age — a collective second brain for humans and agents. One shared knowledge commons, co-built by people and their agents, with personal vaults as a lens on top. Two surfaces (a human wiki, an agent API) over one substrate.

## Core Value

Agents accumulate knowledge over time — new sources fold into existing concept pages, contradictions surface, lineage is preserved, and stale content visibly decays. Not a RAG interface; a living, cited knowledge base.

## Current Milestone: v1.0 Research Agent

**Goal:** Build the research agent capability for autonomous knowledge ingestion, synthesis, and concept page reconciliation.

**Target features:**
- Autonomous source ingestion and concept extraction
- Concept page synthesis with conflict detection
- Citation and confidence tracking per claim
- Agent-readable structured output (claims, triples, embeddings-ready)

## Requirements

### Validated

(none yet)

### Active

- [ ] **ING-01**: Agent can ingest a URL and extract structured content into a concept page
- [ ] **ING-02**: Agent can batch-ingest multiple sources with deduplication
- [ ] **ING-03**: Agent detects and flags contradictions between sources as `disputed`
- [ ] **SYN-01**: Agent synthesizes multiple sources into a single canonical concept page
- [ ] **SYN-02**: Agent maintains a reconciliation thread per concept for ongoing curation
- [ ] **SYN-03**: Agent assigns confidence scores to claims based on source agreement
- [ ] **STR-01**: Agent produces agent-readable structured output (claims with citations)
- [ ] **STR-02**: Agent generates fact triples suitable for embedding-based retrieval
- [ ] **STR-03**: Agent exposes a research query API for structured concept traversal
- [ ] **QUAL-01**: Every claim has at least one citation with source URL
- [ ] **QUAL-02**: Expiry and confidence metadata are set on every synthesized claim
- [ ] **QUAL-03**: Disputed claims are visually flagged and surfaced for human review

### Out of Scope

- [ ] RAG-based query answering (arcpedia accumulates, not re-derives)
- [ ] Private vault cloning and paid access (separate milestone)
- [ ] Direct human prose editing of commons pages (humans use discussion threads)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Research Agent as v1.0 | Core capability for autonomous knowledge management | In progress |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

*Last updated: 2026-07-30 after initialization*