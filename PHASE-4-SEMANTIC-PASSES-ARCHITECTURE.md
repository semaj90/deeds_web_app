# Phase 4: Semantic Passes Reranker — Complete Architecture

**Date**: July 10, 2026  
**Status**: ARCHITECTURE READY (Implementation 4-6 weeks)  
**GPU Target**: RTX 3060 Ti (8GB VRAM)

---

## Executive Summary

Phase 4 implements a 7-stage semantic passes pipeline with GPU acceleration at each stage:

```
Input Query (text)
    ↓
[1] Embedding (embeddinggemma 768-dim)
    ↓
[2] Qdrant Dense Search (ANN top-100)
    ↓
[3] cuVS Prefilter (768→64 via autoencoder, GPU top-20)
    ↓
[4] Kmeans Clustering (k-means on 64-dim, GPU GPU fanout=0)
    ↓
[5] Topology 4D Expansion (Neo4j multi-hop via NetworkX)
    ↓
[6] Domain Classifier (LSTM classifier on embeddings)
    ↓
[7] Semantic Reranker (GPU cosine similarity blend)
    ↓
RPC Packet Delivery (cached via Valkey + A2A lanes)
    ↓
ACE Context Assembly (state-driven, token-budgeted)
    ↓
Gemma4 Reasoning (with evidence chain)
```

---

## Component Details

### [1] Embedding Layer
**Tool**: Ollama `embeddinggemma:latest` (384-dim canonical for this project, 768-dim native)

**Canonical Setting** (FIXED):
```
PROJECT_CANONICAL_EMBED_DIM = 384
EMBED_MODEL = embeddinggemma:latest
Full native = 768-dim (truncated to 384 for index efficiency)
```

**Status**: ✅ Live via `/api/embed` endpoint  
**Caching**: Redis L1 (5ms), Bifrost L2 (2-5s)  
**Fallback**: Direct Ollama if cache misses

---

### [2] Qdrant Dense Search (ANN)
**Collection**: `codebase_chunks_768` (768-dim HNSW index)  
**Query**: Vector ANN top-100 candidates

**Qdrant Payload Enrichment**:
```json
{
  "chunk_id": "text",
  "source_ref": "text",
  "feature_id": "uuid",
  "som_cluster": "int",        // ← filled by Stage 4
  "domain_class": "text",      // ← filled by Stage 6
  "authority_score": "float",  // ← from PageRank (Stage 5)
  "content_hash": "text"
}
```

**Status**: ✅ Live  
**Candidates**: 100 per query  
**Latency**: ~50-100ms

---

### [3] Autoencoder (768→64) + cuVS Prefilter
**Model**: Trained VAE on 768-dim embeddings → 64-dim latent space  
**GPU Library**: cuVS (NVIDIA vector search)

**Why Autoencoder?**
- Dimensionality reduction preserves semantic structure
- 64-dim fits in GPU memory for large candidate sets
- Fast prefilter before expensive reranking

**Autoencoder Training** (Phase 3 completed):
- Loss: MSE on reconstruction
- Validation: Spearman correlation >0.90 (ranking preservation)
- Weights: Stored in Postgres `latent_64_weights`

**cuVS Top-20**:
- Takes 100 Qdrant candidates
- Encodes each to 64-dim via autoencoder
- Runs GPU ANN on 64-dim vectors
- Returns top-20 to next stage

**Status**: ✅ Model trained (Phase 3)  
**Pending**: cuVS GPU integration  
**Latency**: ~10ms (GPU)

---

### [4] Kmeans Clustering (k=20, fanout=0)
**Algorithm**: GPU-accelerated k-means on 64-dim vectors

**Why fanout=0?**
- Each query gets ONE kmeans cluster assignment
- No hierarchy, no ball-tree branching
- Direct centroid distance for cluster membership
- Prevents combinatorial explosion in multi-hop traversal

