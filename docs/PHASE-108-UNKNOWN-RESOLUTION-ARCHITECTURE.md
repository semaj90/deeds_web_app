# Phase 108: Unknown Resolution Architecture

**Status**: Design complete, ready for implementation.

**Objective**: Multi-layer ingestion pipeline for unresolved/uncertain packet observations with explicit candidate promotion workflow.

---

## Architecture Overview

### Five-Layer Ingestion

```
Layer 1: Observe
  ├─ Input: unresolved packet, evidence assertion, constraint list
  ├─ Store: atlas_unknown_observations (id, packet_key, observation_type, assertion, confidence, created_at)
  └─ Route: → Layer 2

Layer 2: Identify Candidates
  ├─ Source: Postgres (similarity join), Qdrant (vector search), Neo4j (topology expand)
  ├─ Query: "Find candidates that match this observation"
  ├─ Store: atlas_unknown_candidates (obs_id, candidate_key, source, score)
  └─ Route: → Layer 3

Layer 3: Gather Evidence
  ├─ Collect: all supporting facts, counter-facts, related evidence
  ├─ LDR: Local Deep Research on candidates
  ├─ Store: atlas_unknown_evidence (obs_id, candidate_key, evidence_type, data_ref, confidence)
  └─ Route: → Layer 4

Layer 4: Evaluate Evidence
  ├─ XGBoost reranker: score candidates given evidence
  ├─ LLM judgment: Gemma4 reasoning on best match
  ├─ Store: atlas_unknown_evaluations (obs_id, candidate_key, overall_score, reasoning, gate_pass)
  └─ Route: → Layer 5

Layer 5: Promote or Defer
  ├─ Decision: promote candidate to atlas_packets (hard link) OR defer (no consensus)
  ├─ If promote: create observation_trace record, emit ACE packet event
  ├─ If defer: mark as inconclusive, suggest additional data sources
  └─ Store: atlas_promotion_decisions (obs_id, promoted_candidate_key, decision_type, gate_status)
```

### Schema: Five New Tables

```sql
-- Layer 1: Observations
CREATE TABLE atlas_unknown_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key VARCHAR(255) NOT NULL,
  source_ref VARCHAR(512),                        -- null if unresolved
  observation_type VARCHAR(50) NOT NULL,           -- enum: missing-source, ambiguous-identity, partial-feature
  assertion TEXT NOT NULL,                         -- the unresolved claim
  confidence REAL DEFAULT 0.5,                     -- initial confidence [0, 1]
  constraint_list JSONB DEFAULT '[]'::jsonb,     -- {type, rule, priority}[]
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

-- Layer 2: Candidates
CREATE TABLE atlas_unknown_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obs_id UUID NOT NULL REFERENCES atlas_unknown_observations(id),
  candidate_key VARCHAR(255) NOT NULL,
  source VARCHAR(50) NOT NULL,                     -- postgres, qdrant, neo4j, ldr
  score REAL DEFAULT 0.0,
  rank INT NOT NULL,                               -- within candidates for this obs_id
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
  UNIQUE(obs_id, candidate_key)
);

-- Layer 3: Evidence
CREATE TABLE atlas_unknown_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obs_id UUID NOT NULL REFERENCES atlas_unknown_observations(id),
  candidate_key VARCHAR(255) NOT NULL,
  evidence_type VARCHAR(50) NOT NULL,              -- enum: lexical, semantic, topological, external
  data_ref TEXT NOT NULL,                          -- uri/key to source data (qdrant-id, postgres-id, url, etc)
  confidence REAL DEFAULT 0.5,
  strength VARCHAR(20) DEFAULT 'neutral',          -- supporting, neutral, contradicting
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

-- Layer 4: Evaluations
CREATE TABLE atlas_unknown_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obs_id UUID NOT NULL REFERENCES atlas_unknown_observations(id),
  candidate_key VARCHAR(255) NOT NULL,
  xgboost_score REAL DEFAULT 0.0,
  gemma4_reasoning TEXT,
  overall_score REAL DEFAULT 0.0,
  gate_pass BOOLEAN DEFAULT FALSE,                 -- true if score >= 0.85
  decision_stage VARCHAR(50) NOT NULL,             -- enum: ranked, reranked, judged
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
  UNIQUE(obs_id, candidate_key)
);

-- Layer 5: Promotion Decisions
CREATE TABLE atlas_promotion_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obs_id UUID NOT NULL REFERENCES atlas_unknown_observations(id),
  promoted_candidate_key VARCHAR(255),             -- null if deferred
  decision_type VARCHAR(50) NOT NULL,              -- enum: promoted, deferred, error
  gate_status VARCHAR(50) NOT NULL,                -- enum: pass, conditional, fail
  reasoning TEXT,
  promoted_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);
```

---

## Workflow Stages

### Stage 1: Load Observations
- Input: CSV/JSON list of unresolved packets (packet_key, assertion, observation_type)
- Operation: `INSERT INTO atlas_unknown_observations`
- Validation: packet_key unique per observation_type; assertion non-empty
- Output: observation IDs ready for candidate discovery

### Stage 2: Identify Candidates (Parallel)

