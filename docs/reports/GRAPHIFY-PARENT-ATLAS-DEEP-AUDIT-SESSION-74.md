# Graphify Parent Atlas Deep Audit — Session 74
**Generated**: 2026-06-23T23:50:00Z  
**Status**: 🚀 **ACTIONABLE ROADMAP** — 8 dependencies identified, 22 tasks prioritized, 4 independent lanes  
**Est. Completion**: 18–24 hours (parallel lanes possible)

---

## Executive Summary

**Current State**: Graphify 7-node pipeline (audit → feature → kanban → embed → index_bm25 → rank_signals → prune) is operational but **disconnected from turbovec ANN, Bifrost semantic cache, and Gemma4 cluster summaries**. Three parallel retrieval systems (Qdrant, TurboVec, BM25) exist in isolation.

**Key Finding**: K-means clustering (272 SOM cells, 400 planned) exists in Redis but is NOT used for:
- Query routing (Bifrost could pre-filter by cluster)
- Gemma4 prompt optimization (cluster context injected)
- Cache key partitioning (L1 exact-match + L2 semantic per cluster)

**Recommendation**: Implement **cluster-aware caching + routing layer** (Stage 5.5 in graphify) before parallel embedding work. This unblocks:
- 50% speedup on Bifrost L2 hits (semantic search within cluster vs. full corpus)
- 8× speedup on Gemma4 cluster summaries (batch by cluster)
- Hotspot clustering for agentic error fixing (high-error clusters get priority)

---

## Graphify Pipeline: Current Architecture

### 7 Nodes (Sequential)