**Implementation**:
```typescript
// GPU kmeans on 64-dim candidates
const assignments = await gpuKmeans({
  vectors: candidates_64dim,  // shape: [20, 64]
  k: 20,
  maxIters: 10,
  fanout: 0  // CRITICAL: no branching
});

// Output: cluster index for each candidate
// candidates[i] → cluster[i]  (0-19)
```

**Centroid Tracking**:
- Store centroids in SOM-like grid (e.g., 4×5 grid = 20 clusters)
- Update centroids after each run via batch operation
- Use for multi-hop expansion (Stage 5)

**Status**: ✅ Available in pytorch-graph N-API binding  
**Pending**: Integration with 64-dim autoencoded vectors  
**Latency**: ~5ms (GPU)

---

### [5] Topology 4D Expansion (NetworkX Multi-Hop)
**Graph**: Neo4j topology with typed edges

**Edge Types**:
```
IMPORTS           → caller/callee relationships
BELONGS_TO_CLUSTER → file organizational structure
SIMILAR_TOPOLOGY  → SOM-based similarity (from Stage 4)
SHARES_TAGS       → keyword overlap
USES_CONCEPT      → semantic concept relationships
```

**4D Coordinates** (for ranking):
```typescript
interface Coordinate4D {
  x: number;        // Kmeans cluster X (0-19)
  y: number;        // Kmeans cluster Y (grid position)
  z: number;        // Neo4j PageRank percentile (0-1)
  w: number;        // Authority score (0-1)
}
```

**Multi-Hop Traversal** (NetworkX):
```python
# Start from 20 kmeans clusters (Stage 4 output)
start_nodes = [clusters[i].centroid_node for i in range(20)]

# Bounded k-hop expansion (k ≤ 2, fanout = 0)
neighbors = nx.multi_source_dijkstra_path_length(
  G=neo4j_graph,
  sources=start_nodes,
  cutoff=2  # max 2 hops
)

# Return neighbor nodes ranked by distance + authority
```

**Why 4D?**
- X, Y: Cluster position (spatial locality)
- Z: Graph centrality (PageRank)
- W: Domain authority (learned from outcomes)
- Enables Euclidean distance-based re-ranking

**Status**: ✅ Neo4j graph live  
**Pending**: NetworkX Python sidecar + 4D coordinate indexing  
**Latency**: ~50-200ms (IO-bound, cached via Neo4j)

---

### [6] Domain Classifier (LSTM)
**Model**: Lightweight LSTM on 768-dim embeddings

**Classification Labels**:
```
auth, db, caching, api, ui, utils, testing, docs, config, infrastructure, ...
```

**Output**: Domain probability distribution
```typescript
interface DomainClassification {
  domain: string;
  confidence: 0-1;
  top_3_domains: [{ name: string; prob: number }];
}
```

**Why?**
- Context-aware reranking: prioritize results in the query's domain
- Reduces hallucination: Gemma4 stays within semantic boundaries
- Cross-domain retrieval when explicit (e.g., "auth uses utils")

**Status**: 🟡 LSTM model needs training (Phase 4)  
**Data**: Labels from Neo4j `DOMAIN_CLASS` nodes  
**Latency**: ~2ms (CPU inference on 768-dim)

---

### [7] Semantic Reranker (GPU Cosine Similarity Blend)
**Algorithm**: Weighted blend of 7 signals

**Signals**:
```
0.30 · qdrant_cosine       (ANN similarity score)
0.20 · autoencoder_cosine  (64-dim reconstruction fidelity)
0.15 · domain_match        (query domain ∩ result domain)
0.12 · pagerank_percentile (Neo4j centrality)
0.10 · som_cluster_distance (4D Euclidean to nearest centroid)
0.08 · authority_score     (learned from prior feedback)
0.05 · recency             (newer packets boost slight)
```

