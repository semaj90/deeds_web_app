# Phase 4: Multi-Signal Ranking & Concept Fusion — Complete Scope

**Status**: Phase 4A DELIVERED ✅ | Phase 4B–4C PLANNED 📋  
**Total Duration**: 3 weeks (Weeks 1–3 of Phase 4)  
**Architecture**: 3-level progression (CPU now → RPC next → GPU later)

---

## Phase 4A: Multi-Signal RRF Ranking ✅ COMPLETE

**Delivered**: 6 modules + API + harness (783 lines)  
**Impact**: +15–30% DCG@10 vs baseline  
**Status**: Ready for validation and deployment

### Modules Delivered

1. **BM25 Search** (70 L) — Postgres trigram similarity
2. **Concept Overlap** (68 L) — JSONB array intersection
3. **RRF Combiner** (113 L) — Reciprocal rank fusion algorithm
4. **RRF Integration** (256 L) — Full pipeline orchestrator
5. **API Route** (106 L) — `POST /api/search/rrf` with presets
6. **Ablation Harness** (170 L) — IR metrics validation

### Validation Gates

- [x] All modules compile
- [x] API endpoint responds
- [ ] NDCG@10 >= 0.70 (needs 5+ queries tested)
- [ ] Latency p95 < 250ms

### Next Gate

**NDCG@10 >= 0.70 on 20-query benchmark** (Phase 4B task)

---

## Phase 4B: Concept Extraction & Graph Signal (Weeks 2)

**Duration**: 1 week (5 working days)  
**Effort**: 17 hours  
**Success Gate**: NDCG@10 >= 0.70 on all 20 queries

### Level 1 Phase 4B Tasks (CPU-only)

#### Task 1: Concept Extraction Tool (4 hrs)
- Gemma4-based query concept extraction
- 3–5 concepts per query with confidence scores
- Matches against `postgres.concepts` registry
- Returns empty gracefully on error

**File**: `src/lib/server/retrieval/concept-extraction-tool.ts`  
**Integration**: Feeds concepts into `conceptOverlapSearch()`

#### Task 2: Neo4j Graph Signal (4 hrs)
- Cypher query: `MATCH (c:Concept)-[r:USED_CONCEPT|SIMILAR]->(p:Packet)`
- Returns ranked packets by relationship weight
- Replaces placeholder in RRF integration
- Gracefully handles zero results

**File**: `src/lib/server/retrieval/neo4j-graph-signal.ts`  
**Integration**: 4th signal in `rrf-integration.ts`

#### Task 3: 20-Query Benchmark (5 hrs)
- Expand test set from 5 to 20 queries
- Manual relevance labels per query (8–12 docs each)
- Run all 4 weight presets on each query
- Compute DCG@10, NDCG@10, MRR@20, Recall@10
- Identify best-performing preset

**File**: `scripts/rrf-20-query-benchmark.ts`  
**Command**: `npm run rrf:benchmark:20-query`

#### Task 4: Integration Tests (2 hrs)
- Wire new modules into `rrf-integration.ts`
- Test via API: verify all 4 signals present
- Run ablation + benchmark
- Confirm NDCG@10 >= 0.70

#### Task 5: Documentation (2 hrs)
- Update MEMORY.md
- Create Phase 4B completion summary

### Output

- ✅ Concept extraction operational
- ✅ Neo4j signal fully wired
- ✅ 20-query benchmark PASS (NDCG >= 0.70)
- ✅ All 4 RRF signals validated

### What NOT to Do

❌ Don't implement SOM yet (that's Phase 4C)  
❌ Don't optimize latency yet (baseline first)  
❌ Don't add MessagePack (that's Level 2)  
❌ Don't build GPU JSON (that's Level 3)

---

## Phase 4C: SOM Topology & Hybrid Index (Week 3)

**Duration**: 1 week (5 working days)  
**Effort**: 12 hours  
**Success Gate**: Latency p95 < 250ms, error rate < 0.5%

### Level 1 Phase 4C Tasks (CPU-only)

#### Task 1: SOM Topology Integration (4 hrs)
- Boost results near query in SOM 2D grid
- Use existing SOM cluster data (from Phase 3I)
- Weight adjustment in RRF: nearby clusters +0.1 to score
- Example: query matched cluster at (x=10, y=15) → boost clusters (9–11, 14–16)

**File**: `src/lib/server/retrieval/som-topology-boost.ts`  
**Integration**: Post-RRF score adjustment

