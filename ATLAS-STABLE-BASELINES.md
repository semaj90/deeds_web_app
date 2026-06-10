# ATLAS Stable Baselines — Architectural Constraints
**Date:** 2026-06-10  
**Status:** TWO STABLE BASELINES LOCKED  

---

## Baseline 1: ATLAS-1.0 (Identity + Packet Runtime)

```
source_ref → atlas_feature_map → feature_id → packet_key → nes_chrom_packets
```

**Status:** PRODUCTION-READY, IMMUTABLE

**Guarantees:**
- 14,515 glyph_records with deterministic identity
- 100% packet_key coverage (sha8-based, cryptographic)
- 0 duplicates, 0 orphans, 0 null keys
- source_ref → feature_id → packet_key chain is one-way, deterministic
- Backward compatible with all existing retrievals

**Hard Invariant (NEVER CHANGE):**
```
DO NOT TOUCH:
  - packet_key generation logic
  - glyph_id scheme (v3: glyph:12hex)
  - source_ref normalization
  
ONLY:
  - Add columns (enrichment around identity)
  - Update metadata JSONB fields
  - Index existing columns
```

---

## Baseline 2: ATLAS-2.0 Phase 2A/2B (Glyph + Topology)

```
packet → glyph_records (14,515 rows, 1:1 cardinality)
  ↓
community_id enrichment (Phase 2B)
  ↓
Neo4j topology (SIMILAR_TOPOLOGY edges, cost-ordered)
  ↓
authority metadata (Phase 3A)
```

**Status:** MATERIALIZATION + TOPOLOGY COMPLETE, SCHEMA LOCKED

**Phase 2A (Locked):**
- ✅ 14,515 packets materialized from atlas_feature_map
- ✅ Deterministic packet_key generation (shared lib)
- ✅ Redis hot cache (ace:packet:*, nes:packet:*)
- ✅ Identity chain audit: PASS

**Phase 2B (Locked):**
- ✅ Neo4j projection: 14,471 CodebaseFile nodes
- ✅ SIMILAR_TOPOLOGY: 28,942 edges (SOM grid-based costs)
- ✅ Community assignments: Rust detectCommunitiesRust
- ✅ glyph_records.community_id enrichment (pending community_id > 95% gate)

**Phase 2C (Deferred, Heavy GPU Task):**
- ⏳ SOM retrain (optional, when GPU available)
- ⏳ manifold4[0..1] recomputation (SOM coordinates)
- ⏳ Scheduled as `npm run atlas:som:retrain:full` (not dev churn)

**Phase 2D (Planned, Non-blocking):**
- 🔮 HMM calibration (depends on Gemma4 summaries)
- 🔮 Scheduled as separate run, not integrated with Phase 3

**Schema Freeze:**
- ✅ No packet-level structural changes (until Phase 4 tile expansion)
- ✅ 1 row per packet (glyph_records cardinality locked)
- ✅ Enrichment-only JSONB additions (community_id, authority, manifold4)
- ✅ Index new columns freely, but no table rewrites

---

## Phase 3: Runtime Quality (IMMEDIATE, 4 WEEKS)

**Goal:** Improve retrieval quality through authority reranking and active learning.

**NOT schema work. NOT storage optimization.**

### 3A: HyperRAG Authority Reranker (Week 1)

```
Embedding
  ↓
Qdrant ANN (fetch top-k + community_id)
  ↓
Neo4j expansion (SIMILAR_TOPOLOGY)
  ↓
Authority rerank (0.35·vector + 0.25·graph + 0.20·community + 0.10·cache + 0.10·recency)
  ↓
Packet hydrate
  ↓
ACE context → Gemma4
```

**Add to schema (enrichment-only):**
- `nes_chrom_packets.payload.authority` (JSONB)
- `atlas_feature_map.graph_authority_score` (REAL, optional)
- `atlas_feature_map.community_rank` (REAL, optional)

**No changes to:**
- packet_key, glyph_id, source_ref
- glyph_records row cardinality
- nes_chrom_packets PK/indexes

**Measure:** MRR > 0.90, Recall@20 > 0.92, context density > 0.75

### 3B: Active Learning Candidate Table (Week 2)

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
  created_at TIMESTAMP NOT NULL
);
```

**Data sources (REAL, not synthetic):**
- Runtime packet replay (every Gemma4 call)
- Self-heal packets (error recovery)
- User corrections (repair-loop)
- Telemetry (success/failure signals)

**Feed into:** LoRA fine-tuning (Phase 3D+)

### 3C: Retrieval Benchmark Suite (Week 2)

```bash
npm run benchmark:retrieval:100-queries
  → 100 known patterns (auth, cache, schema, topology, integration)
  → Measure: MRR, Recall@10, Recall@20, context density, latency
  → Nightly automation
  → Dashboard: /admin/retrieval-benchmark
  → Regression gate: abort deploy if metric drop > 5%