**GPU Implementation**:
```typescript
// Compute all 7 scores on GPU in parallel
const scores = await computeRerankerScores({
  queryVec: query_768dim,
  candidates: [
    { vec_768: c.embedding, id: c.id, domain: c.domain, pr: c.pagerank, ... }
  ],
  weights: [0.30, 0.20, 0.15, 0.12, 0.10, 0.08, 0.05],
  device: 'gpu'  // cuBLAS GEMM on RTX 3060 Ti
});

// Sort by blend score
const reranked = scores.sort((a, b) => b.score - a.score);
```

**Status**: ✅ Blend formula proven (Phase 2)  
**Pending**: GPU kernel implementation  
**Latency**: ~5ms (GPU for 100 candidates)

---

## Data Flow Summary

| Stage | Input | GPU Op? | Output | Latency | Output Count |
|-------|-------|---------|--------|---------|--------------|
| 1 | Query text | CPU | 768-dim vec | 100ms | 1 |
| 2 | 768-dim vec | No (Qdrant) | Candidates | 50ms | 100 |
| 3 | 100 vecs | Yes (cuVS) | 64-dim top-20 | 10ms | 20 |
| 4 | 20 vecs (64d) | Yes (GPU k-means) | Cluster IDs | 5ms | 20 clusters |
| 5 | 20 clusters | No (Neo4j) | Neighbors + 4D | 100ms | 50-100 |
| 6 | 768-dim vecs | CPU (LSTM) | Domain class | 2ms | 100 |
| 7 | Candidates | Yes (GPU cosine) | Ranked top-10 | 5ms | 10 |
| **Total** | | | | ~272ms | 10 reranked |

---

## Indexing Strategy

### Postgres Storage (Canonical)
```sql
CREATE TABLE codebase_chunk_index (
  id UUID PRIMARY KEY,
  chunk_id TEXT,
  content TEXT,
  content_embedding vector(384),        -- ✅ canonical embedding
  latent_64_encoded BYTEA,               -- autoencoder output (compressed)
  som_cluster_id INT,                    -- ✅ k-means cluster assignment
  domain_class TEXT,                     -- auth, db, etc.
  pagerank_score FLOAT,                  -- Neo4j PageRank
  authority_score FLOAT,                 -- learned blend weight
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  
  INDEX idx_som_cluster (som_cluster_id),
  INDEX idx_domain_class (domain_class),
  INDEX idx_pagerank (pagerank_score DESC),
  INDEX idx_content_embedding_ivfflat (content_embedding ivfflat)
);
```

### Qdrant Payload (Mirror)
```json
{
  "chunk_id": "text",
  "source_ref": "text",
  "feature_id": "uuid",
  "som_cluster": 5,           // ← from Stage 4
  "domain_class": "auth",     // ← from Stage 6
  "pagerank": 0.75,           // ← from Neo4j
  "authority": 0.82           // ← from learning
}
```

### Neo4j Graph (Topology)
```cypher
// Nodes
(:CodeChunk {id, chunk_id, som_cluster, domain_class})

// Edges
-[:BELONGS_TO_CLUSTER {distance: 4d_euclidean}]->(:Cluster {id, centroid})
-[:SIMILAR_TOPOLOGY {similarity: 0.85}]->(:CodeChunk)
-[:USES_CONCEPT]->(:Concept)
-[:IMPORTS {hierarchy: "caller"}]->(:Symbol)
```

### Redis/Valkey Cache (Hot Path)
```
packet:{packetId}                → full packet JSON (5 min TTL)
reranked:{queryHash}             → top-10 reranked (30 min TTL)
som:cluster:{id}:members         → cluster members (1 hour TTL)
pagerank:scores                  → full PageRank map (6 hour TTL)
domain:classifier:weights        → LSTM weights (24 hour TTL)
```

---

## GPU Memory Budget (RTX 3060 Ti, 8GB)

