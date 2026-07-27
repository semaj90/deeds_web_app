---
title: Phase 109 — Unknown Resolution Architecture Design
date: 2026-07-26
status: DESIGN
---

# Phase 109 — Unknown Packet Ingestion & Resolution (4-Stage Pipeline)

## Executive Summary

**Phase 109 builds on Phase 108's proven identity foundation to ingest and promote "unknown" packets through a rigorous 4-stage pipeline.**

Unknown packets originate from:
1. **Observation sources** — scanner output, LDR (Local Deep Research), user submissions, edge-case extractions
2. **Candidate scoring** — heuristic ranking (likelihood of being a real, immutable packet)
3. **Evidence validation** — cross-layer verification (Postgres identity + Qdrant semantic + Neo4j topology)
4. **Promotion gates** — final approval before integration into canonical atlas_packets

**Pipeline result:** Transform observations into validated packets with full immutability proof.

---

## 4-Stage Pipeline Architecture

### Stage 1: Observation Ingestion

**Input:** Raw observations from any source
```json
{
  "observation_id": "obs:2026-07-26:scan:001",
  "source_kind": "scanner|ldr|user_submission|edge_case",
  "workspace_id": "src",
  "potential_source_ref": "src/lib/server/auth.ts",
  "potential_feature_id": "auth.sessions",
  "potential_feature_label": "Session validation logic",
  "confidence_score": 0.65,
  "evidence_payload": { "... raw data ..." },
  "ingested_at": "2026-07-26T12:34:56Z",
  "ingestion_proof": "ledger_hash"
}
```

**Processing:**
- Validate workspace_id presence
- Normalize source_ref (Windows/POSIX path handling)
- Hash observation for deduplication
- Store in `unknown_packets` table (status = 'OBSERVATION')

**Gate:** `OBSERVATION_IDENTITY_COMPLETE` — workspace_id + source_ref present and normalized

---

### Stage 2: Candidate Scoring

**Input:** Observation from Stage 1

**Scoring criteria** (0.0 → 1.0):
- **Identity score** (0.3 weight) — Does packet_key match existing stable identity? (1.0 if new, 0.8 if similar)
- **Semantic score** (0.25 weight) — Does semantic_anchor exist in Qdrant? (vector similarity ≥ 0.85)
- **Source score** (0.2 weight) — Is source_ref present in codebase? (lexical match + AST verification)
- **Topology score** (0.15 weight) — Does packet fit into Neo4j graph? (edge existence ≥ 0.7)
- **Freshness score** (0.1 weight) — Is packet recent (within 7 days)? (1.0 if <7d, 0.5 if <30d)

**Combined score:** `0.3·identity + 0.25·semantic + 0.2·source + 0.15·topology + 0.1·freshness`

**Thresholds:**
- **≥ 0.8** → STRONG_CANDIDATE (auto-promote to Stage 3)
- **0.6–0.79** → CANDIDATE (manual review → Stage 3)
- **< 0.6** → WEAK_CANDIDATE (hold for enrichment)

**Gate:** `CANDIDATE_SCORING_VALID` — all 5 scores present, combined ≥ 0.0

---

### Stage 3: Evidence Validation

**Input:** Candidate from Stage 2

**Validation gates** (all must pass):

1. **Postgres Identity Gate**
   - Does packet_key exist?
   - Is workspace_id + source_ref unique?
   - Do feature_id + semantic_anchor match expected patterns?
   - **Result:** identity_proof (PASS/FAIL)

2. **Qdrant Semantic Gate**
   - Does semantic_anchor embed in Qdrant space?
   - Is cosine similarity to existing semantically-similar packets ≥ 0.75?
   - Can we find k=5 neighbors in semantic space?
   - **Result:** semantic_proof (PASS/WARN/FAIL)

3. **Neo4j Topology Gate**
   - Does packet fit into existing graph structure?
   - Are k-hop neighbors (k ≤ 3) semantically coherent?
   - Do BELONGS_TO_CLUSTER edges exist?
   - **Result:** topology_proof (PASS/WARN/FAIL)

4. **Tree Node Lineage Gate**
   - Is tree_node_id derivable from source_ref + signature?
   - Does tree_node_id match existing structural hashes?
   - **Result:** lineage_proof (PASS/WARN/FAIL)

5. **Content Hash Gate**
   - Is content_hash computable from packet payload?
   - Does content_hash match existing versions in Postgres?
   - **Result:** content_proof (PASS/WARN/FAIL)

