# Phase 3: Runtime Intelligence — Strategic Shift
**Date:** 2026-06-10  
**Decision:** Freeze ATLAS-1.0 and ATLAS-2.0 architecture; move to retrieval quality and learning loops  

---

## Architecture Freeze

### ATLAS-1.0 (Identity Layer) — **LOCKED** 🔒

```
source_ref → atlas_feature_map → feature_id → packet_key → nes_chrom_packets
```

**Status:** COMPLETE, DO NOT MODIFY
- 14,515 glyph_records
- 100% packet_key coverage
- 0 duplicates, 0 orphans
- Deterministic glyph_id (v3: `glyph:12hex`)
- Identity chain immutable

### ATLAS-2.0 (Topology Layer) — **FROZEN** ❄️

```
packet → glyph_record → community_id → Neo4j topology
```

**Status:**
- Phase 2A: ✅ COMPLETE (14,515 packets materialized)
- Phase 2B: ✅ COMPLETE (Neo4j + Rust communities)
- Phase 2C: ⏳ DEFERRED (SOM retrain — non-blocking)
- Phase 2D: 🔮 PLANNED (HMM calibration — non-blocking)

**Invariants:**
- packet_key = parent identity (immutable)
- glyph_id = deterministic (immutable)
- 1 row/packet (until intentional tile expansion in Phase 4)
- Enrichment-only schema changes (community_id, manifold4, authority_score)

---

## Phase 3A: HyperRAG Authority Runtime

**Goal:** Improve retrieval quality through authority-aware reranking and topology expansion.

### Current Retrieval Pipeline

```
Embedding
  ↓
Qdrant ANN (top-k)
  ↓
LLM response
```

### Target Pipeline (Phase 3A)

```
Embedding
  ↓
Qdrant ANN (fetch top-k + edges)
  ↓
community_id expansion (Neo4j: find related communities)
  ↓
Neo4j topology expansion (SIMILAR_TOPOLOGY: find neighbors)
  ↓
Authority rerank (0.35 vector + 0.25 graph + 0.20 community + 0.10 cache + 0.10 recency)
  ↓
Packet hydrate (load full nes_chrom_packets payload)
  ↓
ACE context assembly (apply KAG/DAG rules)
  ↓
Gemma4 generation
```

### Authority Score Formula

```
authority_score = 
  0.35 * vector_similarity +
  0.25 * graph_score +
  0.20 * community_rank +
  0.10 * cache_hit_frequency +
  0.10 * recency_boost
```

### Persistent Columns (Add to ATLAS-2.0)

**In `atlas_feature_map`:**
- `graph_authority_score REAL` — Neo4j PageRank normalized [0, 1]
- `community_rank REAL` — community-relative ranking [0, 1]
- `retrieval_score REAL` — composite authority (cached)

**In `nes_chrom_packets.payload` (JSONB):**
```json
{
  "authority": {
    "vector": 0.92,
    "graph": 0.78,
    "community": 0.85,
    "cache": 0.45,
    "recency": 0.95,
    "composite": 0.82
  }
}
```

### Implementation Roadmap

1. **Qdrant expansion:** Fetch community_id + som_cluster from payload on ANN hits
2. **Neo4j expansion:** Query `SIMILAR_TOPOLOGY` relationships (cost-ordered)
3. **Authority compute:** Batch score calculation via query context
4. **Cache layer:** Redis `authority:composite:{packet_key}` (6h TTL)
5. **Rerank:** Sort top-k by authority before ACE context assembly

**Timeline:** 1-2 weeks (high leverage for retrieval quality)

---

## Phase 3B: Active Learning Candidates

**Goal:** Harvest real retrieval patterns to drive LoRA fine-tuning.

### Table: `lora_training_candidates`

```sql
CREATE TABLE lora_training_candidates (
  id UUID PRIMARY KEY,
  packet_key TEXT NOT NULL,
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  reward_score REAL,
  repair_success BOOLEAN,
  retrieval_score REAL,
  community_id INTEGER,
  created_at TIMESTAMP NOT NULL,
  
  INDEX (packet_key),
  INDEX (community_id),
  INDEX (reward_score DESC),
  INDEX (created_at DESC)
);
```

### Data Sources (Real, Not Synthetic)

1. **Runtime packet replay:** Every Gemma4 call → query/response pair
2. **Self-heal packets:** Error recovery flows (high-value signal)
3. **Repair-loop:** Manual corrections by users
4. **Telemetry packets:** Successful vs. failed retrievals