```
Occupied (constant):
  Model weights (Gemma4 IQ4): ~5.5 GB
  Autotune/warmup buffers:    ~0.5 GB
  
Available for computation: ~1.8 GB

Per-query allocation:
  Query embedding (768-dim):           1 MB
  Qdrant candidates (100×768-dim):    300 MB
  Autoencoded batch (100×64-dim):      25 MB
  Kmeans centroids (20×64-dim):         5 MB
  Reranker intermediate:               50 MB
  Output (top-10):                      1 MB
  ──────────────────────────────────────
  Total per query:                    ~380 MB
  
Concurrent queries: 4 (380 × 4 = 1.52 GB < 1.8 GB available)
```

**Safety Rule**: Queue queries when GPU mem >1.6GB used

---

## Fanout=0 Critical Rule

**Why fanout must be 0 for k-means in this pipeline?**

```
Fanout=1 (standard k-means tree):
  20 clusters
  × 5 branches per cluster (typical)
  × 2 hops (traversal depth)
  = 20 × 5² = 500 candidates explored

Fanout=0 (direct assignment):
  20 clusters
  × 1 branch per cluster (centroid distance only)
  × 2 hops (traversal depth)
  = 20 + 50 neighbors = ~70 candidates explored
```

**Performance impact**:
- Fanout=1: 500 → Qdrant + reranker → GPU OOM risk
- Fanout=0: 70 → cuVS → reranker → predictable ~380MB

**Code enforcement**:
```typescript
if (kmeans.fanout !== 0) {
  throw new Error('CRITICAL: Kmeans fanout must be 0 to prevent explosion');
}
```

---

## A2A Lanes Integration

**Lanes** (from Phase 3):
- `cluster_context`: Results grouped by k-means cluster
- `shared_resource`: Cross-cluster relationships
- `agents_context`: HMM state routing
- `vault_link`: Persistent knowledge packets

**Packet Delivery**:
```typescript
// After Stage 7 reranking
const reranked = await semanticReranker(...);

// Organize by A2A lanes
const lanes = {
  cluster_context: reranked.filter(r => r.som_cluster === queryCluster),
  shared_resource: reranked.filter(r => r.cross_cluster_link),
  agents_context: reranked.filter(r => matches_hmm_state(r)),
  vault_link: reranked.filter(r => r.persistent)
};

// Cache each lane in Valkey
for (const [lane, packets] of Object.entries(lanes)) {
  const key = `a2a:${lane}:${queryHash}`;
  await valkey.setex(key, 1800, JSON.stringify(packets));
}
```

---

## HyperRAG Dense Search for RPC

**Dense Search** (semantic similarity):
- Query embedding → Qdrant ANN → top-K candidates
- Stage 1-7 passes applied
- Returns JSON-RPC packet bundle

**RPC Contract**:
```json
{
  "jsonrpc": "2.0",
  "method": "retrieval.semantic_passes",
  "params": {
    "query": "authenticate user sessions",
    "topK": 10,
    "domain": "auth",
    "tokenBudget": 2048
  },
  "id": "req-123"
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "packets": [
      {
        "packetId": "auth:001",
        "content": "...",
        "scores": {
          "qdrant_cosine": 0.91,
          "blend_total": 0.87,
          "domain_match": 0.95,
          "authority": 0.82
        },
        "stage_trace": ["embedding", "qdrant", "cuVS", "kmeans", "topology", "domain", "reranker"],
        "lane": "cluster_context",
        "cached": false
      },
      ...
    ],
    "totalMs": 272,
    "gpu_utilization": 0.65
  },
  "id": "req-123"
}
```

---

## Contextual Trees for PageRank

**Multi-Source PageRank**:
- Start from 20 k-means cluster centroids
- Compute PageRank on bounded subgraph (k≤2 hops)
- Return top-20 by PageRank within subgraph

**Hierarchy**:
```
Root (query cluster centroids)
├─ Tier 1 (direct imports/callers, 1 hop)
├─ Tier 2 (transitive dependencies, 2 hops)
└─ Score: α·T1 + β·T2 (PageRank blend)
```