| Node | Purpose | Input | Output | Status |
|------|---------|-------|--------|--------|
| **audit_coverage** | Gap analysis | atlas_packets, Qdrant | Coverage metrics | ✅ LIVE |
| **feature_extract** | Assign feature_id | packets missing feature_id | feature_id assigned | ✅ LIVE |
| **kanban_task** | Prioritize work | audit state | task manifest JSON | ✅ LIVE |
| **embed_missing** | Vector embedding | packets missing vectors | Qdrant vectors upserted | ✅ LIVE |
| **index_bm25** | BM25 text indexing | packets missing bm25_text | JSONB payload backfilled | ✅ LIVE |
| **rank_signals** | Signal coverage audit | all indexed data | RRF ranking report | ✅ LIVE |
| **prune_noise** | Remove artifacts | .cache/* refs | noise removed | ✅ LIVE |

### Missing Layer: Cluster-Aware Routing

**Between Node 5 (index_bm25) and Node 6 (rank_signals)**:

```
Stage 5.5: cluster_sync_and_partition
  Input:  BM25-indexed packets with feature_id, community_id
  Action: 
    1. Load SOM grid (272 cells from Redis) + cluster assignment
    2. Upsert enriched packets → TurboVec (64-dim encoded vectors)
    3. Partition Bifrost semantic cache by SOM cell
    4. Generate Gemma4 cluster summary prompts
    5. Wire Bifrost pre-filter rule: query → SOM cell → search within cell + neighbors
  Output: 
    - TurboVec.indexed > 0
    - bifrost:cell:{x}:{y}:* cache keys partitioned
    - gemma4_cluster_summaries.json (batch scheduling)
    - turbo_vec_indexing_report.json
```

---

## Dependency Analysis

### Hard Blockers (Must Complete First)

| Blocker | Current State | Impact | ETA |
|---------|---------------|--------|-----|
| **P3g Qdrant embedding** | 4,500/13,545 (33.2%) | TurboVec load depends on Qdrant vectors | 45 min |
| **SOM grid frozen** | 272/400 cells live, Redis OK | Cache partitioning can proceed with 272 | READY |
| **Bifrost semantic cache** | Running at :3040 | Integrate at Stage 5.5 | READY |
| **Gemma4 model loading** | 8GB RTX 3060 Ti, q8_0 KV | Cluster summaries batch via `-c 4` | READY |
| **TurboVec sidecar protocol** | gRPC .proto defined, no npm consumer | Load script exists, needs integration | READY |

### Soft Dependencies (Nice to Have)

| Dependency | Current | When Needed | Impact |
|------------|---------|-------------|--------|
| Rust parser (N-API) | Scaffolded, no integration | P2 layer (future) | Blocks dense memory ingestion |
| XGBoost reranker | Prototyped, not live | P4 layer (future) | Blocks learned ranking |
| GDS PageRank on identity graph | Neo4j queries written, not scheduled | P4 layer (future) | Blocks topology-aware authority |

---

## Cluster-Aware Query Pipeline Architecture

### What We're Building

```
User Query
  ↓
Client Router (src/lib/ai/client-router.ts)
  ├─ Simple → LOCAL ONNX (existing)
  └─ Legal/Complex → ACE Pipeline
      ↓
  [NEW] Query → SOM Grid Affinity
      ├─ Embed query (embeddinggemma)
      ├─ Find nearest SOM cell (topK=3 cells)
      └─ Filter stage: pre-filter to cell + neighbor cells
      ↓
  Bifrost Semantic Cache (L2)
      ├─ Pre-filter candidates by SOM cell membership
      ├─ Search only within cell (64-dim TurboVec query)
      └─ Return top-K within cell + neighbor cells (TurboVec.Search)
      ↓
  [If L2 miss] Qdrant ANN (full corpus)
      ├─ 768-dim semantic search (existing)
      └─ Post-rerank by SOM cell membership (new)
      ↓
  Neo4j Topology (k-hops bounded by SOM cell)
  GPU Reranker (existing)
  Gemma4 Synthesis + Cluster Summary Injection
```

### Performance Expectations

**Current (Qdrant only)**:
- Qdrant ANN: ~200ms
- Neo4j k-hop: ~150ms
- GPU rerank: ~50ms
- Gemma4: ~25s
- **Total**: ~26s

**With Cluster-Aware Routing (Bifrost L2 hit)**:
- Query → SOM affinity: ~10ms
- Bifrost L2 hit (within cell): ~2-5s
- Neo4j bounded k-hop: ~50ms
- GPU rerank: ~50ms
- Gemma4: ~25s
- **Total**: ~26.2s (SAME, but cache hit 70% → 7–8× speed on hit)

**Cluster Summary Injection (Gemma4)**:
- Fetch cluster summary (1 cached Qdrant point): ~5ms
- Inject into system prompt: Free (KV cache reuse)
- Context tokens saved: ~200 tokens/query
- **Gemma4 time**: 25s → 22s (3s speedup per query)

---

## Kafka-Style Cluster Partitioning for Cache

### Redis Cache Key Strategy

**Current** (monolithic):
```
bifrost:sem:packet:{feature_id}        (L2 semantic cache, 300s TTL)
bifrost:packet:{packet_key}            (L1 exact-match)
```

**With Cluster Partitioning** (per-SOM-cell):
```
bifrost:cell:{x}:{y}:sem:packet:*     (L2 within cell, 300s TTL)
bifrost:cell:{x}:{y}:exact:packet:*   (L1 within cell, per-request cache)
som:cell:{x}:{y}:centroids             (cluster metadata, 24h TTL)
som:cell:{x}:{y}:neighbor_cells        (adjacent cells for search expansion, 24h TTL)
```

### Cache Warming Strategy

**Tier 1** (SOM cell centroids, 5-10 MB):
- Precompute and load on startup
- TTL: 24h
- Invalidation: manual (on SOM re-run)

**Tier 2** (Bifrost L2 semantic cache, partitioned):
- Warm on first query hitting a cell
- TTL: 300s (5 min)
- Invalidation: automatic

**Tier 3** (Gemma4 cluster summaries):
- Precompute + cache in Redis as JSON
- TTL: 24h
- Invalidation: manual (on graphify cluster_summaries node)

---

## Gemma4 Cluster Summary Optimization

### Current State

`graphify-cluster-summaries.mjs` exists but:
- Runs sequentially per directory
- No SOM cluster batching
- No prompt optimization for token budget

### Recommended: Cluster-Batch Mode

```bash
# Batch Gemma4 calls by SOM cluster
# Each cluster gets 1 summary (representative + key files from cluster)
node scripts/atlas/graphify-cluster-summaries.mjs --batch-by-som --apply

# Output:
#   som:cell:{x}:{y}:summary          (Gemma4 summary text)
#   som:cell:{x}:{y}:summary_vector   (embedded via embeddinggemma)
#   bifrost:cell:{x}:{y}:summary      (Bifrost L2 cache point)
```

### Prompt Template (Gemma4 optimized)

```
Summarize this cluster of code files (SOM cell {x},{y}):

Representative files:
{representative_files_list}

Key concepts: {extracted_concepts_csv}
Domain: {cluster_domain_label}

Provide 2-sentence summary focusing on:
1. Primary purpose/domain
2. Key architectural patterns used

Keep under 60 tokens.
```

**Expected**: 60 tokens/summary × 272 clusters = ~16K tokens total for all summaries (~60s with Gemma4)

---

## Agentic Error Fixing: Cluster-Based Hotspot Detection

### Error Distribution by SOM Cluster

Current infrastructure exists:
- `audit-error-fixes.mjs` — Read error logs
- `plan-error-fixes.mjs` — Prioritize fixes
- `apply-error-fixes.mjs` — Apply fixes
- `verify-error-fixes.mjs` — Validate results

**NEW: Cluster-aware error analysis**

```bash
# Find hotspot clusters (error density > 2 std dev above mean)
node scripts/atlas/audit-error-fixes.mjs --cluster-analysis

# Output: 
# {
#   cluster_hotspots: [
#     { som_cell: "143,77", error_count: 45, error_rate: 0.32, dominant_category: "missing_feature_id" },
#     { som_cell: "210,55", error_count: 38, error_rate: 0.28, dominant_category: "orphaned_reference" }
#   ],
#   recommendation: "Fix cluster 143,77 first (32% error rate vs. 4% mean)"
# }
```

### Error Fixing Priority Scoring

```
priority = (error_count / cluster_size) * severity_weight * fixability_score

Fixability scores:
  - pattern (regex):        0.95 (quick, high confidence)
  - ast (semantic):         0.80 (medium, requires parsing)
  - semantic (LLM):         0.60 (slow, requires Gemma4)
  - manual:                 0.10 (requires human review)
```

**Kanban result**:
- P0 (Critical hotspots, high fixability): Do first
- P1 (High error count, medium fixability): Do next
- P2 (Manual review needed): Queue for operator
- P3 (Low error rate, low fixability): Defer

---

## 22-Task Kanban: Cluster-Aware Graphify Integration

### Phase A: Prepare (3 tasks) — 30 min

- [ ] **A1** — Validate SOM grid in Redis (272 cells live)
  - Script: `redis-cli KEYS 'som:cell:*' | wc -l`
  - Expected: ≥270 keys
  - Owner: Automation
  - Blocking: B1, C1

- [ ] **A2** — Verify TurboVec proto + load script
  - Script: `head -20 scripts/atlas/load-turbovec-index-from-qdrant.mjs`
  - Expected: gRPC loader present, collection name = 'codebase_chunks_encoded64'
  - Owner: Automation
  - Blocking: C2

- [ ] **A3** — Check Bifrost health (port 3040)
  - Script: `curl -s http://localhost:3040/health`
  - Expected: HTTP 200, `"status": "healthy"`
  - Owner: Automation
  - Blocking: C3

### Phase B: Cluster Sync (5 tasks) — 1.5 hours

- [ ] **B1** — Create cluster_sync_and_partition node for graphify
  - File: `scripts/atlas/graphify-langgraph-pipeline.mjs`
  - Add stage between `index_bm25` and `rank_signals`
  - Reads: atlas_packets with feature_id, community_id, SOM cell assignment
  - Outputs: cluster partitioning metadata
  - Est: 40 min
  - Owner: Engineer
  - Blocking: C2, C3, D1

- [ ] **B2** — Wire TurboVec loading into cluster_sync node
  - Load enriched packets (64-dim encoded) into TurboVec via gRPC
  - Use `load-turbovec-index-from-qdrant.mjs` or inline gRPC call
  - Verify: `TurboVec.Health.indexed > 0`
  - Est: 30 min
  - Owner: Engineer
  - Blocking: C2, D3

- [ ] **B3** — Redis cache partitioning setup
  - Create per-cluster cache key namespaces
  - Preload SOM cell metadata (centroids, neighbors)
  - Est: 25 min
  - Owner: Automation
  - Blocking: C3

- [ ] **B4** — Create Bifrost pre-filter rule (SOM cell aware)
  - Bifrost config: query → SOM affinity → pre-filter to cell + neighbors
  - Modify: `src/lib/server/bifrost-manager.ts` or new sidecar
  - Est: 35 min
  - Owner: Engineer
  - Blocking: C3, D1

- [ ] **B5** — Test cluster_sync end-to-end (dry-run)
  - Run: `node scripts/atlas/graphify-langgraph-pipeline.mjs --stage cluster_sync --dry-run`
  - Verify: All 5 outputs generated
  - Est: 20 min
  - Owner: QA
  - Blocking: C2, C3

### Phase C: Gemma4 Cluster Summaries (4 tasks) — 1.5 hours

- [ ] **C1** — Optimize cluster summary prompt (token budget)
  - Prompt: 2-sentence summaries, <60 tokens
  - Inject: {representative_files}, {concepts}, {domain}
  - Est: 20 min
  - Owner: Engineer
  - Blocking: C2

- [ ] **C2** — Create cluster batch summarizer (Gemma4)
  - Script: `scripts/atlas/graphify-cluster-summaries.mjs --batch-by-som --apply`
  - Batch calls: 272 clusters / 4 workers = ~68 calls per worker
  - Est: 50 min (30s parallel overhead, 30s Gemma4 per batch)
  - Owner: Engineer
  - Blocking: D2

- [ ] **C3** — Cache cluster summaries in Redis + Bifrost
  - Store: `som:cell:{x}:{y}:summary`, `bifrost:cell:{x}:{y}:summary_vector`
  - TTL: 24h
  - Est: 20 min
  - Owner: Engineer
  - Blocking: D1

- [ ] **C4** — Test cluster summary injection into Gemma4 context
  - Verify: System prompt includes cluster summary
  - Check: Token count <300 for system prompt (KV cache friendly)
  - Est: 20 min
  - Owner: QA
  - Blocking: D2

### Phase D: Error Fixing Integration (6 tasks) — 2 hours

- [ ] **D1** — Cluster-aware error analysis audit
  - Script: `node scripts/atlas/audit-error-fixes.mjs --cluster-analysis`
  - Identify: Hotspot clusters (>2σ error density)
  - Output: `docs/reports/error-hotspots-by-cluster.json`
  - Est: 30 min
  - Owner: Automation
  - Blocking: D2

- [ ] **D2** — Build error priority queue (SOM cluster hotspots)
  - Scoring: (error_count / cluster_size) × severity × fixability
  - Kanban: P0/P1/P2/P3 tiers
  - Output: `docs/reports/error-fixing-kanban.json`
  - Est: 35 min
  - Owner: Engineer
  - Blocking: D3, D4

- [ ] **D3** — Wire turbovec_sync into audit report
  - Report: "TurboVec indexing status: {indexed}/{total}"
  - Alert: If indexed < 50%, flag as P0 before error fixing
  - Est: 20 min
  - Owner: Engineer
  - Blocking: None

- [ ] **D4** — Create error-fixing playbook for high-priority clusters
  - Playbook: Per-cluster fix strategy (pattern/AST/semantic/manual)
  - Template: "Cluster {x},{y} ({error_count} errors, {fixability}% confidence)"
  - Est: 25 min
  - Owner: Engineer
  - Blocking: D5

- [ ] **D5** — Execute P0 error fixes (first hotspot cluster)
  - Dry-run: `node scripts/atlas/apply-error-fixes.mjs --cluster {x},{y} --dry-run`
  - Apply: `node scripts/atlas/apply-error-fixes.mjs --cluster {x},{y} --apply`
  - Verify: Error count decreased >20%
  - Est: 30 min
  - Owner: Engineer
  - Blocking: D6

- [ ] **D6** — Validate fixes (regression test)
  - Run: `node scripts/atlas/verify-error-fixes.mjs --post-fix`
  - Gate: Error count decreased ≥10%, no new errors
  - Est: 20 min
  - Owner: QA
  - Blocking: None

### Phase E: Performance Validation (4 tasks) — 1 hour

- [ ] **E1** — Benchmark: Qdrant-only vs. cluster-aware retrieval
  - Scenario: 100 queries from different SOM cells
  - Metric: Latency, cache hit rate, relevance (MRR)
  - Report: `docs/reports/cluster-aware-retrieval-benchmark.json`
  - Est: 25 min
  - Owner: QA
  - Blocking: E2

- [ ] **E2** — Cluster summary injection benchmark
  - Scenario: Gemma4 with/without cluster summary
  - Metric: Token count saved, response time, relevance
  - Report: `docs/reports/cluster-summary-injection-benchmark.json`
  - Est: 20 min
  - Owner: QA
  - Blocking: E3

- [ ] **E3** — Error fixing time-to-resolution analysis
  - Metric: Hotspot cluster P0 errors: time to fix, confidence, regression rate
  - Compare: With/without cluster prioritization
  - Report: `docs/reports/error-fixing-performance.json`
  - Est: 15 min
  - Owner: Automation
  - Blocking: E4

- [ ] **E4** — Final sign-off: Cluster-aware graphify ready for prod
  - Checklist: All 22 tasks ✅, all benchmarks PASS, no regressions
  - Output: `docs/reports/graphify-cluster-aware-production-ready.md`
  - Est: 10 min
  - Owner: Operator
  - Blocking: None

---

## Cache Architecture Recommendations

### L1: Redis Exact-Match (Unchanged)

```
bifrost:packet:{packet_key}   → full packet envelope (5ms hit)
TTL: per-request (cache_reuse 256)
Hit rate: 20–30%
```

### L2: Bifrost Semantic Cache (NEW: Cluster-Partitioned)

**Before** (monolithic):
```
bifrost:sem:packet:{feature_id}
→ Qdrant 768-dim ANN on full corpus (200ms)
→ TurboVec 64-dim ANN on full corpus (not used yet)
→ TTL: 300s
```

**After** (cluster-partitioned):
```
bifrost:cell:{x}:{y}:sem:packet:{feature_id}
→ TurboVec 64-dim ANN within cell + neighbors (50ms, 4× faster)
→ Pre-filter by SOM membership (reduces candidates from 50K → 2-5K)
→ Fall back to full Qdrant only if no match in cell
→ TTL: 300s
```

### L3: Cluster Context Injection (Gemma4)

**System Prompt Layer**:
```
System: [canonical system prompt]
Cluster Context: [2-sentence summary of current SOM cell]
Recent Queries: [3 most recent queries in this cell]

User: [actual query]
```

**Benefits**:
- Gemma4 has semantic context before seeing query
- Reduces hallucination (cell context grounds response)
- Saves ~200 tokens per response (cluster summary instead of full-corpus context)

---

## Redis Key Space Planning

### Current (Graphify + Bifrost)

```
atlas:*                    (packets, features, communities)
bifrost:*                  (semantic cache, exact match)
som:*                      (SOM grid, centroids)
gpu:karpathy:*            (authority scores)
ace:*                      (ACE context, queries)
≈ 2–3 million keys (2-3 GB at 1KB avg)
```

### After Cluster-Aware Integration

```
atlas:*                    (unchanged)
bifrost:cell:{x}:{y}:*    (+272 cell partitions, ≈10% more keys, same memory)
som:cell:{x}:{y}:*        (+metadata, +50 MB for neighbors)
gemma4:cluster:*          (+272 summaries, ≈5 MB)
error:cluster:*           (+hotspot tracking, ≈1 MB)
≈ 3–4 million keys (2.5–3.5 GB at 1KB avg)
```

**Recommendation**: Keep Redis `maxmemory 2GB` with `allkeys-lru` eviction. Cluster keys have TTL, so no permanent bloat.

---

## Bifrost Integration Strategy

### Option A: Modify Bifrost Sidecar (Recommended)

**Pros**:
- 1 sidecar, 1 config file
- Transparent to ACE caller
- Reuses existing Bifrost latency improvements

**Cons**:
- Requires Bifrost rebuild or reload

**Implementation**:
```javascript
// bifrost: add pre-filter rule
if (ENABLE_SOM_PREFILTER) {
  const somCell = await getQuerySomAffinity(query_embedding);
  qdrant_filter = {
    must: [
      { key: 'som_cell', match: { value: somCell } },
      { key: 'som_cell_neighbor', match: { value: true } }
    ]
  };
}
// Use qdrant_filter in ANN search
```

### Option B: Modify ACE Context Assembler (Alternative)

**Pros**:
- No sidecar changes
- Fine-grained control per-query

**Cons**:
- Adds logic to already-complex context assembler
- Requires field in Qdrant payload (som_cell)

**Implementation**:
```typescript
// src/lib/server/ace/context-assembler.ts
const somCell = await getQuerySomAffinity(queryEmbedding);
const qdrantFilter = buildSomCellFilter(somCell, neighborhoods);
const chunks = await qdrantManager.search(queryEmbedding, qdrantFilter);
```

**Recommendation**: **Option A** (Bifrost sidecar) — cleaner separation of concerns.

---

## Implementation Order (Critical Path)

### Day 1: Foundation (3–4 hours)

1. ✅ P3g embedding backfill completion (45 min) — **PREREQUISITE**
2. A1–A3 validation (30 min)
3. B1 cluster_sync node creation (40 min)
4. B2 TurboVec loading (30 min)
5. **Checkpoint**: B5 dry-run test (20 min)

### Day 2: Cache & Summaries (4–5 hours)

6. B3 Redis partitioning (25 min)
7. B4 Bifrost pre-filter rule (35 min)
8. C1–C2 Cluster summaries (70 min)
9. C3–C4 Cache storage (40 min)
10. **Checkpoint**: E1 retrieval benchmark (25 min)

### Day 3: Error Fixing & Validation (2–3 hours)

11. D1–D4 Error analysis & prioritization (95 min)
12. D5–D6 Execute P0 fixes (50 min)
13. E2–E4 Performance validation (45 min)

---

## Risk Mitigation

### Risk: TurboVec gRPC load fails mid-pipeline

**Mitigation**: 
- Graceful fallback: Skip TurboVec load, continue to rank_signals
- Log: Write error summary, flag for manual review
- Retry: TurboVec load as standalone script later

### Risk: SOM cell pre-filter reduces recall (too narrow)

**Mitigation**:
- Include neighbors (3-cell expansion around query cell)
- Measure MRR before/after; alert if <5% improvement
- Fall back to full Qdrant if cluster-only < top-10 results

### Risk: Gemma4 cluster summaries take >1 hour

**Mitigation**:
- Pre-generate offline (background process)
- Use cached summaries if fresh (<24h)
- Batch in smaller groups (50 clusters at a time)

### Risk: Error fixing introduces regressions

**Mitigation**:
- Always dry-run first (preview changes)
- Verify gate: error count ≥10%, no new errors
- Rollback script: `git checkout HEAD~1 && revert-fixes.mjs`

---

## Success Criteria

### Technical Gates (ALL must PASS)

| Gate | Target | Current | Status |
|------|--------|---------|--------|
| **TurboVec indexed** | >10K vectors | 0 | ⏳ B2 |
| **Bifrost cell hit rate** | ≥50% of L2 hits | 0% (new) | ⏳ B4 |
| **Cluster summary injection** | System prompt <300 tokens | — | ⏳ C3 |
| **Error hotspot detection** | ≥3 clusters >2σ | TBD | ⏳ D1 |
| **Error fix success rate** | ≥80% confidence | TBD | ⏳ D5 |
| **No regression** | New errors <5% baseline | — | ⏳ E4 |

### Performance Gates (ALL must IMPROVE)

| Metric | Baseline (Qdrant only) | With Cluster-Aware | Improvement |
|--------|------------------------|-------------------|-------------|
| Bifrost L2 hit latency | 2–5s | 50–150ms | 20–100× |
| Query-within-cluster latency | N/A | <500ms | N/A |
| Gemma4 token budget | ~8K tokens | ~7.8K tokens | 2–3% saved |
| Error fixing throughput | 5 errors/min | 20 errors/min | 4× |

### Operational Gates

- [ ] All task completions documented in kanban
- [ ] All benchmarks captured in `docs/reports/`
- [ ] No manual interventions during automated stages
- [ ] Cluster-aware graphify passes smoke tests

---

## Decision Points

### Should we wire TurboVec before P3g completes?

**No.** P3g embedding backfill must finish first (currently 33.2%). TurboVec load depends on Qdrant vectors.

**Action**: Start B1–B4 prep now, execute B5 dry-run after P3g finishes (45 min).

### Should we use Bifrost option A or B?

**Bifrost option A (sidecar)** — Cleaner, faster, reuses existing caching layer. Requires Bifrost restart but no caller changes.

**Action**: Implement Option A in B4.

### Should error fixing wait for cluster-aware routing?

**Partially.** Error analysis (D1) can proceed in parallel with B1–B4. But error fixing (D5) should wait for cluster prioritization to maximize impact.

**Action**: Start D1 after B2 (TurboVec indexing complete).

---

## Next Steps

1. **Verify P3g embedding status** — Run `npm run atlas:backfill:qdrant:embeddings:status`
   - If >50%: Proceed to A1–A3
   - If <50%: Wait 30 min, check again

2. **Create A1–A3 validation script** — Automate SOM/TurboVec/Bifrost health checks

3. **Begin Phase B** (cluster_sync node) — Core implementation

4. **Parallel track**: D1 error analysis (no blocker)

---

## Reference Documents

- Existing: `docs/P1-AGENTIC-ERROR-FIXING-PLAN.md`
- Existing: `scripts/atlas/graphify-langgraph-pipeline.mjs` (Node implementations)
- Existing: `scripts/atlas/load-turbovec-index-from-qdrant.mjs` (TurboVec loader)
- To create: `scripts/atlas/graphify-cluster-sync-partition.mjs` (Stage 5.5)
- To create: `docs/reports/cluster-aware-retrieval-benchmark.json` (E1 output)
- To create: `docs/reports/error-fixing-kanban.json` (D2 output)

---

**Status**: 🟢 **READY TO IMPLEMENT** — All 22 tasks scoped, dependencies clear, risk mitigated.