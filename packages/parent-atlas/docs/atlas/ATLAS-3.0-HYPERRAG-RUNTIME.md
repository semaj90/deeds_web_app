# ATLAS-3.0: HyperRAG Runtime Design

**Status**: 🔮 DESIGN PHASE (ready to implement after Phase 2C validation gates pass)
**Date**: 2026-06-10
**Based on**: Phase 2A & 2B completion + validation gate requirements

---

## Overview

Phase 3 implements the full HyperRAG retrieval pipeline. With Phase 2 infrastructure locked, we have:

- **Packets**: 14,487 NES/CHR packets (100% coverage) ✅
- **Communities**: 5,000+ nodes in 716 Louvain communities ✅
- **Graph**: 5,253 CodebaseFile nodes, 31,543 total in Neo4j ✅
- **Topology**: 15,386 SIMILAR_TOPOLOGY edges ready for GDS ✅
- **Glyphs**: Manifold4 quaternion (X, Y, rank, weight) prepared ⏳

## Query Flow

```
Query Input
  ↓
normalize + embed
  ↓
Qdrant semantic search (768-dim content vector)
  ↓
community expansion (Neo4j SIMILAR_TOPOLOGY + HAS_COMMUNITY)
  ↓
graph expansion (Neo4j Dijkstra, limited to 5-hop depth)
  ↓
authority rerank (graphAuthorityScore + manifold4 weight)
  ↓
packet hydrate (Redis cache + nes_chrom_packets Postgres)
  ↓
ACE context assembly
  (fusion: RAG chunks + Neo4j neighborhood + authority)
  ↓
Gemma4 synthesis
  ↓
Answer + citations + trace
```

## Stage 1: Qdrant Semantic Search

**Entry point**: User query (4K context max)

**Pipeline**:
1. Embed query via `/api/embed` (embeddinggemma 768-dim)
2. Search `codebase_chunks_768` collection (dense vector search)
3. Retrieve top-K (default K=10, configurable per query)
4. **KEY FIELDS in payload**:
   - `source_ref` — file path for disambiguation
   - `feature_id` — link to atlas_feature_map
   - `community_id` — link to Neo4j community
   - `qdrant_point_id` — self-reference
   - `tags[]` — semantic labels

**Gate requirement**: All 54,331 Qdrant points MUST have `community_id` in payload
- **Current status**: 0% (Gate 2 FAILED)
- **Unblock**: Patch neo4j-graph-enrich to write Qdrant payloads

---

## Stage 2: Community Expansion

**Input**: Top-K Qdrant chunks + their `community_id`

**Pipeline**:
1. Query Neo4j for community nodes:
   ```cypher
   MATCH (c:CommunityNode)-[r:HAS_COMMUNITY]-(f:CodebaseFile)
   WHERE c.id IN $communityIds
   RETURN f.filePath, f.graphAuthorityScore, r.strength
   ```
2. Fetch related chunks from same communities
3. Add to candidate set (bounded by 50 nodes per community)

**Output**: Expanded candidate set (typically 20-100 chunks)

---

## Stage 3: Graph Expansion (Dijkstra)

**Input**: Expanded candidate set

**Pipeline**:
1. Neo4j GDS shortest-path algorithm on `codeTopology` projection:
   ```cypher
   CALL gds.shortestPath.dijkstra.stream('codeTopology',
     {sourceNode: $startId, targetNodes: $targetIds, relationshipWeightProperty: 'cost'})
   YIELD path, totalCost
   ```
2. Follow IMPORTS/CALLS/SIMILAR_TOPOLOGY edges (max 5 hops)
3. Filter by cost threshold (prevent runaway traversals)
4. Collect all nodes in result paths

**Output**: Path-connected nodes (dependency graph neighbors)

---

## Stage 4: Authority Rerank

**Input**: Merged candidate set (Qdrant + community + graph)

