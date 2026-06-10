# ATLAS Architecture Freeze Decision
**Date:** 2026-06-10  
**Status:** FINAL DECISION  

---

## Summary

**FREEZE** ATLAS-1.0 and ATLAS-2.0 architecture.

**MOVE** to Phase 3 Runtime Intelligence (retrieval quality, authority reranking, active learning).

---

## Why Freeze Now

1. **Identity layer complete:** 14,515 packets with 100% deterministic packet_key coverage
2. **Topology layer sufficient:** Neo4j + communities provide structure for authority reranking
3. **Diminishing returns on storage:** Schema changes risk cascading complexity with low benefit
4. **Learning loop bottleneck:** Retrieval quality improvement now requires better ranking, not more storage

---

## ATLAS-1.0 (Identity Layer) — LOCKED

```
source_ref → atlas_feature_map → feature_id → packet_key → nes_chrom_packets
```

**Invariants (DO NOT MODIFY):**
- packet_key = parent identity (100% coverage, deterministic, idempotent)
- glyph_id = v3 deterministic (glyph:12hex format)
- 1 row per packet (until intentional tile expansion in Phase 4)
- ATLAS-1.0 completion = 100% (backward compatible)

---

## ATLAS-2.0 (Topology Layer) — FROZEN

```
packet → glyph_record → community_id → Neo4j topology
```

**Status:**
- Phase 2A: ✅ COMPLETE (14,515 packets materialized)
- Phase 2B: ✅ COMPLETE (Neo4j sync + Rust communities)
- Phase 2C: ⏳ DEFERRED (SOM retrain — non-blocking, low priority)
- Phase 2D: 🔮 PLANNED (HMM calibration — depends on Gemma4 summaries)

**Schema Freeze:**
- Enrichment-only additions (community_id, manifold4, authority_score)
- NO packet-level schema changes
- NO glyph_id regeneration
- NO row cardinality changes (until Phase 4 tile expansion)

---

## Phase 3: Runtime Intelligence (4 Weeks)

### 3A: Authority Reranker (Week 1)
- Implement Neo4j topology expansion (SIMILAR_TOPOLOGY edges)
- Implement community-aware reranking (0.35·vector + 0.25·graph + 0.20·community + 0.10·cache + 0.10·recency)
- Measure: MRR > 0.90, Recall@20 > 0.92

### 3B: Active Learning (Week 2)
- Harvest real query/response pairs from runtime
- Create `lora_training_candidates` table
- Implement reward scoring (0.40·relevance + 0.30·feedback + 0.20·repair + 0.10·latency)

### 3C: Retrieval Benchmark Suite (Week 2)
- 100 known queries (auth, cache, schema, topology, integration)
- Nightly automation (MRR, Recall@10, Recall@20, context density, latency)
- Regression gate (abort deployment if metric drop > 5%)

### 3D: Close Coverage Gap (Week 3)
- community_id coverage: ~34% → > 95% (hard gate)
- Fuzzy matching, Rust k=30, fallback clustering
- Verify gate before Phase 3A production

### 3 Complete (Week 4)
- Authority reranker: MRR > 0.90, Recall@20 > 0.92
- Benchmark live (nightly, dashboard)
- community_id coverage > 95%
- LoRA candidates > 1,000
- Phase 4 CHR97 design finalized

---

## What NOT to Do Now

**DO NOT:**
- ❌ Add tile-level one-to-many expansion (Phase 4 only)
- ❌ Implement SOM retraining (Phase 2C — deferred)
- ❌ Build HMM calibration (Phase 2D — deferred)
- ❌ Design CHR97 binary format (Phase 4 — premature)
- ❌ Prototype QUIC/gRPC (Phase 4.5+ — wait for retrieval proof)

**DO:**
- ✅ Improve authority reranking
- ✅ Harvest real LoRA candidates
- ✅ Build retrieval benchmarks
- ✅ Close community coverage gap
- ✅ Prove retrieval quality improvement

---

## Biggest Remaining Technical Risk

**Not SOM. Not HMM. It is:**

### Community Coverage Gap

```
Rust detectCommunitiesRust: ~5,000 nodes with community_id
CodebaseFile total:         5,253 nodes
atlas_feature_map total:    14,487 packets

Coverage: 5,000 / 14,487 = 34%  ← TOO LOW
Target:   > 95%                 ← HARD GATE
```

**Why critical:** Phase 3A reranking depends on community expansion. 34% coverage means 66% of retrievals bypass topology boost.

**New Hard Gate (Phase 3A Precondition):**
```
community_id coverage > 95%

Do NOT ship Phase 3A authority reranker
until 13,762+ packets have community assignments.
```

**Fix path (Week 3 Phase 3D):**
1. Analyze glyph_records WHERE community_id IS NULL
2. Fuzzy match source_ref → codebase_files.file_path
3. Rerun Rust detectCommunitiesRust (k=30 for better coverage)
4. Fallback clustering (directory-based) for unreachable
5. Verify > 95% before Phase 3A production

---

## References

- **Phase 2A/2B Summary:** `next_steps/active/2026-06-10_ATLAS-2.0-PHASE-SUMMARY.md`
- **Phase 3 Roadmap:** `next_steps/active/2026-06-10_PHASE-3-RUNTIME-INTELLIGENCE.md`
- **Phase 2B Runbook:** `next_steps/active/2026-06-10_atlas-phase-2b-neo4j-communities.md`
- **Memory Status:** `memory/atlas-strategic-freeze-phase-3.md`

---

## Next Checkpoint

**1 week:** Phase 3A authority reranker alpha + benchmark suite design ready

**Team signal:** ATLAS infrastructure is mature. Focus shifts to retrieval quality, active learning, and benchmarking. No more storage schema additions until Phase 4 tile expansion is justified by retrieval results.

---

**Decision by:** Architecture Review (2026-06-10)  
**Approved for:** Phase 3 Runtime Intelligence execution  
**Frozen artifact:** ATLAS-1.0 (14,515 packets, 100% coverage) + ATLAS-2.0 (Phase 2A/2B complete)  
**Deferred:** Phase 2C/2D (SOM retrain, HMM calibration — non-blocking)  
**Deferred:** Phase 4 (CHR97 cartridge — after Phase 3 retrieval quality proven)