### Reward Scoring

```
reward_score = 
  0.40 * relevance_signal +
  0.30 * user_feedback +
  0.20 * repair_success +
  0.10 * latency_bonus
```

- **relevance_signal:** Implicit (no follow-up query within 5min = relevant)
- **user_feedback:** Thumbs up/down (explicit 1/-1)
- **repair_success:** Did self-heal fix the issue?
- **latency_bonus:** Fast retrievals (<2s) score higher

### What NOT to Do

❌ Synthetic generations (no ground truth)
❌ Template-based examples (overfitting risk)
❌ LLM-generated labels (cascading errors)

✅ Real user queries + outcomes
✅ Runtime telemetry
✅ Explicit corrections

**Timeline:** 1-2 weeks (data collection + pipeline wiring)

---

## Phase 3C: Retrieval Benchmark Suite

**Goal:** Permanent measurement of retrieval quality across all phases.

### 100 Known Queries

**Example query set** (cover key retrieval patterns):

1. **Auth-related:** `username already taken`, `lucia session validation`, `password reset flow`
2. **Cache-related:** `redis noauth error`, `valkey memory pressure`, `cache TTL config`
3. **Schema-related:** `feature_id generation`, `packet_key collision`, `centroid assignment`
4. **Topology-related:** `som cluster distance`, `community membership`, `neo4j traversal cost`
5. **Integration:** `grpc service discovery`, `qdrant collection sync`, `event streaming patterns`

### Measurement Frame

**For each query, measure:**

| Metric | Definition | Target |
|--------|-----------|--------|
| **MRR** | Mean Reciprocal Rank (1/rank of 1st relevant result) | > 0.90 |
| **Recall@10** | % relevant docs in top 10 | > 0.85 |
| **Recall@20** | % relevant docs in top 20 | > 0.92 |
| **Context Density** | % tokens in context relevant to query | > 0.75 |
| **Latency P95** | 95th percentile retrieval time | < 2.0s |
| **Authority Hit** | % docs with authority_score > threshold | > 0.80 |

### Automation

**Nightly benchmark run:**
```bash
npm run benchmark:retrieval:100-queries
  → Qdrant ANN
  → Neo4j expansion
  → Authority rerank
  → ACE context
  → Gemma4 summary
  → Measure MRR / Recall / density
  → Store results to `benchmark_runs` table
```

**Dashboard:** `/admin/retrieval-benchmark` (30-day trend)

**Regression gate:** Abort deployment if any metric drops > 5%

**Timeline:** 1 week (benchmark design + automation wiring)

---

## Biggest Remaining Technical Risk

**Not SOM. Not HMM. It is:**

### Community Coverage Gap

```
Rust detectCommunitiesRust output:  ~5,000 nodes with community_id
CodebaseFile (nodes):               5,253 total
atlas_feature_map (packets):        14,487 total

Coverage: 5,000 / 14,487 = 34%  ❌ (too low)
Target:   > 95%                   (needed for Phase 3)
```

**Why this matters:**
- Phase 3A reranking relies on community-aware expansion
- 34% coverage means 66% of retrievals bypass topology boost
- Retrieval quality plateau until coverage > 95%

**New Hard Gate (Phase 3A Precondition):**
```
community_id coverage > 95%

Before shipping Phase 3A authority reranker,
ensure community assignments exist for 13,762+ packets.
```

**Why coverage is low (diagnosis):**