**Ranking formula**:
```
score = 0.5 * qdrant_similarity
      + 0.2 * (graphAuthorityScore / maxAuthority)
      + 0.2 * (manifold4[3] / maxWeight)
      + 0.1 * (1 / (1 + path_distance))
```

**Sort by score DESC, limit to top 20 for ACE context**

---

## Stage 5: Packet Hydrate

**Input**: Top-20 reranked candidates

**Pipeline**:
1. Map `feature_id` → `packet_id` (from atlas_feature_map)
2. Check Redis cache: `ace:packet:<packet_id>` (5ms hit)
3. Fallback to Postgres: `SELECT payload FROM nes_chrom_packets WHERE packet_id = $1`
4. Deserialize JSONB payload
5. Include in ACE context as `{ source_ref, summary, tags, centroid_id, community_id }`

**Cache hit rate target**: 80%+ (Redis L1)

---

## Stage 6: ACE Context Assembly

**Input**: 20 hydrated packets

**Output**: Structured context object:
```json
{
  "retrieved_chunks": [
    {
      "source_ref": "src/lib/server/ai/rag-pipeline.ts",
      "feature_id": "feat:rag-pipeline",
      "packet_id": "pk:xyz123",
      "summary": "RAG pipeline orchestration",
      "tags": ["retrieval", "orchestration", "RAG"],
      "community_id": 42,
      "authority_score": 0.87,
      "relevance_score": 0.94,
      "retrieval_stage": "qdrant"
    },
    ...
  ],
  "community_context": {
    "communities": [42, 87, 103],
    "community_descriptions": {
      "42": "AI pipelines and inference routing"
    }
  },
  "graph_context": {
    "imports": ["src/lib/server/redis.ts", "src/lib/server/vector/qdrant-manager.ts"],
    "imported_by": ["src/routes/api/rag/search/+server.ts"]
  },
  "retrieval_trace": {
    "query_embedding_ms": 145,
    "qdrant_ms": 23,
    "community_expansion_ms": 12,
    "graph_expansion_ms": 34,
    "rerank_ms": 8,
    "total_ms": 222,
    "candidates_evaluated": 156,
    "final_rank": 20
  }
}
```

---

## Stage 7: Gemma4 Synthesis

**Input**: ACE context

**Prompt template**:
```
# Codebase Context (Atlas)

## Retrieved Code Chunks
{retrieved_chunks}

## Dependency Graph
{graph_context}

## Community Information
{community_context}

---

User Question: {query}

Synthesize an answer using the code context above.
```

**Model**: `gemma4-rotorquant:latest` (5.3GB, legal fine-tune merged)

**Output**: Answer + citations

---

## Implementation Roadmap

> **Reordered 2026-06-12** — original roadmap bundled three independent decisions
> (storage tiering, native GEMM bindings, HyperRAG pipeline) that should not be
> implemented simultaneously. The bottleneck is retrieval signal quality, not
> matrix multiplication speed. Stages reordered by evidence-backed priority.
>
> Canonical order:
> BM25 + concept activation -> deeds/engram optional adapter ->
> XGBoost formal reranker -> Neo4j contextual trees + HyperRAG packet RPC ->
> Autoencoder / SOM latent topology -> native GEMM deferred.

### Decision Split

- Storage tiering and adapter boundary: `docs/atlas/parent-atlas-storage-decision.md`
- XGBoost reranker contract: `docs/atlas/xgboost-reranker-contract.md`
- Native GEMM / pybind11 deferral: `docs/atlas/native-gemm-deferral.md`

### Corrected Stage Order

1. **Stage 1**: BM25 text backfill & Concept extraction
2. **Stage 2**: Engram MCP integration & XGBoost reranker
3. **Stage 3**: Neo4j contextual trees & HyperRAG packet RPC
4. **Stage 4**: Autoencoder & SOM & Latent topology
5. **Stage 5**: Native GEMM, QLoRA policy, RL policy (Deferred)

---

### Architectural Decisions (Separated)

