# CODEX / OpenCode KAG Pipeline Checklist

## Goal

Implement a stateful KAG retrieval + synthesis pipeline with:
- SSE streaming
- MCP tools
- Engram persistence
- TOON compression
- multi-hop retrieval
- reranking
- Bifrost synthesis

---

## Cache + Atlas Decision (Current)

Yes: if Atlas mapping JSON is already indexed, use cache-hit first strategy before re-indexing.

Execution order:
1. Redis exact cache (L1)
2. Bifrost semantic cache (L2)
3. Atlas/Qdrant/Graph retrieval
4. TOON packet build
5. Bifrost synthesis

Rules:
- Re-index Atlas only when source hash/version changed.
- Keep Bifrost as synthesis boundary (no direct llama calls).
- Keep semantic-cache keys stable per normalized query + model + route context.
- Treat TOON as compact transport payload; store envelope metadata in JSONB.

---

## Algorithm + GPU Stack (By Stage)

Use a hybrid GPU/CPU pipeline. Do not force one algorithm to solve all stages.

| Stage | Task | Algorithms | Primary Libraries |
|---|---|---|---|
| S1 | Structural graph path search | BFS, SSSP, k-shortest paths, Personalized PageRank, random walks, Leiden/Louvain | RAPIDS cuGraph |
| S2 | Semantic/vector neighborhood search | ANN KNN, IVF/HNSW/CAGRA, cosine/L2 batch scoring | cuVS or FAISS GPU + Qdrant/pgvector |
| S3 | SOM/topological expansion | BMU nearest cell, fixed-radius grid expansion, flood-fill, Gaussian smoothing | CuPy or PyTorch CUDA (custom CUDA later) |
| S4 | Manifold + cluster synthesis | UMAP-4D, PCA/SVD fallback, KMeans/HDBSCAN, community overlays | RAPIDS cuML + cuGraph |
| S5 | Reranking and synthesis | weighted blend + cross-encoder/XGBoost scorer | PyTorch CUDA or ONNX Runtime GPU |
| S6 | Persistence/materialization | JSONB cards + Redis hot cache + Qdrant payload metadata | Postgres + Redis + Qdrant |

Weighted path score:

```text
score(path) =
  0.35 * structuralConnectivity
+ 0.30 * semanticSimilarity
+ 0.15 * authority
+ 0.10 * recency
+ 0.10 * testCoverage
```

Bridge scoring (structural + semantic):

```text
score = alpha * graph_score + beta * vector_score + gamma * recency + delta * authority
```

BMU search kernel pattern:

```python
dist = ((som_weights - query[None, :]) ** 2).sum(axis=1)
bmu = dist.argmin()
neighbors = cells where grid_distance(cell, bmu) <= radius
```

---

## Pathway Materialization Contract

```ts
type GraphPathwayCard = {
  id: string;
  query: string;
  seedNodes: string[];
  pathNodes: string[];
  pathEdges: string[];
  semanticAnchors: string[];
  somCells: string[];
  manifold4d: [number, number, number, number];
  scores: {
    structural: number;
    semantic: number;
    topology: number;
    authority: number;
    rerank: number;
  };
  narrative: string;
  sourceRefs: string[];
};
```

Persistence targets:
- Postgres JSONB table: `graph_pathway_cards`
- Redis key: `graph:pathway:{id}`
- Qdrant payload fields: `pathwayId`, `labels`, `centroidId`, `manifold4d`

---

## Implementation Order (P0-P3)

P0 (safe prototype):
1. Export hot subgraph from Neo4j/Postgres to JSONL.
2. Run BFS/SSSP/PageRank in cuGraph (fallback to CPU graph lib if GPU unavailable).
3. Join path candidates with Qdrant/pgvector semantic scores.
4. Write `graph_pathway_cards` JSONB records.

P1 (SOM/topology):
5. Store SOM weights as tensors.
6. Implement BMU search in CuPy/PyTorch CUDA.
7. Expand neighborhood radius and merge with graph neighbors.
8. Join expanded cells to feature labels.

P2 (manifold + clusters):
9. Run cuML UMAP to 4D (fallback PCA/SVD to 4D).
10. Run KMeans/HDBSCAN clusters.
11. Materialize ClusterCard/PathwayCard/BridgeCard outputs.