**Implementation**:
```python
# NetworkX on Neo4j subgraph
start_nodes = [cluster.centroid_node for cluster in kmeans.clusters]
subgraph = nx.ego_graph(neo4j, start_nodes, radius=2)
pagerank = nx.pagerank(subgraph, sources=start_nodes)
top_20 = sorted(pagerank.items(), key=lambda x: x[1], reverse=True)[:20]
```

**Caching**:
- Store PageRank scores in Postgres + Redis
- Refresh on Neo4j topology changes (daily batch)
- Fallback: Compute on-demand if cache stale >6h

---

## Metadata Encoded to SOM Column

**SOM (Self-Organizing Map) Assignment**:
- K-means cluster ID → SOM grid position (e.g., 4×5 grid)
- Stored in `som_cluster_id` column
- Indexed for fast neighborhood queries

**Encoding**:
```typescript
// After k-means clustering
const somGridRows = 4, somGridCols = 5;
const flatClusterId = kmeans.cluster_id;  // 0-19

// Decode to 2D grid position
const [gridX, gridY] = [
  flatClusterId % somGridCols,
  Math.floor(flatClusterId / somGridCols)
];

// Store as single INT for indexing efficiency
const somEncodedId = flatClusterId;
await db.query(
  'UPDATE codebase_chunk_index SET som_cluster_id = $1 WHERE id = $2',
  [somEncodedId, chunkId]
);
```

**Query by SOM Neighborhood**:
```sql
-- Find neighbors within ±1 grid cell
WITH chunk_som AS (
  SELECT som_cluster_id FROM codebase_chunk_index WHERE id = $1
)
SELECT id, chunk_id, som_cluster_id
FROM codebase_chunk_index
WHERE som_cluster_id IN (
  -- 8 neighbors + self
  SELECT DISTINCT som_cluster_id
  FROM codebase_chunk_index
  WHERE ABS((som_cluster_id % 5) - ((SELECT som_cluster_id FROM chunk_som) % 5)) <= 1
    AND ABS((som_cluster_id / 5) - ((SELECT som_cluster_id FROM chunk_som) / 5)) <= 1
);
```

---

## ACP Context Assembly (Token-Budgeted)

**After Semantic Passes** (Stage 7 complete):
- Top-10 reranked packets ready
- A2A lanes populated in Valkey
- Domain classification complete

**ACE Context Builder** (from Phase 3.2):
```typescript
const context = await assembleAgentContext({
  featureId,
  runId,
  workflowState: 'retrieve',
  hmState: hmm.state,
  tokenBudget: 2048,
  packets: rerankedTop10
});

// Context loader picks packets by state
// RETRIEVE state → full source + routing packets
// PLAN state → spec + patterns only
// IMPLEMENT state → exact files + symbols
```

**Token Budget Enforcement**:
```typescript
let tokensUsed = 0;
for (const packet of context.packets) {
  if (tokensUsed + packet.estimatedTokens > tokenBudget) {
    context.packets = context.packets.slice(0, i);
    break;
  }
  tokensUsed += packet.estimatedTokens;
}
```

---

## Implementation Roadmap

### Phase 4A (Week 1-2): Autoencoder + cuVS
- [ ] Train and validate 768→64 autoencoder (Phase 3 done, just integrate)
- [ ] Wire cuVS top-20 prefilter
- [ ] Test cuVS latency on RTX 3060 Ti
- [ ] Benchmark: 100 candidates → top-20 in <10ms

### Phase 4B (Week 2-3): Kmeans + SOM Column
- [ ] GPU k-means on 64-dim vectors (fanout=0)
- [ ] Backfill `som_cluster_id` for all 40K chunks
- [ ] Create SOM neighborhood index
- [ ] Test cluster stability (run 5× verify consistency)