```

**Measurement frame:**
| Metric | Target |
|--------|--------|
| MRR | > 0.90 |
| Recall@10 | > 0.85 |
| Recall@20 | > 0.92 |
| Context Density | > 0.75 |
| Latency P95 | < 2.0s |

### 3D: Community Coverage Closure (Week 3)

**Current state:** community_id coverage ~34% (5,000 / 14,487 packets)

**Hard gate:** community_id coverage > 95% (before Phase 3A production)

**Actions:**
1. Analyze glyph_records WHERE community_id IS NULL
2. Fuzzy match source_ref → codebase_files.file_path
3. Rerun Rust detectCommunitiesRust (k=30 for coverage)
4. Fallback clustering (directory-based for unreachable)
5. Verify > 95%

**Why critical:** Phase 3A reranking depends on community expansion

### 3 Complete (Week 4)

- ✅ Authority reranker: MRR > 0.90, Recall@20 > 0.92
- ✅ Benchmark suite: nightly automation, dashboard
- ✅ community_id coverage > 95%
- ✅ LoRA candidates > 1,000 (real examples)
- ✅ Phase 4 CHR97 design finalized (based on retrieval insights)

---

## Phase 2C: Heavy GPU Maintenance (DEFERRED, SCHEDULED)

**NOT mixed into normal dev flow.**

**When:** After Phase 3A/3B/3C complete, during GPU availability window

**Execution path:**

```bash
# Heavy GPU maintenance run (scheduled, isolated)
npm run atlas:som:retrain:full      # Full SOM retraining (may take 4-6 hours)
npm run atlas:phase2c               # Update manifold4[0..1]
npm run atlas:audit-glyphs          # Verify distribution
npm run atlas:completion-gate       # Verify 2C hard gates
```

**What it does:**
1. Read all 14,515 codebase chunks from Qdrant
2. Retrain 20×20 SOM on embedding space (GPU k-means)
3. Update glyph_records.som_cluster, manifold4[0..1]
4. Audit: verify non-zero manifold4 distribution (< 10% zeros acceptable)
5. Gate check: SOM coverage > 80%

**Why defer:**
- Does NOT block Phase 3 quality improvements
- Requires GPU (heavy compute load)
- Can run offline (doesn't affect live retrievals)
- Outputs optional enrichment (manifold4[0..1])

**Why NOT mixed with Phase 3:**
- Phase 3 focus: retrieval quality (authority reranking)
- Phase 2C focus: topology optimization (SOM)
- Different teams / GPU budgets / timelines
- Can run Phase 3 → prod → then schedule Phase 2C

---

## The Golden Rule Going Forward

### NEVER TOUCH:
```
packet_key       ← Parent identity (cryptographic, immutable)
glyph_id         ← Deterministic scheme (v3: glyph:12hex)
source_ref       ← Canonical path (normalized, immutable)
```

### ONLY ENRICH:
```
glyph_records.community_id          ← Add (Phase 2B complete)
glyph_records.topology.manifold4    ← Add (Phase 2B + 2C)
glyph_records.authority_score       ← Add (Phase 3A)
nes_chrom_packets.payload.*         ← Enrich JSONB (any phase)
```

### SAFE CHANGES:
```
Add columns (new enrichment)
Add indexes (query optimization)
Update JSONB fields (metadata)
Add new tables (LoRA candidates, benchmark runs, etc.)
```

### FORBIDDEN:
```
Regenerate packet_key
Change glyph_id scheme
Normalize source_ref differently
Change glyph_records cardinality (until Phase 4 intentional tile expansion)
Reorder packet materialization
```

---

## Phase Sequencing

```
ATLAS-1.0          Phase 2A         Phase 2B         Phase 3           Phase 2C          Phase 3D+        Phase 4
(Identity)    (Materialization)  (Topology)    (Runtime Quality)  (SOM Retrain)     (LoRA)          (CHR97)
   ✅               ✅               ✅              🚀 START         ⏳ SCHEDULED       ⏳ AFTER 3    ⏳ AFTER 3
LOCKED            LOCKED          LOCKED         (4 weeks)        (GPU window)       (LoRA data)     (Retrieval proof)
```

**Rule:** Phase 2C does NOT block Phase 3. Run them in parallel:
- Phase 3 weeks 1-4: authority reranking, benchmarks, active learning
- Phase 2C whenever: heavy GPU retrain (doesn't affect live system)
- Phase 3D+: LoRA harvesting (uses Phase 3 retrieval patterns)
- Phase 4: CHR97 cartridge (uses Phase 3 authority scores + Phase 2C SOM)

---

## npm Scripts (Phase 3 Focus)

**Phase 3 (Daily dev):**
```bash
npm run benchmark:retrieval:100-queries    # Nightly validation
npm run authority:rerank:test              # Authority reranker alpha
npm run lora:candidates:harvest            # Active learning sampler
```

**Phase 2C (Heavy GPU, scheduled separately):**
```bash
npm run atlas:som:retrain:full             # Full SOM retraining
npm run atlas:phase2c                      # manifold4[0..1] recomputation
npm run atlas:audit-glyphs                 # Distribution audit
npm run atlas:completion-gate              # 2C gate verification
```

**Phase 2A/2B (Already complete, read-only):**
```bash
npm run atlas:materialize-packets:missing  # Already done
npm run atlas:phase2b                      # Already done
npm run atlas:audit-packets                # Validation only
```

---

## Success Criteria (End of Phase 3)

- ✅ Authority reranker: MRR > 0.90, Recall@20 > 0.92
- ✅ Benchmark suite: nightly automation, dashboard
- ✅ community_id coverage > 95%
- ✅ LoRA candidates: > 1,000 real query/response pairs
- ✅ Packet identity integrity: packet_key, glyph_id, source_ref unchanged
- ✅ Phase 4 CHR97 design: finalized based on retrieval insights

---

## References

- **Phase 3 Roadmap:** `next_steps/active/2026-06-10_PHASE-3-RUNTIME-INTELLIGENCE.md`
- **Phase 2 Summary:** `next_steps/active/2026-06-10_ATLAS-2.0-PHASE-SUMMARY.md`
- **Freeze Decision:** `ATLAS-FREEZE-DECISION.md`
- **Memory:** `memory/atlas-strategic-freeze-phase-3.md`

---

**KEY PRINCIPLE:** 

Do not touch packet_key, glyph_id, or source_ref identity.

Only enrich around them.

Phase 2C is heavy GPU work, scheduled separately.

Phase 3 is runtime quality, starts now.