1. **Source_ref mapping gaps:** Some glyph_records lack source_ref (can't map to codebase_files)
2. **Rust detection incomplete:** Structural communities may not cover all import graph nodes
3. **Schema mismatch:** glyph_records.community_id NULL vs. codebase_files.community_id populated

**Fix path (non-blocking for Phase 3 start):**

1. Analyze glyph_records WHERE community_id IS NULL
2. Attempt fuzzy matching (source_ref → file_path) for stragglers
3. Run Rust community detection with k=30 (larger cluster count) for coverage
4. Manually assign fallback communities (directory-based clustering) for unreachable nodes
5. Verify > 95% coverage before Phase 3A production use

---

## Immediate Roadmap (Next 4 Weeks)

### Week 1: Phase 3A Authority Runtime
1. Add `graph_authority_score`, `community_rank`, `retrieval_score` columns
2. Implement Qdrant expansion (community_id from payload)
3. Implement Neo4j expansion (SIMILAR_TOPOLOGY edges)
4. Build authority score compute + caching layer
5. Wire into `fetchACPKnowledgeResults()` reranking stage

### Week 2: Benchmark Suite + Active Learning Setup
1. Define 100 known queries (auth, cache, schema, topology, integration)
2. Build benchmark runner (MRR, Recall@10/20, context density)
3. Create `lora_training_candidates` table
4. Wire runtime telemetry → table (query/response capture)
5. Implement reward scoring logic

### Week 3: Community Coverage Closure
1. Analyze community_id NULL rows in glyph_records
2. Attempt source_ref → codebase_files.file_path fuzzy matching
3. Run Rust detectCommunitiesRust with k=30
4. Implement fallback clustering (directory-based for unreachable)
5. Verify > 95% coverage gate

### Week 4: Phase 3A Production Wiring
1. A/B test authority reranker (authority vs. vector-only baseline)
2. Measure MRR / Recall / context density impact
3. Tune weights (0.35 / 0.25 / 0.20 / 0.10 / 0.10) based on benchmark results
4. Gather LoRA candidates for Week 5+ fine-tuning
5. Freeze retrieval quality baseline for Phase 4

---

## Strategic Rationale

**Why freeze now?**

1. **Identity layer complete:** 14,515 packets with deterministic identities — further schema changes risk cascading migrations
2. **Topology layer sufficient:** Neo4j + communities provide enough structure for authority reranking without SOM/HMM
3. **Diminishing returns on storage:** Adding more schema complexity (tiles, one-to-many expansion, etc.) before proving retrieval quality improvement is premature
4. **Learning loop bottleneck:** Real improvement now comes from better ranking, not more storage — active learning requires retrieval patterns first

**Why Phase 3 sequence?**

1. **3A (Authority) first:** Quick win (2 weeks) — rerank existing Qdrant hits using topology + community
2. **3B (Active Learning) parallel:** Harvest real retrieval patterns for LoRA fine-tuning
3. **3C (Benchmark) parallel:** Measure retrieval quality scientifically — drives future improvements
4. **3D (LoRA):** Only after 3B + 3C show what matters (e.g., if authority reranker improves Recall@20 by 15%, fine-tune Gemma4 on authority-boosted examples)
5. **Phase 4 (CHR97):** Only after 3A–3D prove retrieval quality — cartridge export is the final compression stage

---

## Success Criteria (Phase 3 Complete)

- ✅ Authority reranker deployed (MRR > 0.90, Recall@20 > 0.92)
- ✅ 100-query benchmark suite running (nightly automation + dashboard)
- ✅ community_id coverage > 95% (no retrieval blackspots)
- ✅ LoRA candidates table > 1,000 examples (real query/response pairs)
- ✅ Reward scoring pipeline live (implicit + explicit feedback)
- ✅ Phase 4 CHR97 cartridge design finalized (based on retrieval learnings)

---

## What NOT to Do Now

❌ Add tile-level one-to-many expansion (Phase 4 only, after retrieval quality proven)
❌ Implement SOM retraining (Phase 2C — low priority, deferred)
❌ Build HMM calibration (Phase 2D — depends on Gemma4 summaries)
❌ Design CHR97 binary format (Phase 4 — premature without authority score data)
❌ Prototype QUIC/gRPC optimization (Phase 4.5+ — network layer can wait)

---

## Why This Roadmap Works

**Current state:** ATLAS infrastructure is mature (packet materialization, Neo4j topology, communities)

**Bottleneck:** Retrieval quality and learning loops, not storage

**Next leverage point:** Authority-aware reranking + active learning harvest → Gemma4 fine-tuning

**After that:** Phase 4 CHR97 compression and binary cartridge export (now that retrieval patterns are understood)

---

## Reference

- **Phase 2A/2B Summary:** `next_steps/active/2026-06-10_ATLAS-2.0-PHASE-SUMMARY.md`
- **Phase 2B Runbook:** `next_steps/active/2026-06-10_atlas-phase-2b-neo4j-communities.md`
- **Memory Status:** `memory/atlas-phase-2b-neo4j-implementation.md`

---

**Decision:** Freeze ATLAS-1.0 and ATLAS-2.0. Begin Phase 3A (authority runtime) immediately.

**Next checkpoint:** 1 week (authority reranker alpha + benchmark suite design).