### Phase 4C (Week 3-4): Topology 4D + NetworkX
- [ ] Build NetworkX Python sidecar
- [ ] Map Neo4j subgraph to 4D coordinates
- [ ] Implement 2-hop traversal from k-means centroids
- [ ] Cache PageRank scores in Postgres + Redis

### Phase 4D (Week 4-5): Domain Classifier + Reranker
- [ ] Train LSTM domain classifier (20 domain labels)
- [ ] Implement Stage 6 inference (LSTM on 768-dim)
- [ ] Wire Stage 7 GPU cosine similarity blend
- [ ] Test blended score against ground truth

### Phase 4E (Week 5-6): A2A Lanes + RPC
- [ ] Organize packets into A2A lanes post-Stage 7
- [ ] Cache lanes in Valkey per lane type
- [ ] Implement JSON-RPC retrieval endpoint
- [ ] End-to-end test: query → 7 stages → RPC response

---

## Monitoring & Observability

**Metrics to track**:
```
stage_latency_{stage}           ms per stage
gpu_utilization                 % GPU busy
gpu_memory_peak                 MB per query
reranker_signal_distribution    histogram of 7 signals
som_cluster_balance             items per cluster
pagerank_freshness              minutes since update
domain_classifier_accuracy      % correct classification
packet_cache_hitrate            % Valkey hits
a2a_lane_distribution           % per lane
```

**OpenTelemetry Spans**:
```
semantic_passes
├─ embedding [100ms]
├─ qdrant_search [50ms]
├─ autoencoder_cuVS [10ms]
├─ kmeans_cluster [5ms]
├─ topology_4d [100ms]
├─ domain_classifier [2ms]
├─ reranker_blend [5ms]
└─ rpc_delivery [20ms]
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| GPU OOM on large fanout | Query fails | **fanout=0 + GPU mem budget** |
| Autoencoder rank loss | Reranking degrades | **Validate Spearman >0.90 before deploy** |
| Stale PageRank | Wrong authority | **Daily refresh + 6h cache TTL** |
| Domain classifier overfitting | Hallucination | **Cross-validation on held-out domains** |
| RPC timeout on topology hop | Stalled retrieval | **Timeout 500ms + cache fallback** |
| SOM cluster imbalance | Hot spots | **Monitor distribution, rebalance weekly** |

---

## Success Criteria

- ✅ End-to-end semantic passes <300ms (from query text to top-10 reranked)
- ✅ GPU utilization 60-75% on 4 concurrent queries
- ✅ Zero OOM events under normal load
- ✅ Reranked top-10 NDCG >0.85 vs ground truth
- ✅ Domain classifier accuracy >88%
- ✅ A2A lane cache hit rate >70%
- ✅ Fanout=0 constraint enforced in tests
- ✅ Full trace linkage (OpenTelemetry → Postgres)

---

## Files to Create/Modify

| File | Purpose | Status |
|------|---------|--------|
| `semantic-passes-orchestrator.ts` | Stage 1-7 pipeline | 🟡 Design ready |
| `autoencoder-cuVS-bridge.ts` | Stage 3 integration | 🟡 Waiting on cuVS SDK |
| `kmeans-fanout-enforcer.ts` | Stage 4 + fanout=0 | 🟡 N-API binding ready |
| `topology-4d-encoder.ts` | Stage 5 coordinates | 🟡 Neo4j queries ready |
| `domain-classifier.ts` | Stage 6 LSTM | 🟡 Model training ready |
| `reranker-blend.ts` | Stage 7 GPU cosine | ✅ Formula proven |
| `a2a-lane-organizer.ts` | Lane bucketing | 🟡 Schema ready |
| `retrieval-rpc-server.ts` | JSON-RPC endpoint | 🟡 API contract ready |
| `codebase_chunk_index` schema | SOM + domain columns | 🟡 Migration ready |
| `semantic-passes.spec.ts` | E2E integration tests | 🟡 Test framework ready |

---

**Next**: Wire GPU components and run Phase 4A integration tests.