P3 (speed):
12. Add FAISS GPU or cuVS ANN acceleration for local anchor search.
13. Add query/result batching and CUDA streams.
14. Add Redis cache for `query->BMU` and `query->pathway`.

Runtime deployment recommendation:
- Python sidecar first (HTTP/MCP).
- gRPC split later after sidecar API stabilizes.

---

## PHASE 0 - HEALTH

- [x] llama-server /health = 200
- [x] llama-server /props n_ctx = 65536
- [x] TRACE /health = 200
- [x] MCP POST initialize = 200
- [x] Redis ping = PONG
- [x] Qdrant reachable
- [x] Bifrost /v1/models reachable
- [x] rg installed
- [x] ast-grep optional (if missing, gate marks informational pass)

---

## PHASE 1 - MEMORY

- [x] engram.redis_health tool exists
- [x] engram.ace_packet_inject implementation present
- [x] engram.chat_memory_store implementation present
- [x] TTL verified in contract tests
- [x] JSON schema verified
- [x] OpenCode sidecars smoke (`smoke:mcp:opencode-sidecars`) passes

---

## PHASE 2 - SSE

- [x] create /api/chat/stream
- [x] stream status events
- [x] stream token events
- [x] stream done/error events

---

## PHASE 3 - MCP

- [x] initialize()
- [x] tools/list()
- [x] tools/call()
- [ ] create mcp/client.ts (explicit lightweight client wrapper for app-only usage)

---

## PHASE 4 - FEATURE LABELS

- [x] rg lexical pass
- [ ] ast-grep structural pass
- [x] graphify integration
- [x] atlas integration
- [x] normalized labels

---

## PHASE 5 - MULTI-HOP

- [x] subgraph expansion
- [x] hop caps
- [x] node caps
- [ ] cycle detection hard gate

---

## PHASE 6 - RERANKER

- [ ] install CrossEncoder
- [x] rerank candidates
- [x] top-N selection
- [x] suffix-only injection

---

## PHASE 7 - TOON

- [x] build TOON packet
- [x] compress labels
- [x] compress memory
- [x] compress reranked results

---

## PHASE 8 - BIFROST

- [ ] create bifrost/client.ts (shared wrapper)
- [x] stream completion
- [x] preserve KV prefix
- [x] no direct llama calls

---

## PHASE 9 - FINAL PIPELINE

```text
User
 ↓
SSE
 ↓
MCP retrieval
 ↓
Feature labels
 ↓
Multi-hop
 ↓
Rerank
 ↓
TOON
 ↓
Bifrost
 ↓
Gemma4
 ↓
SSE stream
 ↓
Engram persistence
```

---

## Validation Commands (Fast Path)

From workspace root:

```powershell
npm --prefix C:/Users/james/Videos/deeds-web-app/sveltekit-frontend run audit:bifrost-boundary
npm --prefix C:/Users/james/Videos/deeds-web-app/sveltekit-frontend run smoke:rg-atlas
npm --prefix C:/Users/james/Videos/deeds-web-app/sveltekit-frontend run atlas:cache-cards
npm --prefix C:/Users/james/Videos/deeds-web-app/sveltekit-frontend run warmup:bifrost:clusters
npm --prefix C:/Users/james/Videos/deeds-web-app/sveltekit-frontend run bifrost:cards:smoke:strict:warm:gate:prep
npm --prefix C:/Users/james/Videos/deeds-web-app/sveltekit-frontend run prompt:cache:verify
npm --prefix C:/Users/james/Videos/deeds-web-app/sveltekit-frontend run redis:ace:keys
npm --prefix C:/Users/james/Videos/deeds-web-app/sveltekit-frontend run graph:turbovec:refresh
```

Cache verification:

```powershell
curl http://127.0.0.1:3040/health
curl http://127.0.0.1:3040/v1/models
bash ./test-redis-bifrost-cache.sh
```

---

## Notes

- Bifrost documentation references are consolidated in:
  - sveltekit-frontend/docs/architecture/bifrost-official-reference.md
  - sveltekit-frontend/docs/architecture/bifrost-firecrawl-programming-reference.md
- Atlas mapping artifacts available in:
  - sveltekit-frontend/docs/atlas-index/codebase-atlas.json
  - sveltekit-frontend/memory/atlas/codebase-atlas.min.json
- TOON card artifacts available in:
  - sveltekit-frontend/memory/cards/selected-cards.toon
  - sveltekit-frontend/memory/index/ace-prefix.toon