**Lane A: Postgres Similarity Join**
```sql
SELECT ap.packet_key, similarity(ap.source_ref, observations.assertion) as score
FROM atlas_packets ap, atlas_unknown_observations obs
WHERE similarity(ap.source_ref, obs.assertion) > 0.6
ORDER BY similarity DESC LIMIT 20;
```

**Lane B: Qdrant Vector Search**
```
query = embed(observation.assertion, "embeddinggemma:latest")
candidates = qdrant.search(codebase_chunks_768, query, limit=20, threshold=0.7)
```

**Lane C: Neo4j Topology Expansion**
```cypher
MATCH (start:Packet {packet_key: $obs.packet_key})-[*1..3]-(candidate:Packet)
RETURN candidate.packet_key, count(*) as hop_count
ORDER BY hop_count DESC LIMIT 20;
```

- Aggregate: Deduplicate by candidate_key; compute rank = (score_A + score_B + score_C) / 3
- Store: `INSERT INTO atlas_unknown_candidates`

### Stage 3: Gather Evidence (Per Candidate)

For each top-10 candidate:
1. **Lexical Evidence**: `rg <candidate_source_ref>` for frequency, co-occurrence
2. **Semantic Evidence**: Find 5 nearest neighbors in Qdrant
3. **Topological Evidence**: Neo4j 2-hop neighbors, authority scores
4. **External Evidence**: LDR query for `<candidate_key> <assertion>`

- Store: `INSERT INTO atlas_unknown_evidence`

### Stage 4: Evaluate Evidence (XGBoost + Gemma4)

**Features for XGBoost** (from candidate + evidence):
- avg_evidence_confidence
- evidence_type_variety (count distinct types)
- strength_ratio (supporting / contradicting)
- topological_authority (from Neo4j PageRank)
- lexical_frequency

**Gemma4 Judgment**:
```
Prompt: "Given observation '{assertion}', candidate '{candidate_key}', and evidence {...},
         is this a good match? Respond with: MATCH / PARTIAL / NOMATCH and reasoning."
```

- Store: `INSERT INTO atlas_unknown_evaluations`
- Gate: score >= 0.85 → gate_pass = TRUE

### Stage 5: Promote or Defer

**If gate_pass = TRUE and overall_score >= 0.85**:
- Create hard link: `UPDATE atlas_packets SET source_ref = <promoted_candidate> WHERE packet_key = <obs_packet_key>`
- Record: `INSERT INTO atlas_promotion_decisions (decision_type='promoted')`
- Emit: ACE packet event for downstream indexing

**Else**:
- Record: `INSERT INTO atlas_promotion_decisions (decision_type='deferred')`
- Suggest: "Requires additional data sources: LLM reasoning, custom feature, manual review"

---

## Integration Points

### With Phase 107 (Feature Enrichment)
- Unknown observations reference `atlas_packets` rows that failed enrichment
- Resolved candidates flow back into feature extraction pipeline
- No circular dependency: enrichment is pre-condition for observation discovery

### With ACE (Routing)
- Promoted observations emit `observation_promoted` events
- ACE assembler includes promotion_decision_id in packet metadata
- LDR tool queries atlas_unknown_evidence for research suggestions

### With OKF Export
- Unknown observations exported as `<packet_key>:observation:uncertain` pseudo-packets
- Promotion decisions recorded in observation_trace table
- Enables reproducible audit of resolution process

---

## Success Criteria

| Metric | Target | Status |
|--------|--------|--------|
| Observation ingestion | <100ms per obs | ⏳ Pending |
| Candidate discovery | <2s per observation (parallel lanes) | ⏳ Pending |
| Evidence gathering | <5s per observation | ⏳ Pending |
| XGBoost+Gemma4 eval | <3s per observation | ⏳ Pending |
| Promotion rate | >50% of observations | ⏳ Pending |
| Gate pass rate | >85% of promoted | ⏳ Pending |

---

## Implementation Order

1. **Schema deployment** (5 new tables, indexes)
2. **Stage 1: Observation loader** (CSV → Postgres)
3. **Stage 2: Candidate discovery** (parallel lanes orchestrator)
4. **Stage 3: Evidence gathering** (LDR integration)
5. **Stage 4: XGBoost + Gemma4 evaluation** (batch inference)
6. **Stage 5: Promotion decision** (gate logic, ACE emission)

---

## Deferred Considerations

- **Manual review UI**: Dashboard for human adjudication (future phase)
- **Feedback loop**: Learn from promotion decisions to improve candidate scoring
- **Conflict resolution**: Handling contradicting observations for same packet_key
- **Versioning**: Tracking observation history as evidence accumulates

---

## Files to Create

- `scripts/atlas/phase-108-observation-loader.mts` — CSV ingest + validation
- `scripts/atlas/phase-108-candidate-discovery.mts` — 3-lane orchestrator
- `scripts/atlas/phase-108-evidence-gathering.mts` — Evidence aggregation + LDR
- `scripts/atlas/phase-108-evaluate-candidates.mts` — XGBoost + Gemma4
- `scripts/atlas/phase-108-promotion-decision.mts` — Gate logic + ACE emit
- `sveltekit-frontend/src/lib/server/phase-108/observation-schema.ts` — Zod validators