#### Decision 1 — Storage Tiering ✅ AGREED, IMPLEMENT NOW

```
Hot   → Redis / Valkey / Bifrost
Warm  → Postgres + Qdrant + Neo4j
Cold  → SeaweedFS / NDJSON / MessagePack / historical artifacts
```

No change to existing infrastructure. Aligns with current `atlas_packets` architecture.
NDJSON payloads stay in cold store; Postgres holds packet registry + truth tables only.

#### Decision 2 — Memory: deeds/engram over Tiny-Engram ✅ AGREED, IMPLEMENT NEXT

Use `deeds/engram` MCP for temporal + validation + knowledge graph memory.
- Do NOT use `Tiny-Engram` PEFT (model modification, adapter memory, training complexity).
- Do NOT use `claude-mem-opencode` session memory (retired due to poor stability and session leaks).

Reason: workstation-scale Atlas needs persistent notes + blast-radius tracking + validation graph
without modifying Gemma at all. The MCP approach gives all three without touching model weights.

#### Decision 3 — Native GEMM bindings ⏳ DEFERRED

Native `torch::mm()` / pybind11 / custom CUDA extension is technically correct but the wrong
bottleneck to attack now. Current NDCG@10 = 0.711. The gap is not matrix multiply speed.

**Defer native GEMM until all of these are active:**
- BM25 lane contributing signal (BM25 text/content coverage >= 85%)
- Concept lane contributing signal (concept_ids/tag enrichment >= 60%)
- XGBoost formal reranker trained and evaluated

Revisit after the corrected stage order above has been verified and the formal reranker lane is active.

---

### Stage 1 — Retrieval Ingestion & Feature Backfill
- [x] BM25 activation (baseline active)
- [x] RRF tuning (weights adjusted, NDCG@10 avg = 0.711)
- [x] community provenance complete (community_source/confidence backfilled to 17,020 packets)
- [x] Qdrant payload sync (24,504 points updated with feature/community/concept ids)
- [x] benchmark after payload filters (average NDCG@10 = 0.711, gate PASS)
- [ ] BM25 text/content coverage (22.5% → target 85%+)
- [ ] concept_ids/tag enrichment (34.3% → target 60%+)
- [ ] community_confidence quality (high-conf 15% → target 50–65% practical)
- [ ] ranking signal coverage audit
- [ ] additive sidecar alignment for `task_semantic_packets` and `route_runtime_packets` (ADD_DRIZZLE_MIRROR gaps)

### Stage 2 — Memory & Reranker (Engram MCP & XGBoost)
- [ ] deeds/engram MCP integration
- [ ] XGBoost formal reranker (extract triples, train LambdaMART, wire to orchestrator)
- [ ] MARCO optional reranker
- [ ] reward score

### Stage 3 — Neo4j Contextual Trees & HyperRAG Packet RPC
- [x] Neo4j USED_CONCEPT projection (1,134 trace edges projected and verified)
- [ ] higher-hop enrichment
- [ ] supernode audit
- [ ] HyperRAG Packet RPC (combines Qdrant packets + Neo4j hierarchy explanation)
- [ ] Qdrant tag filters
- [ ] Redis hot cache replay trace

### Stage 4 — Autoencoder & SOM (Latent Topology)
- [ ] Autoencoder dimensionality reduction (768 -> 64)
- [ ] SOM 20x20 taxonomy mapping

### Stage 5 — Deferred
- [ ] native GEMM / pybind11 (custom torch::mm Custom extension)
- [ ] Tiny-Engram
- [ ] RL training loop
- [ ] Gemma4 planner QLoRA adapter
- [ ] GpJSON / RAPIDS / ClickHouse


---

## Critical Success Factors

### 1. Qdrant Payload Completeness
- **Requirement**: 100% of points must have `community_id`
- **Failure mode**: Silent gaps (0% known bad, >0% unknown)
- **Validation**: Gate 2 (must pass with 95%+ coverage)