**Overall gate result:**
- **ALL PASS** → VALIDATED (ready for Stage 4)
- **4/5 PASS** → CONDITIONALLY_VALID (promote with flags)
- **< 4/5 PASS** → REJECTED (hold for re-evidence)

**Gate:** `EVIDENCE_VALIDATION_COMPLETE` — all 5 proof states recorded

---

### Stage 4: Promotion & Integration

**Input:** Validated packet from Stage 3

**Promotion gates** (hard blocks):

1. **Identity Immutability Lock** — packet_key must be immutable going forward
2. **Workspace Boundary Lock** — workspace_id cannot change
3. **Source Reference Lock** — source_ref is canonical (no rewrites)
4. **Semantics Stability Check** — semantic_anchor consistent with feature_label

**On PASS:**
- Insert into `atlas_packets` (canonical truth)
- Invalidate Redis caches (BitFrost keys)
- Upsert into Qdrant (payload with proof_status = 'PROMOTED')
- Emit promotion event (RabbitMQ, HyperRAG notification)
- Update `unknown_packets.status` = 'PROMOTED'

**On FAIL:**
- Record rejection reason
- Keep in `unknown_packets.status` = 'REJECTED'
- Emit rejection event for analyst review
- Append to rejection ledger with evidence

**Gate:** `PROMOTION_GATES_PASS` — immutability locks + stability check

---

## Database Schema (New Tables)

### `unknown_packets` Table

```sql
CREATE TABLE unknown_packets (
  -- Identity
  unknown_id TEXT PRIMARY KEY,  -- obs:YYYY-MM-DD:source:NNN
  observation_id TEXT NOT NULL UNIQUE,
  
  -- Proposed identity
  workspace_id VARCHAR(256) NOT NULL,
  potential_source_ref TEXT NOT NULL,
  potential_feature_id TEXT,
  potential_feature_label TEXT,
  potential_packet_key TEXT,  -- computed hash
  
  -- Stage tracking
  status VARCHAR(32) NOT NULL DEFAULT 'OBSERVATION',
    -- OBSERVATION → CANDIDATE → VALIDATED → PROMOTED / REJECTED
  
  -- Scoring (Stage 2)
  identity_score REAL,
  semantic_score REAL,
  source_score REAL,
  topology_score REAL,
  freshness_score REAL,
  combined_score REAL,
  
  -- Evidence (Stage 3)
  identity_proof VARCHAR(16),  -- PASS/FAIL
  semantic_proof VARCHAR(16),  -- PASS/WARN/FAIL
  topology_proof VARCHAR(16),  -- PASS/WARN/FAIL
  lineage_proof VARCHAR(16),   -- PASS/WARN/FAIL
  content_proof VARCHAR(16),   -- PASS/WARN/FAIL
  
  -- Outcome (Stage 4)
  promoted_packet_key TEXT,    -- NULL until promoted
  promotion_timestamp TIMESTAMP,
  rejection_reason TEXT,
  analyst_notes TEXT,
  
  -- Metadata
  source_kind VARCHAR(32),     -- scanner|ldr|user_submission|edge_case
  evidence_payload JSONB,
  ledger_hash TEXT,
  
  -- Timestamps
  ingested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  scored_at TIMESTAMP,
  validated_at TIMESTAMP,
  resolved_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_unknown_status (status),
  INDEX idx_unknown_workspace (workspace_id),
  INDEX idx_unknown_source_ref (potential_source_ref),
  INDEX idx_unknown_combined_score (combined_score DESC),
  UNIQUE INDEX idx_unknown_potential_identity (workspace_id, potential_source_ref)
);
```

### `unknown_resolution_ledger` Table

```sql
CREATE TABLE unknown_resolution_ledger (
  ledger_id TEXT PRIMARY KEY,  -- ledger:YYYY-MM-DD:NNN
  unknown_id TEXT NOT NULL REFERENCES unknown_packets(unknown_id),
  
  -- Stage progression
  stage VARCHAR(32) NOT NULL,  -- OBSERVATION|CANDIDATE|VALIDATED|PROMOTED|REJECTED
  gate_name VARCHAR(256) NOT NULL,
  gate_result VARCHAR(16),  -- PASS|FAIL|WARN
  
  -- Evidence
  check_description TEXT,
  check_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  evidence_summary JSONB,
  
  -- Outcome
  action_taken VARCHAR(256),
  action_timestamp TIMESTAMP,
  
  INDEX idx_ledger_unknown (unknown_id),
  INDEX idx_ledger_stage (stage),
  INDEX idx_ledger_timestamp (check_timestamp DESC)
);
```