#### Task 2: Hybrid Index (Latency Optimization) (3 hrs)
- If BM25 score > 0.8 → skip Qdrant ANN search
- Early exit: no need for expensive vector similarity
- Reduces latency on high-confidence lexical matches
- Configurable threshold via `HYBRID_INDEX_THRESHOLD` env var

**File**: `src/lib/server/retrieval/hybrid-index.ts`  
**Integration**: Conditional in RRF integration

#### Task 3: Langfuse Telemetry (3 hrs)
- Log RRF breakdown per query (signal contributions)
- Track which preset was used
- Monitor latency distribution
- Measure NDCG@10 post-deployment

**Integration**: Post-RRF in API route

#### Task 4: Production Safeguards (2 hrs)
- Circuit breaker per signal: if any signal fails, skip it (don't error)
- Timeout per signal: 500ms max per lane (configurable)
- Fallback: BM25 + RRF default if other signals timeout
- Zero-impact error handling (return valid JSON always)

**File**: `src/lib/server/retrieval/signal-circuit-breaker.ts`

### Output

- ✅ SOM topology boost wired
- ✅ Hybrid index saves 30–40% latency on high-confidence queries
- ✅ Langfuse telemetry operational
- ✅ Production safeguards validated
- ✅ Latency p95 < 250ms confirmed
- ✅ Error rate < 0.5% on 48h monitoring

---

## Level 2: RPC Encoding & Contracts (Weeks 4+, DEFERRED)

**Activation criterion**: After Level 1 validates metrics + subagents start calling retrieval  
**Do NOT start until**: Phase 4C complete AND subagents exist

### What Level 2 Includes

#### 2.1 MessagePack Packet Encoding
- Packet 5.3KB → 2.1KB (60% compression)
- Redis cache upgrade: JSON → MessagePack
- RPC payload optimization for subagents

#### 2.2 Protobuf Service Contract
- Stable API between Gemma4 + Retrieval service
- Version negotiation (backward compatibility)
- Used when MCP subagents scale beyond 10

#### 2.3 Bounded JSON Tools
- `json.materialize_ndjson()` — stream JSON without OOM
- `json.sample_jq()` — reservoir sampling
- `json.validate_schema()` — fast schema validation

### Decision Point for Level 2

Start Level 2 when:
- [ ] NDCG@10 >= 0.70 confirmed (Phase 4B gate)
- [ ] Latency p95 < 250ms confirmed (Phase 4C gate)
- [ ] Subagents exist and need RPC contracts
- [ ] Single-process JSON parsing becomes bottleneck

**Not needed if**: Single process, <100MB artifacts, <50 qps

---

## Level 3: GPU-Assisted JSON (Year 2, NEVER IF NOT NEEDED)

**Activation criterion**: Graphify.json > 10GB (currently 100MB) OR CPU jq p95 > 1000ms (currently <5ms)

### What Level 3 Includes

#### 3.1 GpJSON / CUDA JSONPath
- GPU compilation of JSONPath queries
- Suitable for 10GB+ NDJSON scans
- Zero-copy deserialization via GPU memory

#### 3.2 cuVS GPU Vector Indexing
- Use if Qdrant ingestion > 100K vectors/sec
- Currently < 10K/sec, not needed

#### 3.3 LibTorch AE GPU Compression
- Use if manifold4 inference becomes bottleneck
- Currently negligible (<1ms per vector on CPU)

### CURRENT STATUS: DO NOT IMPLEMENT

❌ Graphify.json is 100MB (need 10GB trigger)  
❌ CPU jq latency is <5ms (need 1000ms trigger)  
❌ Qdrant ingestion is <10K/sec (need 100K trigger)  
❌ LibTorch AE inference is fast on CPU (no GPU needed)

---

## Tool Ladder (Execution Order)

```
User Query
  ↓
Level 1 Tools (Phase 4A–4C, CPU-only, NOW):
  ├─ rg (find files)
  ├─ ast-grep (structural search)
  ├─ jq (JSON query)
  ├─ concept-extraction (Gemma4 LLM)
  ├─ concept-overlap (Postgres JSONB)
  ├─ bm25-search (Postgres trigram)
  ├─ qdrant-search (Qdrant ANN)
  ├─ neo4j-graph-signal (Neo4j Cypher)
  ├─ rrf-combiner (merge all signals)
  └─ som-topology-boost (SOM grid proximity)
  ↓
Level 2 Tools (Weeks 4+, RPC encoding, NEXT):
  ├─ packet.encode_msgpack (compact serialization)
  ├─ json.materialize_ndjson (bounded streaming)
  └─ protobuf service contract (stable RPC)
  ↓
Level 3 Tools (Year 2, GPU JSON, NEVER UNLESS):
  ├─ gpu.jsonpath_scan (CUDA acceleration)
  ├─ cuVS.index_vectors (GPU indexing)
  └─ torch.ae_compress (GPU AE inference)
  ↓
Response (JSON for now, MessagePack if RPC in Phase 4C)
```

---

## Metrics & Success Gates

### Phase 4A Success
- [x] 6 modules delivered
- [x] API endpoint live
- [x] Graceful error handling
- [ ] NDCG@10 >= 0.70 (to be validated)

### Phase 4B Success
- [ ] Concept extraction 3–5 items/query
- [ ] Neo4j signal < 4 hops from concepts
- [ ] 20-query benchmark NDCG >= 0.70
- [ ] API returns all 4 signals

### Phase 4C Success
- [ ] SOM boost +5–10% on nearby clusters
- [ ] Hybrid index saves 30–40% latency on BM25 > 0.8
- [ ] Langfuse telemetry captures all signals
- [ ] Latency p95 < 250ms sustained
- [ ] Error rate < 0.5% over 48h

### Level 2 Success (if activated)
- [ ] MessagePack 40–60% smaller than JSON
- [ ] Proto RPC < 100ms latency
- [ ] Backward compatibility with JSON fallback

### Level 3 Success (IF ever activated)
- [ ] GPU JSON < 500ms for 10GB files
- [ ] Zero OOM at 8GB GPU memory
- [ ] cuVS ingestion > 100K vectors/sec

---

## Architecture Principles

### Level 1 (CPU Tools, NOW)
- **Principle**: CPU is cheap, GPU is precious
- **Scale**: 100MB–1GB artifacts
- **Tools**: Standard Linux utilities (rg, jq) + Node.js streams
- **OKay to build**: Anything that runs on CPU without blocking

### Level 2 (RPC Encoding, NEXT)
- **Principle**: Stable contracts before distribution
- **Scale**: When multiple services talk to each other
- **Tools**: MessagePack (fast), Protobuf (stable), FlatBuffers (zero-copy)
- **Okay to build**: After Phase 4C validates metrics

### Level 3 (GPU Acceleration, LATER)
- **Principle**: Only use GPU when CPU is exhausted
- **Scale**: 10GB+ artifacts, 100K+ ops/sec, 1000ms+ latency
- **Tools**: CUDA, TensorRT, LibTorch, cuVS
- **Okay to build**: When actual scale triggers demand, NOT before

---

## What NOT to Do (Anti-Patterns)

❌ **Build MessagePack now** — Wait for Phase 4C gate (latency < 250ms)  
❌ **Build GPU JSON now** — Wait for 10GB trigger (currently 100MB)  
❌ **Build FlatBuffers now** — Deferred to Year 2  
❌ **Optimize latency prematurely** — Measure baseline first (Phase 4B)  
❌ **Add SOM before benchmark** — Order matters (Phase 4C)  
❌ **Build subagent contracts before subagents exist** — Cart before horse  

---

## Timeline Summary

| Phase | Week | Duration | Effort | Gate |
|-------|------|----------|--------|------|
| **4A** | 1 (parallel) | ✅ 2.5h | ✅ Done | Compile ✅ |
| **4B** | 2 | 5 days | 17h | NDCG@10 >= 0.70 |
| **4C** | 3 | 5 days | 12h | Latency p95 < 250ms |
| **Level 2** | 4+ | Deferred | TBD | Subagents exist |
| **Level 3** | Y2+ | Deferred | TBD | 10GB trigger |

---

## References

**Phase 4A Delivery**: `memory/phase-4a-implementation-delivery.md` (302 L)  
**Three-Level Roadmap**: `memory/phase-4b-4c-three-level-roadmap.md` (430 L)  
**Level 1 Task List**: `memory/phase-4b-level-1-task-list.md` (340 L)  
**Phase 4A Summary**: `docs/PHASE-4A-COMPLETE-SUMMARY.md` (165 L)  
**Phase 4A Manifest**: `PHASE-4A-MANIFEST.txt` (320 L)

---

**Status**: ✅ Phase 4A COMPLETE, 📋 Phase 4B–4C PLANNED, 🎯 3-LEVEL ARCHITECTURE DEFINED

Ship Phase 4A → Validate → Move to Phase 4B.