### 2. Community Quality
- **Requirement**: 20-100 distinct communities (not 1, not 500+)
- **Failure mode**: Oversmoothed (all points in 1 community) or fragmented (1,000+ communities)
- **Validation**: Gate 3 entropy audit

### 3. Authority Score Reliability
- **Requirement**: GraphAuthorityScore must differentiate (not all 0.5)
- **Failure mode**: Silent low variance
- **Validation**: Check `STDDEV(graphAuthorityScore)` > 0.1

### 4. Packet Hydration Completeness
- **Requirement**: 100% of packet_ids resolve to nes_chrom_packets
- **Failure mode**: Silent NULL returns
- **Validation**: Random sample 100 packet_ids, verify all return payload

---

## Performance Targets

| Stage | Target | Acceptable | Notes |
|-------|--------|-----------|-------|
| Embed query | <500ms | <1000ms | Via /api/embed cached |
| Qdrant search | <50ms | <200ms | Dense vector (768-dim) |
| Community expansion | <30ms | <100ms | Neo4j local query |
| Graph expansion | <100ms | <500ms | GDS Dijkstra (5-hop) |
| Authority rerank | <20ms | <50ms | In-memory sort |
| Packet hydrate | <50ms | <200ms | Redis L1 + Postgres fallback |
| ACE assembly | <50ms | <100ms | Context structure build |
| Gemma4 synthesis | 20-60s | <90s | LLM latency |
| **Total E2E** | **22-61s** | **<92s** | 95th percentile |

---

## Operational Checkpoints

### Daily Checklist (Before Production)
- [ ] Qdrant `community_id` coverage > 95%
- [ ] Neo4j `graphAuthorityScore` populated for all CodebaseFile nodes
- [ ] Manifold4 quaternion populated for >80% of atlas_feature_map
- [ ] Redis `ace:authority:top` cache >90% hit rate
- [ ] Gemma4 synthesis latency <60s (95th percentile)

### Weekly Metrics
- [ ] Retrieval stage distribution (what % from Qdrant vs community vs graph?)
- [ ] Authority score variance (>0.1 STDDEV, expect 0.3-0.5)
- [ ] Cache hit rates (Redis L1, Bifrost L2)
- [ ] Community cluster sizes (avoid outliers >1000 or <10 nodes)

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Qdrant payloads incomplete | Gate 2 validation (95%+ coverage) |
| Communities degenerate | Gate 3 entropy audit (20-100 communities) |
| Authority scores low variance | Weekly metric review (STDDEV > 0.1) |
| Graph traversal slow | Benchmark Dijkstra before Phase 3D |
| Packet hydration silent failures | Sample validation (100 random packets) |
| Gemma4 synthesis latency spike | Cache control + timeout boundaries |

---

## Context Budget Allocation

**Effective context for synthesis** (assuming 128K token window):
- MCP tools: ~8K
- History (last 5 turns): ~10K
- System prompt: ~4K
- **ACE context**: ~20K (top-20 chunks @ 1K each)
- Query: ~2K
- **Free buffer**: ~84K

**Implication**: Can include full source code for all 20 retrieved chunks + dependency graph + community metadata. No need for compression beyond summarization.

---

## Success Criteria (Phase 3 Gate)

Before moving to Phase 4 (production optimization):
- [ ] All three validation gates PASS
- [ ] Retrieval trace shows <92s E2E latency (95th percentile)
- [ ] Cache hit rates >80% (Redis L1)
- [ ] Community expansion adds signal (authority score improves >0.15 vs Qdrant-only)
- [ ] Graph expansion adds signal (path-based neighbors improve relevance >0.1)
- [ ] Gemma4 synthesis cites correctly (verification sample: 100 queries)

---

## See Also

- `ATLAS-2.0-PHASE-2-COMPLETION.md` — Phase 2 validation gates
- `phase-2b-validation-gates.mjs` — Executable gate tests
- `phase-2c-redesigned.mjs` — Manifold4 quaternion implementation