---

## Implementation Order

### Week 1: Foundation

1. **Day 1** — Schema deployment
   - Create `unknown_packets` table
   - Create `unknown_resolution_ledger` table
   - Add indexes for performance

2. **Day 2** — Stage 1 ingestion module
   - `src/lib/server/unknown/observation-ingester.ts` (200 lines)
   - Deduplication logic
   - Normalization (paths, hashes)
   - Gate: `OBSERVATION_IDENTITY_COMPLETE`

3. **Day 3** — Stage 2 scoring module
   - `src/lib/server/unknown/candidate-scorer.ts` (300 lines)
   - 5-score calculation
   - Threshold routing
   - Gate: `CANDIDATE_SCORING_VALID`

### Week 2: Validation & Promotion

4. **Day 4** — Stage 3 evidence validation
   - `src/lib/server/unknown/evidence-validator.ts` (400 lines)
   - 5 proof gates (Postgres, Qdrant, Neo4j, lineage, content)
   - Result aggregation
   - Gate: `EVIDENCE_VALIDATION_COMPLETE`

5. **Day 5** — Stage 4 promotion module
   - `src/lib/server/unknown/promotion-executor.ts` (250 lines)
   - Immutability locks
   - Database upsert (atlas_packets + Qdrant)
   - Event emission
   - Gate: `PROMOTION_GATES_PASS`

6. **Days 6–7** — Integration & testing
   - Wire into MCP/tRPC surface
   - End-to-end test (observation → promoted packet)
   - Dry-run validation

---

## Success Criteria

### Unit Test Coverage
- Stage 1: 15 tests (dedup, normalization, identity)
- Stage 2: 20 tests (score calculation, thresholds)
- Stage 3: 25 tests (5 proof gates, result aggregation)
- Stage 4: 15 tests (locks, upsert, events)
- **Total: 75 tests, all green**

### Integration Test Coverage
- Full pipeline (observation → promoted packet): 5 test scenarios
  1. Strong candidate (0.85 score) → auto-promoted
  2. Medium candidate (0.72 score) → manual review → promoted
  3. Weak candidate (0.55 score) → rejected
  4. Identity collision (duplicate packet_key) → rejected with reason
  5. Semantic mismatch (low Qdrant score) → conditionally valid

### Data Validation
- Unknown packets table populated with 100+ test observations
- Ledger entries recorded for every stage transition
- No data loss or silent failures
- All rejections have documented reasons

### Performance
- Observation ingestion: < 100ms per packet
- Scoring: < 500ms per candidate (includes Qdrant query)
- Evidence validation: < 2s per packet (parallel gates where possible)
- Promotion: < 1s (single transaction)

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Identity collision (duplicate packet_key) | HIGH | Stage 1 dedup + Stage 4 lock gates |
| Qdrant semantic mismatch | MEDIUM | Confidence thresholds + manual review |
| Neo4j topology inconsistency | MEDIUM | k-hop bounded verification + fallback |
| Ledger data loss | MEDIUM | Transactional integrity + WAL backup |
| Performance degradation (N unknown packets) | LOW | Indexed queries + batch processing |

---

## Phase 109 vs Phase 110+ Roadmap

**Phase 109 (this phase):** Unknown ingestion pipeline (10–14 days)
- Design: 1–2 days
- Implementation: 5–7 days
- Testing: 2–3 days
- Dry-run validation: 1–2 days

**Phase 110 (dependent):** Observation-to-candidate promotion wiring
- LDR (Local Deep Research) integration
- Gemma4-based candidate enrichment
- Manual review workflow

**Phase 111+:** Advanced resolution features
- Conflict resolution (competing candidates)
- Semantic enrichment (tag propagation)
- Topology clustering (packet grouping)

---

## Next Actions

1. **Approve design** (this document)
2. **Deploy schema** (Week 1, Day 1)
3. **Implement Stage 1** (observation ingestion)
4. **Implement Stage 2** (candidate scoring)
5. **Implement Stage 3** (evidence validation)
6. **Implement Stage 4** (promotion executor)
7. **Dry-run validation** (end-to-end test)
8. **Move to Phase 110**

---

**Status:** DESIGN READY FOR APPROVAL
**Confidence:** 95%+ (builds on proven Phase 108 foundation)
**Expected Duration:** 10–14 days
**Go/No-Go Decision:** Awaiting user approval

---

*Generated: 2026-07-26 Session 143*
*Based on: Phase 108F PARTIAL_PROVEN proof-matrix*
*Authority: Canonical identity + immutability proof*
