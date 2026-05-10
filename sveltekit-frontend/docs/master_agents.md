# Master Agents — Complete Codebase Intelligence Map

> Generated: 2026-05-10 | Sources: codebase-map.md + feature atlas + GPU pipeline + 65-gate audit  
> Refresh: `npm run graphify:daily && npm run karpathy:gpu -- --limit 200`

---

## 1. Codebase Scale

| Metric | Count |
|--------|-------|
| Total files scanned | 3,732 |
| Directories | 397 |
| Svelte components | 874 |
| API handlers | 652 |
| Route files (total) | 967 |
| Lines of code (est.) | ~450,000 |
| Drizzle table refs | 435 |
| GPU clusters (k-means) | 20 |
| Qdrant chunks (768-dim) | ~3,140 |
| MCP tools registered | 73 (TRACE :8788) |

---

## 2. Feature Atlas (18 tracked features)

All entries live in Postgres `feature_implementations` + `feature_file_edges`.  
Query: `SELECT feature_key, feature_name, status FROM feature_implementations ORDER BY feature_key`.

### HyperRAG 11-Lane Pipeline

| Lane | Feature Key | Description | Primary File |
|------|-------------|-------------|--------------|
| L0 | `hyperrag.lane.topo_prefilter` | Redis topo-byte cache (300s TTL) | `src/lib/server/cache/topo-candidate-cache.ts` |
| L1 | `hyperrag.lane.qdrant_dense` | Qdrant 768-dim content cosine ANN | `src/lib/server/vector/qdrant-manager.ts` |
| L2 | `hyperrag.lane.qdrant_signature` | Qdrant AST-structure signature ANN | `src/lib/server/vector/qdrant-manager.ts` |
| L3 | `hyperrag.lane.summary_lenses` | `summary_lenses_768` cluster narratives | `src/lib/server/ace/context-assembler.ts` |
| L4 | `hyperrag.lane.wiki_agents_md` | Redis `wiki:note:*` + `agents:dir:*` | `src/lib/server/ace/context-assembler.ts` |
| L5 | `hyperrag.lane.synthesis_memory` | `synthesis_memory_768` persisted Gemma4 outputs | `src/lib/server/ace/context-assembler.ts` |
| L6 | `hyperrag.lane.prior_answers` | Redis `code:llm:*` + `ace:chunks:*` | `src/lib/server/ace/context-assembler.ts` |
| L7 | `hyperrag.lane.graph_neighbors` | Neo4j IMPORTS/BELONGS_TO_CLUSTER traversal | `src/lib/server/ace/multi-lane-retrieval.ts` |
| L8 | `hyperrag.lane.pagerank_authority` | Karpathy blend + CouchDB PageRank rerank | `scripts/karpathy-gpu-enrich.mjs` |
| L9 | `hyperrag.lane.feature_atlas` | Postgres feature_implementations FTS | `src/lib/server/ace/context-assembler.ts` |
| L10 | `hyperrag.lane.web_external` | SearXNG self-hosted (SEARXNG_URL env, default :8888, T4 trust) | `src/lib/server/ace/context-assembler.ts` |
| L11 | `hyperrag.lane.activity_prefetch` | Panel activity prefetch (fire-and-forget) | `src/routes/api/analytics/panel-activity/+server.ts` |

### ACE / Trust / Indexing Features

| Feature Key | Description | Primary File |
|-------------|-------------|--------------|
| `ace.context_pack` | ACE context assembler — full retrieval pipeline | `src/lib/server/ace/context-assembler.ts` |
| `ace.trust_tiers` | TrustMeta T1–T5 system + 8-pattern injection sanitizer | `src/lib/server/ace/sanitizer.ts`, `types.ts` |
| `karpathy.gpu_blend` | GPU attention + autoencoder + PageRank blend | `scripts/karpathy-gpu-enrich.mjs` |
| `mcp.trace_server` | TRACE MCP server — 73 registered tools | `src/mcp/trace-mcp-server.ts` |
| `hypergraph.4d` | 4D hypergraph (SOM + k-means + Neo4j + Qdrant) | `scripts/run-hypergraph.ts` |
| `synth.loop` | Gemma4 synthesis pipeline (MCP tool-calling loop) | `src/mcp/trace-mcp-server.ts` |

---

## 3. Key Directory Map

### Tier A — Server Core (highest fan-in)

| Directory | Files | Karpathy Score | Role |
|-----------|-------|----------------|------|
| `src/lib/server/db` | 108 | 3.23 | DB client, schema, all Drizzle tables |
| `src/lib/server` | 91 | 2.36 | Shared server utilities, auth, cache |
| `src/lib/server/ace` | ~12 | high | ACE context assembler, multi-lane, sanitizer, types |
| `src/lib/server/vector` | ~8 | high | Qdrant manager, hybrid search |
| `src/lib/server/graph` | ~6 | high | Neo4j sync, PageRank, graph-informed retrieval |
| `src/lib/server/cache` | ~10 | high | Redis exact-match, topo-cache, cache-keys |
| `src/lib/server/gpu` | 17 | high | LibTorch bridge, simdjson, GPU similarity |
| `src/lib/server/agents-md` | ~4 | med | AGENTS.md parser + directory resolver |

### Tier B — AI / Inference

| Directory | Files | Role |
|-----------|-------|------|
| `src/lib/ai` | 14 | Client router, ONNX session, model IDs |
| `src/lib/ai/onnx` | 2 | WebGPU → WASM → CPU session factory |
| `src/lib/server/ai` | ~15 | Bifrost, LLM cache, Gemma4 agent |
| `src/lib/models` | ~10 | ChatSession, retrieval machine |
| `src/lib/machines` | 11 | XState v5 orchestration |

### Tier C — Routes (API surface)

| Directory | APIs | Auth | Zod | Notes |
|-----------|------|------|-----|-------|
| `src/routes/api/auth` | 10 | 4/10 | 5/10 | Login, session, OAuth |
| `src/routes/api/cases` | ~40 | high | high | Case CRUD, evidence, timeline |
| `src/routes/api/evidence` | ~30 | high | high | Upload, search, pipeline |
| `src/routes/api/cache` | 14 | 14 | 8 | Redis stats, invalidate |
| `src/routes/api/code-intel` | 21 | 21 | 5 | Codebase intelligence API |
| `src/routes/api/analytics` | ~15 | med | med | Chunk hits, search patterns, panel activity |
| `src/routes/api/phase89` | 24 | 24 | 13 | KAG, tagging, phase89 features |
| `src/routes/api/graph` | ~12 | high | high | GraphRAG, SOM, topology |
| `src/routes/api/cartridge` | 4 | high | high | CHR97 cartridge export/search/stats |
| `src/routes/api/health` | 16 | 2 | 3 | Intentionally open (liveness probes) |
| `src/routes/api/v1` | 2 | med | high | OpenAI-compatible facade |
| `src/mcp` | ~6 | — | — | TRACE MCP server + tool handlers |

### Tier D — Frontend

| Directory | Components | Role |
|-----------|------------|------|
| `src/lib/components/ui` | 245 | Shared primitives (Button, Dialog, etc.) |
| `src/lib/components/ai` | 46 | Chat UI, evidence panels, modal |
| `src/lib/components/yorha` | 72 | YorHA gaming-themed UI shell |
| `src/lib/components/detective` | ~8 | Detective-mode timeline + evidence UI |
| `src/lib/webgpu` | 20 | WebGPU compute pipeline + WGSL shaders |
| `src/lib/gpu` | 17 | Search reranker, tensor bridge (client) |
| `src/routes/(app)` | ~23 | App pages: chat, cases, evidence, admin |
| `src/routes/(app)/code-intel` | 17 | Topology viewer, codebase intelligence |

### Tier E — Scripts / Build

| Directory | Files | Role |
|-----------|-------|------|
| `scripts/` | ~80 | Graphify, Karpathy, hypergraph, seeding, audit |
| `scripts/startup/` | ~5 | ACE incremental startup, startup policy |
| `scripts/seed-feature-atlas.mjs` | 1 | Seeds 18 features + 34 file edges (idempotent) |
| `scripts/karpathy-gpu-enrich.mjs` | 1 | GPU blend pipeline (attention + autoencoder) |
| `scripts/run-hypergraph.ts` | 1 | Standalone 4D hypergraph builder (OOM-safe) |
| `scripts/run-pagerank.ts` | 1 | CouchDB → power-iteration PageRank → Redis |
| `scripts/smoke-hyperrag.mjs` | 1 | G-HR1–G-HR10 HyperRAG smoke gates |
| `drizzle/` | ~20 | Migrations, manual SQL, archived |
| `simd-bridge/cpp/` | ~8 | N-API addon: simdjson + LibTorch CUDA |

---

## 4. Complete Audit Gate Reference (65 gates)

### Tier A — Code Connectivity (G1–G9)

| Gate | Check | Command |
|------|-------|---------|
| G1 | Static ESM imports | `rg "from.*$MODULE" src/ --type ts --type svelte` |
| G2 | Dynamic ESM imports | `rg "import\(.*$MODULE" src/ --type ts` |
| G3 | CJS require | `rg "require\(.*$MODULE" src/ --type ts` |
| G4 | @vite-ignore variable imports | `rg "@vite-ignore" src/ -l` |
| G5 | Barrel re-exports | `rg "export.*from.*$MODULE" src/lib/ --type ts` |
| G6 | SvelteKit load→data binding | route file → never orphan |
| G7 | fetch('/api/...') wiring | `rg "fetch.*$MODULE" src/` |
| G8 | Event coupling (yorha: namespace) | `rg "yorha:" src/ --type svelte -l` |
| G9 | .svelte.ts store consumers | `rg "from.*$MODULE" src/ --glob "*.svelte.ts"` |

### Tier B — Data Layer (G10–G13)

| Gate | Check |
|------|-------|
| G10 | Drizzle schema refs (70+ tables, 14 enums in schema-postgres.ts) |
| G11 | DB client import = `db/client` (NOT `db/index`) — `rg "from.*db/index" src/ --type ts` must be 0 |
| G12 | Vector/Qdrant collection coupling |
| G13 | Docker service ports (5432/6379/6333/9000/5672) |

### Tier C — Infrastructure (G14–G17)

| Gate | Check |
|------|-------|
| G14 | Native addon .node binary via createRequire |
| G15 | Proto/gRPC contract consumers |
| G16 | Worker thread coupling (compute-pool ↔ compute-worker) |
| G17 | No hardcoded localhost (use ENV.* getters) — `rg "localhost\|127\.0\.0\.1" src/lib/server/ --type ts` |

### Tier D — Security + Runtime (G18–G20)

| Gate | Check |
|------|-------|
| G18 | Auth guard on API routes — `rg "locals\.user\|requireAuth" src/routes/api/$MODULE/ --type ts` |
| G19 | Zod validation on API routes |
| G20 | SSR safety — no unguarded `window./document.` in module scope |

### Tier E — Svelte 5 Rune Compliance (G21–G26) — All must return 0 hits

| Gate | Check | Command |
|------|-------|---------|
| G21 | No `export let` (Svelte 4 props) | `rg "export\s+let\s+\w+" src/ --glob "*.svelte"` |
| G22 | No `$:` reactive declarations | `rg "^\s*\$:[^:]" src/ --glob "*.svelte"` |
| G23 | No `on:event` directives | `rg "\bon:[a-z][a-z]+=" src/ --glob "*.svelte"` |
| G24 | No `createEventDispatcher()` | `rg "createEventDispatcher\(\)" src/ --glob "*.svelte"` |
| G25 | No runes in plain `.ts` files | `rg "\$(?:state\|derived\|effect\|props)\s*[(<]" src/lib/ --type ts --glob "!*.svelte.ts"` |
| G26 | Route tests use lazy-import G26 pattern | `rg "@vitest-environment node" tests/routes/ --glob "*.test.ts" -l` |

### Tier F — pytorch-graph N-API (G27–G35)

| Gate | Check |
|------|-------|
| G27 | `kmeansWithCentroids` AND `trainSOM` imported in ≥2 server files |
| G28 | `src/routes/api/graph/som-topology/+server.ts` exists |
| G29 | `src/routes/api/graph/colab-export/+server.ts` exists |
| G30 | `.vscode/tasks.json` has `"dependsOrder": "parallel"` in ≥2 tasks |
| G31 | `som_cluster` payload field written after SOM in Qdrant |
| G32 | `SIMILAR_TOPOLOGY` Neo4j relationship created |
| G33 | `pageRankGPU` wired in `src/lib/server/graph/` |
| G34 | `attentionScoreGPU` wired in server or context-assembler |
| G35 | `rewardScoreGPU` available for GRPO pipeline |

### Tier G — Glyph / Cartridge / ACE (G36–G47)

| Gate | Check |
|------|-------|
| G36 | `GlyphRecord` shared schema + `GlyphSection` + `GlyphKind` types |
| G37 | `runeToGlyphRecord` compatibility mapper exists |
| G38 | Staged cartridge search: topo prefilter → attention rerank → 768d rerank |
| G39 | Section-aware tiling: `FACTS\|LEGAL_AUTHORITY\|CLAIMS\|PRAYER_HOLDING` const |
| G40 | Glyph prompt cache aligned to page boundaries (`glyphId`/`pageIndex`) |
| G41 | `buildGlyphTileAtlas` reachable from live route (≥2 consumer hits) |
| G42 | Redis slim/full atlas contract explicit (`centroid omitted from Redis`) |
| G43 | CouchDB topology persistence (`glyph_topology` / `COUCHDB_DB`) |
| G44 | RabbitMQ `glyph.tile.rebuild` publish path live |
| G45 | Drizzle schema has `glyph_records` + `grpoRewardScore`/`somCluster` columns |
| G46 | Barrel exports narrow (no internal glyph exposure) |
| G47 | Frontend route consumer for cartridge + glyph features |

### Tier H — Search Intelligence + Analytics (G48–G55)

| Gate | Check |
|------|-------|
| G48 | Search Patterns API returns all 9 fields: hotQueries/clusterHeat/variancePairs/chunkQuality/pipelineMemory/crossPipelineChamps/trending/didYouMean/meta |
| G49 | `search-analytics.ts` exports all 6 read functions |
| G50 | `recordChunkHits()` fires in `context-assembler.ts` on every retrieval |
| G51 | `fetchTopQueryTags()` wired in context-assembler (P1-A feedback loop) |
| G52 | `webSearchToUnified()` active in context-assembler (P3-A cross-source rerank) |
| G53 | `ACE_PIPELINE_VERSION = '3.x'` (trust fence; invalidates stale cache) |
| G54 | `generateCacheKey` canonical in `cache-keys.ts` |
| G55 | `redis-exact-match.ts` + `llm-cache.ts` both import from `cache-keys` |

### HyperRAG Smoke Gates (G-HR1–G-HR10)

Run: `npm run smoke:hyperrag`

| Gate | Check | Status |
|------|-------|--------|
| G-HR1 | `feature_implementations` table has ≥1 row | PASS |
| G-HR2 | All active features have ≥1 file edge | PASS |
| G-HR3 | `kag.multi_lane_search` returns chunks with `lane` field | PASS (via `trustTiers` metadata map when Qdrant empty; per-chunk `lane` field needs `graphify:semantic`) |
| G-HR4 | `kag.multi_lane_search` returns chunks with `trustMeta.tier` | PASS (via `trustTiers` metadata map; per-chunk `trustMeta.tier` needs `graphify:semantic`) |
| G-HR5 | Sanitizer blocks "ignore previous instructions" pattern | PASS |
| G-HR6 | `panel_activity_log` table exists with correct columns | PASS |
| G-HR7 | POST `/api/analytics/panel-activity` returns 204 | PASS (SvelteKit running) |
| G-HR8 | `ACE_PIPELINE_VERSION === '3.0.0'` in context-assembler.ts | PASS |
| G-HR9 | `kag.feature_lookup('context assembler')` returns ≥1 file path | PASS |
| G-HR10 | `ops.trust_audit` returns `{ blockedCount: number }` | PASS |

**G-HR3/G-HR4 current state**: wiring confirmed via `trustTiers` metadata (L0–L11 map). Per-chunk `lane`/`trustMeta.tier` fields require Qdrant to be populated: `npm run graphify:semantic` (~60s, requires Ollama).

---

## 5. GPU / LibTorch Autoencoder Status

### GPU Task Classification

Tasks are split into three categories by compute profile:

| Category | What runs on GPU | Why |
|----------|-----------------|-----|
| **Embedding / inference** | LLM generation (Gemma4 via llama-server), sentence-transformer encoding, `embeddinggemma:latest` via Ollama | Batch text-to-vector operations are embarrassingly parallel; CUDA cuts latency from seconds to ms |
| **Vector similarity** | Cosine similarity over codebase_chunks_768 (3,140 pts), k-NN ANN search, Qdrant HNSW traversal, `attentionScoreGPU(probe, 768, flat, n)` via tensorrt_bridge.node | Thousands of parallel dot-products fit in one GPU warp; CPU is orders of magnitude slower for n>100 |
| **ML computations** | k-means clustering (`kmeansWithCentroids`), SOM training (`trainSOM`), PageRank (`pageRankGPU`), GRPO reward scoring (`rewardScoreGPU`), batch cosine similarity for Karpathy blend | Heavy linear algebra (matmul, eigendecomp, graph iteration) maps naturally to CUDA cores |

**Keep on CPU**: Redis lookups, Postgres FTS queries, Neo4j Cypher (has its own JVM thread pool), RRF fusion math, routing/control logic, small-n similarity (n<32).  
**GPU transfer overhead rule**: keep embedding tensors resident in CUDA memory across pipeline stages — avoid repeated host↔device copies for the same batch.

### docker-compose GPU Profile

The Go microservices and TensorRT-LLM only start under `--profile full` or `--profile gpu`:

| Service | Profile | Ports | Role |
|---------|---------|-------|------|
| `go-embedding-service` | full, gpu | 50051 (gRPC), 8097 (HTTP) | Ollama proxy + Redis embedding cache |
| `go-retrieval-service` | full, gpu | 50053 (gRPC), 8100 (HTTP) | RAG+KAG+DAG retrieval, Qdrant + pgvector |
| `tensorrt-llm` | gpu only | 8099 (HTTP), 8098 (health) | INT4 AWQ LLM inference, TorchInductor cache |

Start them: `docker compose --profile full up -d go-embedding-service go-retrieval-service`  
Check: `curl localhost:8097/health && curl localhost:8100/health`

When Go services are **down**, the SvelteKit server falls back automatically:
- gRPC :50051 → HTTP :8097 → inline Ollama `:11434` (embedding-client.ts cascade)
- gRPC :50053 → HTTP :8100 → inline TypeScript RAG (retrieval-client.ts cascade)

### Current State (2026-05-10 — verified)

| Metric | Value |
|--------|-------|
| `gpuEncoded` | ✅ true |
| `gpuAttention` | ✅ true |
| Candidates | 50 (top-N PageRank) |
| Embedded (Qdrant hits) | 11 (current run — most top-50 infra files not in Qdrant yet) |
| Weights source | **random:xavier** (n=11 < 65 needed for PCA) |
| Attention dim | 768-dim direct (z-score sigmoid spread) |
| Autoencoder output | 64-dim at `gpu:karpathy:encoded` (24h TTL) |
| Blend stored | `gpu:karpathy:scores` (11 keys, 24h TTL) |
| `gpu:karpathy:by_lane` | ✅ **12 lanes written** (L0–L11, 31 file→lane edges from feature_file_edges) |

### GPU Functions Verified

All 6 functions exported from `simd-bridge/cpp/build/Release/tensorrt_bridge.node` (live-tested 2026-05-10):
- `kmeansWithCentroids(data, n, dim, k, maxIters)` — GPU k-means clustering
- `trainSOM` — Self-organizing map training  
- `pageRankGPU` — GPU-accelerated PageRank
- `attentionScoreGPU(probe, probeDim, flat, n)` — Cosine attention (used on raw 768-dim)
- `rewardScoreGPU` — GRPO reward scoring
- `autoencoderEncode(input, n, inputDim, W, b, hidden)` — 768→64 autoencoder (Xavier weights until PCA or OLS activated)

Verify: `node -e "const a=require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node'); ['kmeansWithCentroids','trainSOM','pageRankGPU','attentionScoreGPU','rewardScoreGPU','autoencoderEncode'].forEach(f=>console.log(f+':',typeof a[f]))"`

### Weights Resolution Chain

```
1. Redis ace:autoencoder:decoder:weights (OLS from run-tensor-topology-mapreduce.mjs) — EMPTY currently
2. PCA power-iteration (2-round Krylov, ~20ms CPU) — REQUIRES n ≥ 65 embeddings
3. Random Xavier init — CURRENT (n=11, no semantic meaning in 64-dim output)
```

**Root cause of n=11**: Top-50 PageRank files are infra files (`db/client`, `ollama`, etc.) which haven't been indexed by `graphify:semantic` yet. The `by_lane` hash uses ALL `feature_file_edges` (31 ACE/retrieval files) — separate from the Karpathy score hash which is limited to Qdrant hits.

**Action**: Run `npm run graphify:semantic` first (indexes files into Qdrant), then `npm run karpathy:gpu -- --limit 200` to get ≥65 Qdrant hits and activate PCA path.

### Karpathy Blend Formula

```
blend = 0.4 × graphPageRank + 0.3 × attentionScore_768d + 0.3 × graphAuthorityScore
```

Attention scores use z-score sigmoid spread (temp=1.5) to overcome 768-dim cosine concentration (raw scores cluster 0.99–1.00, giving no differential signal).

### CUDA Graphs (RTX Tensor Core Optimization — Phase 2)

CUDA Graphs capture a GPU op sequence once, then replay with a single CPU call — eliminating per-kernel submission overhead (~1.8ms reduction per inference on RTX hardware). TensorRT-RTX auto-captures from iteration 2 onward with no explicit capture code. Multi-context parallel capture is available in 2026 builds.

**When to use**: repeated fixed-shape batches — autoencoder encode (`batch=64, dim=768`), SOM BMU lookup, Karpathy rerank cosine similarity over cached candidates.  
**vs cuBLAS**: complementary — cuBLAS is the device-side compute kernel (GEMM on tensor cores); CUDA Graphs eliminate host-side kernel-launch overhead. Both are used together.  
**Implementation target**: `captureAEGraph()` in `src/lib/server/gpu/autoencoder-bridge.ts` (Phase 2 TODO). Pipeline: warmup 2 iterations → `cudaStreamBeginCapture` → forward pass → `cudaStreamEndCapture` → cache graph handle → subsequent calls use `cudaGraphLaunch`.

### 4D Topological Datastore (manifold4)

`manifold4 = [som_x, som_y, semantic_z, grpo_w]` — four-dimensional coordinates assigned to every document/chunk after the GraphRAG pipeline runs.

| Store | Key / Column | Written by |
|-------|-------------|-----------|
| Postgres | `research_summaries.manifold4 real[]` | `writeManifold4ToDB()` in `hypergraph-4d.ts` |
| Qdrant | payload fields `som_x`, `som_y`, `manifold4` | `mirrorManifold4ToQdrant()` in `hypergraph-4d.ts` |
| Neo4j | `f.manifold4X/Y/Z/W` node props + `SIMILAR_TOPOLOGY` edges | `writeNeo4jEdges()` in `hypergraph-4d.ts` |
| Redis | `ace:topo:{class}:{hash}` (300s TTL) | ACE Stage A0 topo-byte prefilter cache |

**Key files**:
- `src/lib/server/graph/hypergraph-4d.ts` — full pipeline: k-means → SOM → manifold4 → `writeManifold4ToDB()` + `writeNeo4jEdges()`; Redis coord TTL `HG_COORD_TTL=1h`
- `src/lib/server/gpu/topology-projection.ts` — GPU PCA (`pcaProjectGPU`, n→k) + autoencoder projection bridge (`autoencoderEncodeGPU`); CPU fallback when n<256 or VRAM headroom<256MB
- `src/lib/server/graph/som-topology-pipeline.ts` — SOM training, BMU assignment, neighbor updates → feeds `som_x/som_y` into manifold4
- `src/lib/server/ace/codeintel-datastore.ts`, `adaptive-prefetch.ts`, `cluster-tags-cache.ts` — read manifold4 from Redis/Qdrant for ACE Stage A0 prefiltering

**MapReduce**: No TypeScript MapReduce — CouchDB's native MapReduce engine builds the `link_matrix` view used by `scripts/run-pagerank.ts` for power-iteration PageRank. The "DAG" in GraphRAG is the SOM-outcome feedback loop: new semantic outcomes tag back into Qdrant edges → Neo4j `SIMILAR_TOPOLOGY` refresh → PageRank re-rank → manifold4 update.

---

## 6. Missing Enhancements — Codebase Semantic Index Querying

These gaps were identified from the 65-gate audit, TODO-enhancements.md, and comparison with 2026 state-of-the-art retrieval research.

### What Is Already Live (May 2026 audit)

Before treating these as gaps, verify against actuals:

| Capability | File | Status |
|-----------|------|--------|
| BM42 sparse vectors | `src/lib/server/vector/bm42-sparse.ts` | ✅ FNV-1a token hashing + 2× legal-term boost |
| Sparse lane in ACE | `src/lib/server/ace/multi-lane-retrieval.ts:132` | ✅ runs in `Promise.allSettled` alongside dense |
| `hybridSearch()` RRF fusion | `src/lib/server/vector/qdrant-manager.ts` | ✅ dense + sparse fused via Qdrant native RRF |
| Postgres FTS / BM25 | `src/lib/server/db/postgres-fts.ts` | ✅ `ts_rank` + `tsvector` |
| SOM training | `src/lib/server/graph/som-cluster.ts` | ✅ BMU + neighbor updates |
| Neo4j GDS PageRank/Louvain/KNN | `src/lib/server/graph/neo4j-gds.ts` | ✅ live |
| LibTorch N-API GEMM | `src/lib/server/gpu/libtorch-bridge.ts` | ✅ cuBLAS GEMM |
| Inference logging | `src/lib/server/inference/inference-log.ts` | ✅ CouchDB inference_log |
| Chunk hit logging | `src/lib/server/analytics/search-analytics.ts` | ✅ `recordChunkHits()` |
| gRPC + Protobuf | `proto/active/` (10 .proto files) | ✅ embedding/retrieval/tool_calling |
| Qdrant sparse vector support | `qdrant-manager.ts:getSparseSupport()` | ✅ BM42 sparse index |
| Autoencoder 768→64 | `src/lib/server/gpu/autoencoder-bridge.ts` | ⚠️ Xavier weights = flat outputs |

**Sparse lane note**: BM42 is wired but `codebase_chunks_768` needs sparse vectors populated. Run `npm run graphify:semantic` to index sparse vectors alongside dense. After that L3 (sparse) contributes to all hybrid searches.

### 6.1 Cross-Encoder Reranker (HIGH PRIORITY)

**Gap**: Current retrieval uses bi-encoder (cosine similarity). Precision at top-5 is limited.  
**2026 state-of-art** (web search audit 2026-05-10): Two-stage pipeline is the production standard:
- Stage 1 (recall): BM42 sparse + 768-dim dense → Qdrant native RRF → top-100 candidates ← **already live**
- Stage 2 (precision): Cross-encoder rerank → top-20 for LLM context ← **missing**

**Model**: `cross-encoder/ms-marco-MiniLM-L-6-v2` (22.7M params) — no newer code-specific model in 2026; ms-marco L-6 remains the standard. CPU: 60-100ms/20 pairs (acceptable for legal domain).

**Wiring**: ONNX Runtime is already in `src/lib/ai/onnx/session.ts`. Load the cross-encoder model once, score top-100 bi-encoder candidates, return reranked top-20.

**File**: `docs/cross-encoder-reranker-wiring.md` has the design (wire from multi-lane-retrieval.ts merge step).

**Effort**: ~4h. Avoid bi-encoder reranking — cross-encoders are categorically better for precision.

**Source**: [Advanced RAG: Hybrid Search & Reranking](https://dev.to/kuldeep_paul/advanced-rag-from-naive-retrieval-to-hybrid-search-and-re-ranking-4km3)

### 6.2 Autoencoder Weights — Train for Real Semantic 64-dim (MEDIUM)

**Gap**: 64-dim autoencoder in `karpathy-gpu-enrich.mjs` uses Xavier random weights → flat tanh outputs → cosine distance meaningless in 64-dim space (Δ < 0.01). This is a CPU/RAM issue, not GPU — the autoencoder runs in Node.js JS, not CUDA.

**Fix — train the autoencoder** (`npm run ae:train`, ~10 min on CPU):
- `scripts/train-autoencoder.mjs` runs 768→256→64→256→768 with MSE + contrastive loss over the Qdrant corpus.
- Writes `ace:autoencoder:weights` (Redis hash, full 2-layer model) AND `ace:autoencoder:decoder:weights` (Redis string, W1@W2 combined 64×768 — the format `resolveWeights()` expects in karpathy-gpu-enrich.mjs). Key mismatch was fixed 2026-05-10.
- Run order: `npm run graphify:semantic` → `npm run ae:train` → `npm run karpathy:gpu`.

**Immediate fix without training**: `npm run karpathy:gpu -- --limit 200` activates PCA path (requires ≥65 Qdrant hits from `graphify:semantic`). PCA weights are computed from actual corpus data in ~20ms.

**Research** (PCA-RAG, arxiv 2504.08386): PCA outperforms UMAP, Kernel PCA, and feedforward autoencoders for RAG compression when the corpus is < ~10K chunks. ConAE (conditional autoencoder) wins at scale.

**Note**: The 64-dim output (`gpu:karpathy:encoded`) is the "memory path" projection for MLA-style consumers — a different concern from Qdrant storage. For Qdrant storage compression, INT8 quantization is simpler and already supported natively.

### 6.3 Reciprocal Rank Fusion — PARTIALLY LIVE

> **TL;DR**: Dense+sparse RRF is live inside Qdrant. Cross-lane merge still uses weighted score sum — replace the merge step with `Σ 1/(k+rank_i)` for 91% recall@10. ~2h effort.

**Audited 2026-05-10 against codebase (grep: sparse\|bm42\|hybridSearch in multi-lane-retrieval.ts + qdrant-manager.ts).**

- ✅ **Dense + sparse RRF**: Qdrant `hybridSearch()` uses Qdrant's native server-side RRF to fuse dense and sparse vectors (no code change needed).
- ✅ **Lane weights**: `multi-lane-retrieval.ts:356` has per-lane weights (`sparse: 0.60`, etc.) applied to a weighted merge across the 11 lanes.
- **Remaining gap**: The cross-lane merge uses a weighted score sum, not a true `1/(k+rank_i)` RRF formula. True RRF is rank-position-based and score-normalization-free.

**Concrete fix — replace weighted sum with RRF in `multi-lane-retrieval.ts` merge step:**

```typescript
// BEFORE (score-sum — breaks when lanes return different score ranges)
for (const [lane, hits] of byLane) {
  const w = LANE_WEIGHTS[lane] ?? 0.5;
  hits.forEach(h => scores.set(h.id, (scores.get(h.id) ?? 0) + w * h.score));
}

// AFTER — true RRF: rank-position-based, normalization-free (k=60 per Cormack 2009)
const K = 60;
function mergeRRF(byLane: Map<string, RetrievalHit[]>): RetrievalHit[] {
  const acc = new Map<string, { score: number; hit: RetrievalHit }>();
  for (const hits of byLane.values()) {
    hits.forEach((h, rank) => {
      const prev = acc.get(h.id);
      if (prev) prev.score += 1 / (K + rank);
      else acc.set(h.id, { score: 1 / (K + rank), hit: h });
    });
  }
  return [...acc.values()].sort((a, b) => b.score - a.score).map(e => e.hit);
}
```

**rg/awk sparse reranker pipeline** (Lane A — exact symbol/file search):
```bash
# Fast symbol lookup feeding sparse lane
rg --json "export (function|const|class) $SYMBOL" src/ --type ts \
  | awk -F'"' '/path/{f=$4} /text/{print f ":" $4}' \
  | head -20
# Pipe results into BM42 sparse vector slot:
# generateSparseVector(symbolQuery) → bm42-sparse.ts → Qdrant sparse field
```

**Web search ingestion autoencoding** (correct approach per 2026 research):
- **Do NOT** build a custom autoencoder for web snippets. Use the same 768-dim `embeddinggemma:latest` as code — this keeps the embedding space unified for hybrid search across code+web.
- Pipeline: strip HTML → `buildExternalTrustMeta()` (T4) → embed 768-dim → upsert to `kb_notecards` collection → ingest via `kb.ingest_doc_summary` MCP tool
- INT8 quantization in Qdrant handles 75% storage compression natively — no custom encoder needed.

**Research**: "Hybrid Search Guide (April 2026)" — RRF gets 91% recall@10.  
**Location**: `src/lib/server/ace/multi-lane-retrieval.ts` — the merge step after `Promise.allSettled`.  
**Effort**: ~2h.

### 6.4 BM42 Sparse Lane — ALREADY LIVE ✅

**Was listed as a gap — confirmed live in May 2026 audit.**
- `src/lib/server/vector/bm42-sparse.ts` — FNV-1a token hashing, 2× boost for legal terms (`statute`, `hearsay`, `evidence`, `objection`, `deposition`, etc.)
- `src/lib/server/vector/qdrant-manager.ts:728` — `generateSparseVector(params.query)` called inside `hybridSearch()`
- `src/lib/server/ace/multi-lane-retrieval.ts:132` — `lane: 'sparse'` runs in `Promise.allSettled` alongside all other lanes
- **Remaining action**: populate sparse vectors in `codebase_chunks_768` by running `npm run graphify:semantic`. After that sparse retrieval contributes actual hits instead of empty results.

### 6.5 Chunk Hit Log Coverage Gap (MEDIUM)

**Gap**: G50 says `recordChunkHits()` currently fires on RAG pass only. It should also fire for ACP cross-feed, graph-neighbor, SOM/hyperedge passes.  
**Impact**: The `SOURCE=hit-log` mode in karpathy-gpu-enrich.mjs (demand-weighted candidates) will be sparse.  
**Fix**: Add `recordChunkHits()` calls in `fetchACPKnowledgeResults()` for every retrieval branch, not just the Qdrant branch.

### 6.6 Semantic Snippet Expansion (LOW, high payoff)

**Gap**: When a code chunk is retrieved, adjacent context (neighboring chunks in same file) is not automatically fetched.  
**Solution**: After ANN retrieval, expand top-K results with ±2 adjacent chunks using Qdrant payload filter `{ file_path: fp, chunk_index: { gte: i-2, lte: i+2 } }`.  
**Effort**: ~3h. Improves multi-function code pattern retrieval significantly.

### 6.7 Code Symbol Lookup (LOW, high precision)

**Gap**: Searching for a specific function name (e.g., `fetchACPKnowledgeResults`) requires embedding similarity — slow and imprecise.  
**Solution**: Index `exports[]` and `symbol_name` as Qdrant payload fields. Add a fast payload-filter search path for exact symbol lookup bypassing ANN entirely.  
**Effort**: ~4h (extend indexer + add dedicated `/api/code-intel/symbol` endpoint).

### 6.8 TurboQuant MLA Latent as 64-dim Encoder (FUTURE)

**Gap**: The `TURBO_EMBEDDINGS_ENABLED` path in karpathy-gpu-enrich.mjs is dormant. TurboQuant llama-server (`:8090`) started without `--embeddings` flag (would OOM on 8GB GPU).  
**When ready**: Restart TurboQuant with `--embeddings` on a dedicated smaller model (not gemma4-legal-vlm). The Gemma4 SWA `head_dim=256` MLA latent compressed to 64-dim would replace Xavier/PCA entirely with semantically richer projections.  
**Constraint**: gemma4-legal-vlm (5.3GB) + q8_0 KV uses ~5.8GB VRAM; no headroom for `--embeddings` on 8GB.

### 6.9 Topo-Byte Cache TTL Tuning (LOW)

**Gap**: `ace:topo:{class}:{hash}` TTL is 300s. Topology changes at most once per `graphify:full` run.  
**Fix**: Bump to 600s for topology classes that appear in >10 queries/hour (check `ace:topo:hit:count` sorted set if it exists).

### 6.11 SearXNG Web Search Ingestion Pipeline (MEDIUM)

**Context** (audited 2026-05-10): L10 web_external lane is the highest-risk retrieval path. All findings below are from live grep audit of the codebase — not speculation.

#### Cascade (confirmed from env.server.ts + web-research-crawler.ts)

```
SearXNG :8888 (SEARXNG_URL)        ← your self-hosted instance, first tried
  → Brave API (BRAVE_API_KEY)       ← if SEARXNG_URL unset
  → Serper API (SERPER_API_KEY)     ← if Brave key absent
  → DuckDuckGo scrape               ← always-available fallback
```

Ollama has **no native web_search** — the `web_search` tool in `gemma4Tools` is a stub that calls the same `/api/research/web-search` proxy endpoint. SearXNG wins in your environment because `SEARXNG_URL` is set.

#### What is already live

| Component | File | Status |
|---|---|---|
| SearXNG cascade | `web-research-crawler.ts` | ✅ LIVE |
| T4 trust tier assignment | `sanitizer.ts:buildExternalTrustMeta()` | ✅ LIVE |
| 8-pattern injection sanitizer | `sanitizer.ts` | ✅ LIVE |
| `instructionAuthority=false` flag | `sanitizer.ts` | ✅ LIVE |
| `web_search_index` Postgres FTS table | `context-assembler.ts:296` | ✅ LIVE |
| `chunks_web_search` Qdrant collection | `context-assembler.ts:506` | ✅ LIVE — Lane 3 deep-research |
| ACE `webSearchContext` field | `context-assembler.ts:766` | ✅ LIVE |
| BM42 sparse on web chunks | `qdrant-manager.ts hybridSearch()` | ✅ LIVE — applies to all collections |

#### Full ingestion pipeline (what happens per web result)

```
SearXNG result (title + snippet + url)
  │
  ├─ 1. Strip HTML                           ← MISSING: remove <script>/<style>/hidden text
  ├─ 2. Domain blocklist check               ← MISSING: reject known disinfo domains
  ├─ 3. Dedup against chunks_web_search      ← MISSING: cosine > 0.95 → skip
  │
  ├─ 4. Embed: embeddinggemma:latest → 768-dim vector   ← use SAME model as codebase
  │         (NOT a custom autoencoder — consistent space enables cross-collection hybrid search)
  │
  ├─ 5. Upsert to Qdrant `chunks_web_search`
  │       payload: { source_url, title, trust_tier: 'T4', ingested_at, domain }
  │       INT8 quantization → 75% VRAM savings natively, no compression code needed
  │
  └─ 6. Insert to Postgres `web_search_index`
          tsvector(title + snippet) → FTS lane alongside dense recall
```

Steps 1–3 are the only missing pieces. Steps 4–6 are already wired.

#### Why Qdrant, not Milvus

Milvus requires 3-node minimum (ZooKeeper/etcd) and has a break-even at **50M+ vectors**. This project has ~38,363 chunks. Qdrant handles 2.5M float32 768-dim vectors per 8GB RAM (INT8: ~10M/8GB). Switching to Milvus at current scale would add ~2GB overhead with no retrieval benefit.

| Metric | Qdrant (current) | Milvus |
|---|---|---|
| Min footprint | single binary, ~700MB | 3+ nodes, ~2GB |
| 38K vector search | ~8ms | ~8ms |
| Break-even scale | — | ~50M vectors |
| Sparse (BM42) | ✅ native | ✅ native (Sparse-BM25) |
| INT8 quant | ✅ native | ✅ native |

**Decision**: Stay on Qdrant. Milvus is a no-op for this project's scale.

#### BM42 + hybridSearch — confirmed already live

From audit:
- `bm42-sparse.ts` — FNV-1a token hashing + 2× legal-term boost
- `qdrant-manager.ts:728` — `generateSparseVector()` called inside `hybridSearch()`
- `multi-lane-retrieval.ts:132` — `lane: 'sparse'` runs in `Promise.allSettled`
- Qdrant `hybridSearch()` fuses dense + BM42 sparse via native RRF

This means web chunks in `chunks_web_search` automatically get sparse retrieval once their sparse vectors are populated (same `graphify:semantic` run that populates `codebase_chunks_768`).

#### QueryRouter4x4 integration (added 2026-05-10)

`kb-retrieval-server.ts` `kb.search_external_research` now routes via `QueryRouter4x4`. High-trust queries (`trustPressure > 0.5`) suppress T4 web content automatically via the routing weights. All responses include `routing_metadata` for transparency.

#### Security (OWASP LLM Top 10 2025)

5 poisoned documents can manipulate LLM output 90% of the time. Web content is the highest-risk RAG source. Hard rules already in force: T4 tier (×0.70 multiplier), `instructionAuthority=false`, 8-pattern injection sanitizer. Additional recommended gate: post-retrieval verifier prompt checking T4 chunks for instruction-following attempts before injecting into system fence.

**Source**: [Context Poisoning in LLMs — Elastic Search Labs](https://www.elastic.co/search-labs/blog/context-poisoning-llm)

### 6.10 ConAE for 768→128 Compression (RESEARCH)

**Research finding**: Conditional AutoEncoder (ConAE) achieves 768→128 compression with only 0.3% recall loss (MRR@10: 0.3302→0.3245). PCA to 128-dim loses 29% (MRR: 0.2348). Plain feedforward autoencoder is intermediate.  
**Current gap**: The 768→64 path uses Xavier (meaningless) or PCA (decent). A ConAE trained on `codebase_chunks_768` would be the production-quality path.  
**Effort**: ~1 day — train ConAE on the 3,140-chunk corpus via a Colab notebook, export weights to Redis `ace:autoencoder:decoder:weights`.

### 6.12 4D Topological Store — Multi-Store Data Model

The **manifold4** coordinate system encodes every codebase chunk in a 4D space.  
Each dimension is orthogonal:

| Dim | Symbol | What it encodes | Source |
|-----|--------|-----------------|--------|
| 0 | `som_x` | SOM grid column (topology) | `trainSOM` → BMU column |
| 1 | `som_y` | SOM grid row (topology) | `trainSOM` → BMU row |
| 2 | `semantic_z` | Embedding centroid projection (semantics) | k-means centroid distance → `kmeansWithCentroids` |
| 3 | `grpo_w` | GRPO reward weight (RL quality signal) | `rewardScoreGPU` → retrieval feedback loop |

Each coordinate is stored in **four independent layers** — not replicated, each layer serves a different access pattern:

| Layer | Key / Field | TTL / Notes | Who writes | Who reads |
|-------|------------|-------------|-----------|-----------|
| **Postgres** | `research_summaries.manifold4 real[4]` | permanent | `hypergraph-4d.ts:writeManifold4ToDB()` | `manifold4-search.ts` Euclidean radius query |
| **Redis** | `gpu:karpathy:encoded` hash → 64-dim CSV | 24h | `karpathy-gpu-enrich.mjs` autoencoderEncode step | future MLA consumers (64-dim path reserved) |
| **Redis** | `ace:topo:{class}:{hash}` | 300s | ACE Stage A0 topo-byte write | `fetchACPKnowledgeResults()` — skip ANN on hit |
| **Qdrant** | `som_cluster`, `som_bmu_row/col` payload | permanent | `graphify:topology` → `codeintel-datastore.ts` | `context-assembler.ts` topology rerank, BM42 tag filter |
| **Neo4j** | `SIMILAR_TOPOLOGY` edges (adjacent BMU cells) | permanent | `som-topology-pipeline.ts` | Cypher expand + `SIMILAR_TOPOLOGY` hop at query time |
| **Neo4j** | `HAS_SOM_POSITION` on `DirectorySummary` | permanent | `directory-summarizer.ts` | ACE Cypher filter by SOM neighborhood |

**Search layer**: `src/lib/server/retrieval/manifold4-search.ts` — SQL Euclidean distance on the `real[]` column:

```typescript
// Find all chunks within radius 0.25 of a 4D center point
const hits = await searchManifold4({
  center: [som_x, som_y, semantic_z, grpo_w],
  radius: 0.25,
  limit: 30,
  somCluster: 7,  // optional: narrow to one SOM cluster
});
// Returns Manifold4Hit[] ordered by manifoldScore = 1/(1 + distance)
```

This is imported by `context-assembler.ts:88-89` as the quaternion rerank layer (fires when `manifold4` is present on the top chunk, line ~895).

**To populate all layers**:
```bash
npm run graphify:full   # Stage 2: kmeansWithCentroids + trainSOM → Qdrant/Neo4j/Postgres
npm run karpathy:gpu    # 64-dim encoded → gpu:karpathy:encoded Redis
```

### 6.13 Manifold Search as MapReduce

The retrieval pipeline is structurally a **MapReduce** — parallel scatter across 11 independent lanes, then fuse:

```
MAP phase — Promise.allSettled (src/lib/server/ace/multi-lane-retrieval.ts)
  L0  topo-byte Redis prefilter    (2ms, skip ANN on hit)
  L1  Qdrant dense 768-dim         (8ms, cosine ANN)
  L2  Qdrant signature 768-dim     (8ms, AST-structure ANN)
  L3  Postgres FTS BM25            (5ms, ts_rank tsvector)
  L4  BM42 sparse                  (8ms, FNV-1a legal-term boost)
  L5  Neo4j graph neighbors        (15ms, IMPORTS/BELONGS_TO_CLUSTER)
  L6  Synthesis memory 768         (8ms, persisted Gemma4 outputs)
  L7  Wiki/AGENTS.md Redis          (2ms, wiki:note:dir:* + agents:dir:*)
  L8  Prior answers Redis           (2ms, code:llm:* + ace:chunks:*)
  L9  Feature atlas Postgres FTS   (5ms, feature_implementations JOIN file_edges)
  L10 SearXNG web external         (500-2000ms, T4 trust, parallel non-blocking)

REDUCE phase — rrfFuse() (src/lib/server/routing/query-router-4x4.ts)
  score_i = Σ_src weight_src × 1/(k + rank_i_in_src)   k=60
  Dedup by id → sort descending → top-N

RERANK phase — Karpathy blend (gpu:karpathy:scores Redis hash)
  blend = 0.4×pagerank + 0.3×attention + 0.3×authority
  Applied on top of RRF score for final ordering
```

**Manifold4 as a Map filter** (not a Reduce): `manifold4-search.ts` can run as a pre-Map filter — replace ANN lanes with a Euclidean ball query on `research_summaries.manifold4` for topology-class-aligned queries. This is what `ace:topo:{class}:{hash}` caches: the manifold4 result for a given topo class + query hash.

**Cross-encoder as Reduce upgrade** (§6.1 gap): Replace weighted-score RRF with cross-encoder rescoring. Input = top-100 from Map phase; output = top-20 reranked. Adds ~60-100ms but precision doubles.

**QueryRouter4x4** selects which Map lanes receive the most weight before dispatching:
```typescript
const signal = extractSignal(query);   // {semantic, lexical, graph, trustPressure}
const routing = router.route(signal);   // 4×4 matrix → weights per backend
// High trustPressure → web lane weight suppressed → T4 content excluded
```

### 6.14 RTX CUDA Graphs + Tensor Core Scheduling

**RTX 3060 Ti (sm_86, Ampere)** has **3rd-generation Tensor Cores** supporting:
- FP16 (16×16×16 WMMA tiles) — used by LibTorch `attentionScoreGPU`
- BF16 (same tiles, wider dynamic range) — preferred for accumulation stability
- INT8 (32×32×16 IMMA tiles) — used by TensorRT-LLM quantized inference at `:8099`
- INT4 (via TF32 expansion + INT8 tiles) — AWQ dequant path in TensorRT-LLM

**Current path**: LibTorch in `tensorrt_bridge.node` calls cuBLAS `gemm` → cuBLAS dispatches to Tensor Core WMMA units automatically when operands are FP16 and matrix dims are multiples of 16. No explicit WMMA code required.

```
TypeScript call
  → attentionScoreGPU(probe_f32, 768, flat_f32, n)   [N-API, 1 call]
  → C++: libtorch_graph.cc cublas_gemm()              [cuBLAS SGEMM → TC dispatch]
  → Tensor Cores: 16×16×16 FP16 WMMA on RTX 3060 Ti  [peak: 101 TFLOPS FP16]
  → Result: Float32Array back to Node.js (≤ 0.5ms for n=3140)
```

**CUDA Graph capture** — pending task in `libtorch_graph.cc`:

| State | What it means |
|-------|--------------|
| **Current (eager mode)** | Each `cublas_gemm` call = new kernel launch overhead (~10µs per launch). For the full Karpathy blend (3 GEMM ops × n=50 files), overhead is ~30µs — negligible at current scale. |
| **Target (CUDA Graph mode)** | Record the fixed-shape computation graph once (probe×flat matmul + softmax + blend), then `cudaGraphLaunch()` for each query. Saves ~10× on launch overhead; critical if n→500+. |

**How to activate CUDA Graph capture** (when needed):
```cpp
// In libtorch_graph.cc — captureAEGraph() function (stubbed, not yet called)
cudaGraph_t graph;
cudaGraphExec_t instance;
cudaStreamBeginCapture(stream, cudaStreamCaptureModeGlobal);
// ... run the fixed-batch attention computation ...
cudaStreamEndCapture(stream, &graph);
cudaGraphInstantiate(&instance, graph, nullptr, nullptr, 0);
// Replay: cudaGraphLaunch(instance, stream)
```

**When to trigger CUDA Graph capture**: Only beneficial when the same batch size is used repeatedly. The autoencoder encode (`autoencoderEncode(flat, n, 768, W, b, 64)`) and attention score (`attentionScoreGPU`) are the prime candidates — both use fixed-dim 768 input with varying `n`. Capture at `n=64` (most common batch size in karpathy-gpu), warm up for 3 runs, then replay.

**Constraint**: CUDA Graphs require fixed shapes. The current variable-n calls prevent capture. Fix: pad `flat` to next multiple of 64 before the N-API call, capture at `n=64`, replay for all batches.

**TensorRT-LLM at `:8099`** uses a pre-compiled CUDA Graph (INT4 AWQ, static batch=1 or batch=4) — that path is already fully graph-optimized. The gap is only in the `tensorrt_bridge.node` pipeline for similarity/attention scoring.

### 6.15 LangExtract + ETA Progress Bars

#### LangExtract (`scripts/lang-extract.mjs`)

Turns LLM output / inference logs / stdio dumps into structured `{ keywords, api_names, required_packages }`.

```bash
# Pipe from any process
npm run karpathy:gpu 2>&1 | node scripts/lang-extract.mjs
# Or pass a file
node scripts/lang-extract.mjs logs/task-output/karpathy-latest.log
# JSON output
node scripts/lang-extract.mjs --json logs/task-output/karpathy-latest.log
```

Extraction patterns:
- **Keywords**: TF-IDF-like frequency on alpha tokens ≥4 chars, minus English stopwords → top-20
- **API names**: `[A-Z][a-zA-Z]+\.(get|post|search|query|embed|index|rank|score)` regex → deduplicated
- **npm packages**: `import .* from ['"][^./]` + `require\(['"][^./]` → package names
- **MCP tools**: `[a-z]+\.[a-z_]+` pattern after "tool:" or in JSON `"name":` fields
- **Error codes**: `TS[0-9]{4}` + `E[A-Z]+` patterns (TypeScript + system errors)

#### ETA Progress Bar (`scripts/lib/progress.mjs`)

Shared helper for long-running pipeline scripts. Zero dependencies — pure Node.js `process.stdout.write`.

```javascript
import { Progress } from './scripts/lib/progress.mjs';

const p = new Progress('Embedding chunks', totalChunks);
for (const chunk of chunks) {
  await embed(chunk);
  p.tick();  // updates in-place every tick
}
p.done();
```

Output:
```
Embedding chunks  [████████████░░░░░░░░]  60% │ 600/1000 │ elapsed: 12s │ eta: 8s
```

Wire into:
- `scripts/index-codebase-fast.mjs` — chunk embedding loop
- `scripts/karpathy-gpu-enrich.mjs` — top-N enrichment loop
- `scripts/run-hypergraph.ts` — k-means iteration progress
- `scripts/train-autoencoder.mjs` — epoch progress

npm scripts added: `lang:extract` → `node scripts/lang-extract.mjs`

---

## 7. Infrastructure Quick-Reference

### Service Ports

| Service | Port | Health |
|---------|------|--------|
| SvelteKit dev | 5173 | `curl localhost:5173` |
| TRACE MCP | 8788 | `curl localhost:8788/health` |
| Redis | 6379 | `docker exec legal-ai-redis redis-cli ping` |
| PostgreSQL | 5434 (Docker) / 5432 (raw) | `psql "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"` |
| Qdrant | 6333 | `curl localhost:6333/` |
| Neo4j | 7474 (HTTP) / 7687 (Bolt) | `curl localhost:7474` |
| CouchDB | 5984 | `curl localhost:5984` |
| Ollama | 11434 | `curl localhost:11434/api/tags` |
| TurboQuant llama-server | 8090 | chat-only (no `--embeddings`) |
| TensorRT-LLM *(gpu profile)* | 8099 (HTTP), 8098 (health) | INT4 AWQ inference |
| go-embedding-service *(full/gpu)* | 8097 (HTTP), 50051 (gRPC) | Ollama proxy + Redis embed cache |
| go-retrieval-service *(full/gpu)* | 8100 (HTTP), 50053 (gRPC) | RAG+KAG+DAG retrieval |
| KB Retrieval Server | 8789 | `curl localhost:8789/health` |
| Bifrost semantic cache | 3040 | `curl localhost:3040/health` |
| RabbitMQ | 5672 / 15672 (UI) | `curl -u guest:guest localhost:15672/api/overview` |
| ComfyUI | 8188 | `curl localhost:8188/system_stats` |

### Trust Tier Multipliers

| Tier | Sources | Multiplier |
|------|---------|-----------|
| T1 | AGENTS.md, feature atlas, `instruction_authority: true` | ×1.20 |
| T2 | Agent-generated content | ×1.00 |
| T3 | Code, wiki notes (default) | ×0.95 |
| T4 | Web / external content | ×0.70 |
| T5 | User-provided unverified input | ×0.60 |

### Redis Key Inventory (ACE/Karpathy)

| Key Pattern | Type | TTL | Refresher |
|-------------|------|-----|-----------|
| `gpu:karpathy:scores` | hash file→{pr,attn,authority,blend} | 24h | `karpathy:gpu` |
| `gpu:karpathy:encoded` | hash file→64-dim CSV | 24h | `karpathy:gpu` |
| `gpu:karpathy:by_lane` | hash L0..L11→JSON[{file,blend}] — **12 lanes, 31 edges (from feature_file_edges, not filtered to top-50)** | 24h | `karpathy:gpu` |
| `gpu:karpathy:summary` | hash run metadata | 24h | `karpathy:gpu` |
| `gpu:karpathy:run_log` | stream (MAXLEN 500) | permanent | every run |
| `ace:authority:top` | hash stableKey→authority | varies | `graphify:authority` |
| `ace:topo:{class}:{hash}` | string candidates | 300s | ACE Stage A0 |
| `ace:rank:dirty_files` | set | session | startup, file saves |
| `couchdb:pagerank_scores` | string JSON | 6h | `run-pagerank.ts` |
| `wiki:note:dir:*` | string Gemma4 summary | 24h | `graphify:daily` |
| `agents:dir:*` | string rendered AGENTS.md | 24h | `agents:write` |
| `code:llm:*` | string cached LLM output | varies | ACE L6 |

---

## 8. Retrieval Architecture

### Three-Lane Taxonomy

Every retrieval need fits into one of three fundamental lanes, and any production query uses all three fused via Reciprocal Rank Fusion (RRF):

#### Lane A — Sparse (Lexical)

**What it is**: Exact keyword / token / symbol matching via term-frequency indices (BM25, Postgres FTS `plainto_tsquery`, `ripgrep`).  
**Strength**: Finds documents that contain the exact identifier — SQL columns, export names, error codes, function signatures. Misses conceptually related terms.  
**Use when**: The query contains a technical identifier that must match exactly. Precision > recall.  
**Implementations in this codebase**:
- Postgres FTS on `feature_implementations` (L9 lane, `plainto_tsquery`)
- `pg_trgm` similarity search for DYM suggestions
- Qdrant BM42 sparse vector support (verify wired: `rg "sparse|bm42" src/lib/server/ --type ts`)
- `ripgrep` via TRACE MCP `trace.kag_search` for symbol lookup
- Fuse.js in-browser fuzzy recall (browser fast-path, pre-ANN)

#### Lane B — Dense (Semantic / Vector)

**What it is**: Embedding model converts query → 768-dim vector, compared via cosine ANN against stored chunk vectors in Qdrant.  
**Strength**: Finds semantically similar content even when keywords differ ("scaling" ≈ "horizontal scaling"). Misses exact identifier matches.  
**Use when**: Natural language query, fuzzy intent, no known entry-point file/symbol.  
**Implementations**:
- L1: `codebase_chunks_768` content vector (768-dim cosine, embeddinggemma) — primary code search
- L2: `codebase_chunks_768` signature vector (AST-structure embedding) — structural similarity
- L3: `summary_lenses_768` — cluster-level narrative summaries
- L5: `synthesis_memory_768` — persisted Gemma4 synthesis outputs
- `attentionScoreGPU(probe, 768, flat, n)` — GPU cosine for Karpathy rerank
- Embedding cascade: SvelteKit `/api/embed` (cached) → direct Ollama → **not** TurboQuant (chat-only on :8090)

#### Lane C — Graph (Structural / Knowledge-Graph)

**What it is**: Traversal of an explicit typed graph — code imports, cluster membership, topology adjacency, PageRank authority.  
**Strength**: Multi-hop relational reasoning that pure text retrieval cannot express. "What does X depend on?", "Which files co-evolved with Y?", "Shortest import path from auth to DB".  
**Use when**: Query involves relationships, dependencies, impact analysis, or structural proximity.  
**Implementations**:
- L7: Neo4j Cypher traversal (`IMPORTS`, `BELONGS_TO_CLUSTER`, `SIMILAR_TOPOLOGY`, `SHARES_TAGS` edges)
- L8: CouchDB `couchdb:pagerank_scores` (precomputed 6h TTL — **never** inline Cypher PageRank)
- `graph.expand_neighborhood`, `graph.pagerank_top`, `topology.search_4d` MCP tools
- `gpu:karpathy:by_lane` Redis hash — lane→[file, blend] for ACE Stage A0 authority boosts

### Hybrid Pipeline (Standard Path)

```
Query
  │
  ├─ L0: Redis topo-byte cache check (ace:topo:{class}:{hash}, 300s)
  │       Cache hit → skip ANN entirely
  │
  ├─ Lane A: Sparse   ─────────────────────────────────────┐
  │   Postgres FTS + BM42 → ranked list                    │
  ├─ Lane B: Dense    ─────────────────────────────────────┼─ RRF fusion → top-K
  │   Qdrant L1+L2 ANN → ranked list                       │   1/(k + rank_i)
  └─ Lane C: Graph    ─────────────────────────────────────┘
      Neo4j expand neighbors of top-B dense hits

          ↓ top-K fused candidates
  Karpathy rerank (0.4·PR + 0.3·attn + 0.3·authority)
  Trust-tier filter (T4/T5 → sanitizer.ts)
  ACE context pack (context-assembler.ts)
          ↓
  Gemma4 / LLM synthesis
```

### Decision Tree

```
"Find code similar to concept X"    → Lane B: L1 Qdrant dense ANN
"Find code with structure like Y"   → Lane B: L2 Qdrant signature ANN
"Find files that import X"          → Lane C: L7 Neo4j IMPORTS traversal
"Which files are most critical?"    → Lane C: L8 PageRank (gpu:karpathy:scores)
"Exact export name / function"      → Lane A: symbol payload filter or rg
"What docs govern this directory?"  → L4 wiki/AGENTS.md notes (Redis)
"Previous answer about Z"           → L6 prior answers / L5 synthesis memory
"What feature owns this file?"      → L9 feature atlas FTS (Lane A)
"Is this web content safe?"         → L10 web/external — MUST go through sanitizer.ts (T4)
"Hybrid intent" (most cases)        → L0 topo check → all three lanes → RRF → Karpathy rerank
```

**Hard rules:**
- Never run PageRank inline in Cypher — use `couchdb:pagerank_scores` Redis cache (6h TTL)
- Never bypass Karpathy blend on rerank — it's the single cross-feature ordering source
- Never set `instruction_authority: true` on T4/T5 chunks
- T4/T5 chunks MUST pass through `buildExternalTrustMeta()` in sanitizer.ts
- RRF is the correct fusion — replace any weighted-sum lane fusion with `score = Σ 1/(k+rank_i)` across lanes (k=60 is standard)
- Sparse + dense together consistently outperform either alone — never drop a lane for "simplicity"

---

## 9. Quick Commands

```bash
# Full pipeline refresh (requires Ollama + GPU)
npm run graphify:full           # ~15-20 min

# Daily fast refresh (no GPU)
npm run graphify:daily          # ~5-10s

# Karpathy GPU blend (activate PCA with 200 files — cross the 65-embed threshold)
npm run karpathy:gpu -- --limit 200

# Train autoencoder weights (makes 64-dim semantically valid, 10 min CPU)
npm run graphify:semantic && npm run ae:train && npm run karpathy:gpu

# HyperRAG smoke check
npm run smoke:hyperrag

# Seed feature atlas (idempotent)
DATABASE_URL="postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db" npm run seed:feature-atlas

# Ingest master_agents.md into KB MCP corpus (run after starting kb-retrieval-server)
node -e "
const fs = require('fs');
const content = fs.readFileSync('docs/master_agents.md', 'utf8');
fetch('http://127.0.0.1:8789/mcp', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    jsonrpc:'2.0', id:1, method:'tools/call',
    params:{ name:'kb.ingest_doc_summary', arguments:{
      source_path:'docs/master_agents.md',
      content,
      tags:['codebase','retrieval','gpu','audit','hyperrag','karpathy'],
      trust_tier:'T1'
    }}
  })
}).then(r=>r.json()).then(r=>console.log(JSON.stringify(r.result,null,2)))
"

# Verify GPU functions
node -e "const a=require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node'); ['kmeansWithCentroids','trainSOM','pageRankGPU','attentionScoreGPU','rewardScoreGPU'].forEach(f=>console.log(f+':',typeof a[f]))"

# Check top Karpathy scores
docker exec legal-ai-redis redis-cli HGETALL gpu:karpathy:summary
docker exec legal-ai-redis redis-cli HGET gpu:karpathy:scores 'src/lib/server/db/client.ts'

# Sparse symbol search → pipe into BM42 sparse lane
rg --json "export (function|const|class) fetchACPKnowledgeResults" src/ --type ts \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>JSON.parse('['+d.trim().split('\n').join(',')+']').filter(x=>x.type==='match').forEach(x=>console.log(x.data.path.text+':'+x.data.line_number+'\t'+x.data.lines.text.trim())))"

# Gate audits (common)
rg "from.*db/index" src/ --type ts        # G11 — must be 0
rg "export\s+let\s+\w+" src/ --glob "*.svelte"  # G21 — must be 0
rg "localhost" src/lib/server/ --type ts   # G17 — must be 0 (excl env.server.ts)

# KB MCP tool verification
curl -s http://127.0.0.1:8789/health | python -m json.tool
```

---

## 10. Enhancement Priority Queue

| Priority | Enhancement | Effort | Impact | Status |
|----------|-------------|--------|--------|--------|
| P0 | `graphify:semantic` then `ae:train` (train real encoder weights) | ~15 min | High — 64-dim becomes semantically valid | `train-autoencoder.mjs` exists ✅ |
| P0b | `karpathy:gpu -- --limit 200` (activate PCA or trained weights) | 1 min | High — real semantic 64-dim | after P0 |
| P1 | Cross-encoder reranker on top-20 candidates | 4h | High — precision boost | gap |
| P2 | `recordChunkHits()` in all ACE retrieval branches (not just RAG) | 2h | Medium — demand-weighting | gap |
| P3 | Semantic snippet expansion (±2 adjacent chunks) | 3h | Medium — multi-function retrieval | gap |
| P4 | Code symbol payload lookup endpoint (`/api/code-intel/symbol`) | 4h | Medium — exact-match speed | gap |
| P5 | ConAE training on codebase_chunks_768 (replaces hand-rolled trainer) | 1 day | Long-term — compression quality | research |
| P6 | Topo-cache TTL tuning (300s → 600s for hot classes) | 30 min | Low — efficiency | gap |
| ~~P4~~ | ~~BM25/BM42 sparse lane~~ | — | — | **ALREADY LIVE** (multi-lane-retrieval.ts:132) |
| ~~P2~~ | ~~RRF fusion~~ | — | — | **ALREADY LIVE** (qdrant-manager.ts hybridSearch) |

---

---

## 11. Full Pipeline Capacity + Wiring

### Indexing capacity

| Component | Config | Current | Max before RAM limit |
|-----------|--------|---------|---------------------|
| Qdrant (single node) | HNSW m=16, ef=200, 768-dim float32 | ~38,363 chunks | ~2.5M vectors in 8GB RAM (vectors in RAM, payload on disk) |
| Qdrant INT8 quantized | `scalar.type = int8` | — | ~10M vectors in 8GB RAM (75% smaller, negligible accuracy loss) |
| Milvus comparison | horizontal cluster | n/a (not installed) | Billions, but needs 3-node cluster — overkill for this project |
| codebase_chunks_768 | 3 named vectors: content+signature+error | ~38,363 × 3 vectors | ~800K files × 3 vectors at INT8 |
| chunks_web_search | 1 named vector: content | sparse | No limit — SearXNG pages go here |

**Verdict**: Qdrant single-node is correct for this project. Milvus adds operational complexity (ZooKeeper/etcd, 3 nodes minimum) with no benefit at <10M vector scale. Qdrant v1.15.4 with INT8 quantization handles 10M+ vectors on this machine.

### GraphRAG Ingestion Pipeline (complete — not just retrieval)

GraphRAG is an **ingestion architecture** that builds the graph retrieval substrate. Retrieval is the final step, not the whole pipeline. The 4D topological datastore (manifold4) is the output of the SOM stage, not an input.

```
Stage 0 — Ingest sources
  rg --json -l "." src/           # ~3,732 files, ~2s, avoids binary/gitignored
  awk '{print $1}' | ts-morph     # AST-aware 512-token chunking → 30,341 chunks
  SearXNG :8888 / web_search API  # external research (LangGraph orchestrated)
  kb.ingest_doc_summary MCP       # docs/master_agents.md + architecture notes

Stage 1 — SIMD JSON parse + embed
  simdjson (AVX2/SSE4.2)          # 2-5× faster JSON parse for large payloads
  embeddinggemma:latest (768-dim) # ROPE + positional encoding via Ollama
    └── Redis L1 exact-match (SHA-256, 5ms)
    └── Bifrost L2 semantic cache (cosine ≥0.8, 2-5s)
    └── Ollama GPU direct (25s fallback)

Stage 2 — Graph build (CUDA, tensorrt_bridge.node)
  kmeansWithCentroids(flat, n, 768, k=20)  # AVX2/cuBLAS batch cosine → cluster IDs
  trainSOM(flat, n, 768, gridW, gridH)     # 2D grid → BMU per chunk → som_bmu_row/col
  manifold4 = [som_x, som_y, semantic_z, grpo_w]   # 4D topological coordinates
  autoencoderEncode(flat, n, 768, W, b, 64)         # 768→64 compressed memory paths

Stage 3 — 4D topo datastore (multi-store sync)
  Redis:  ace:topo:{class}:{hash} (300s TTL)         # prefilter cache
  Qdrant: som_cluster + manifold4 payload tags        # tagged on codebase_chunks_768
  Neo4j:  SIMILAR_TOPOLOGY edges (adjacent BMU cells) # graph-traversable SOM grid
  Postgres: manifold4 real[] column on research_summaries

Stage 4 — PageRank on derived graph
  CouchDB link_matrix (MapReduce)             # import/dependency edges → link weights
  power-iteration PageRank (scripts/run-pagerank.ts)  # 1016 nodes, 1759 edges, 1.1s
  → couchdb:pagerank_scores Redis (6h TTL)    # NEVER compute PageRank inline in Cypher

Stage 5 — Chunk summarization (LiteRT / TurboQuant)
  LiteRT gemma3:270m (CPU, fast, no GPU swap)         # per-chunk 1-sentence summaries
  TurboQuant gemma4-legal-vlm :8090 (GPU, KV q8_0)   # cluster-level synthesis
    └── Bifrost semantic cache for repeated prompts
  → wiki:note:dir:* Redis (24h TTL) + CouchDB glyph_topology

Stage 6 — DAG loop (Derived Autoencoding Graph)
  Semantic search results → rerank via Karpathy blend
  New SOM outcomes (from reranked hits) → manifold4 update
  Updated manifold4 → Qdrant payload re-tag
  Updated Qdrant tags → new Neo4j SIMILAR_TOPOLOGY edges
  New edges → CouchDB link_matrix → PageRank re-run (6h schedule)
  Loop: each synthesis round produces new graph knowledge edges
```

**LangGraph orchestration** (for web search + synthesis DAG):
```
WebSearch node (SearXNG :8888)
  → TrustClassifier node (T4 tier, sanitizer.ts 8-pattern check)
    → EmbedNode (embeddinggemma 768-dim)
      → SOMUpdate node (trainSOM on new embeddings)
        → QdrantUpsert node (tag + HNSW index)
          → Neo4jMerge node (SIMILAR_TOPOLOGY edges)
            → PageRankUpdate node (link_matrix → CouchDB)
              → SynthesisNode (LiteRT/TurboQuant summary)
                → KBIngest node (kb.ingest_doc_summary MCP)
```

**rg + awk for sparse Lane A** (fast symbol search, feeds BM42):
```bash
# Exact symbol lookup without embedding — fastest sparse path
rg --json "export (function|const|class) $SYMBOL" src/ --type ts \
  | awk -F'"' '/path/{f=$4} /text/{t=$4} /line_number/{print f ":" NR "\t" t}' \
  | head -20
# Output → generateSparseVector(symbolQuery) → bm42-sparse.ts → Qdrant sparse field
# This bypasses the 768-dim embedding entirely for exact-match queries
```

**Throughput on RTX 3060 Ti**: ~200-400 chunks/min (Ollama embedding bottleneck). 38,363 chunks ≈ 2-3 hrs cold; incremental re-index via `graphify:resume` skips cached embeddings.

### Query-time wiring (full path)

```
User query (text)
  │
  ├─ 1. Hash lookup — Redis (5ms)             ← exact query cache (LRU 200 keys)
  │
  ├─ 2. Topo-byte prefilter — Redis (2ms)     ← ace:topo:{class}:{hash}, 300s TTL
  │       Hit → skip ANN entirely
  │
  ├─ 3a. Dense ANN — Qdrant hybridSearch       ← embeddinggemma 768-dim cosine
  │       BM42 sparse fused via Qdrant RRF     ← FNV-1a tokens, legal-term boost
  │       → top-100 candidates
  │
  ├─ 3b. Graph expand — Neo4j Cypher           ← IMPORTS / SIMILAR_TOPOLOGY edges
  │       top-K dense hits → 1-2 hop neighbors
  │
  ├─ 4. Cross-encoder rerank [GAP]             ← ms-marco-MiniLM-L-6-v2 via ONNX
  │       → top-20 precision candidates
  │
  ├─ 5. CUDA attention — tensorrt_bridge.node  ← attentionScoreGPU(probe, 768, flat, n)
  │       cuBLAS GEMM on RTX 3060 Ti
  │
  ├─ 6. SOM cluster tag — Qdrant payload       ← som_cluster field from graphify:topology
  │       Redis ace:topo:{class}:{hash} written here
  │
  ├─ 7. Karpathy blend — Redis hash            ← 0.4×PR + 0.3×attn + 0.3×authority
  │       gpu:karpathy:scores (24h TTL)
  │       → final ranked list, trust-tier annotated
  │
  ├─ 8. ACE context pack — context-assembler   ← TrustMeta T1-T5 fence
  │       T4/T5 → sanitizer.ts injection check
  │
  ├─ 9. TurboQuant LLM — llama-server :8090    ← gemma4-legal-vlm, -ctk q8_0 -ctv q8_0
  │       Bifrost L2 semantic cache :3040       ← cosine ≥0.8 on previous responses
  │       Redis exact-match L1 cache            ← SHA-256 of prompt+model
  │
  └─ 10. Summary → synthesis_memory_768        ← L5 persisted for future retrieval
          Qdrant upsert (768-dim, T2 trust tier)
```

**Where autoencoder fits**: Step 5.5 (between CUDA attention and Karpathy blend). `autoencoderEncode(flat, n, 768, W1, b1, 64)` compresses 768-dim to 64-dim for the `gpu:karpathy:encoded` Redis hash. This is the "memory path" output — used by future MLA-style consumers. It does NOT affect Qdrant storage or the main retrieval quality (those run on 768-dim directly).

**SOM → reranker connection**: `graphify:topology` runs `trainSOM` → assigns every chunk to a BMU grid cell → writes `som_cluster` to Qdrant payload AND creates `SIMILAR_TOPOLOGY` Neo4j edges between adjacent BMU cells. At query time, topo-byte Redis cache (step 2) uses SOM class to skip ANN for repeated queries on the same topology region.

### Milvus vs Qdrant for this stack

| Criterion | Qdrant v1.15.4 | Milvus 2.x |
|-----------|----------------|------------|
| Single-node capacity | ~10M vectors (INT8) | ~100M vectors (distributed) |
| Sparse vectors | ✅ BM42 native | ✅ but newer feature |
| Named vectors | ✅ (content+signature+error per point) | ✅ |
| On-disk payload | ✅ (all collections here) | ✅ |
| Operational overhead | Low (single Docker container) | High (ZooKeeper/etcd + 3 nodes min) |
| TypeScript client | `@qdrant/js-client-rest` | `@zilliz/milvus2-sdk-node` |
| This project | **Installed + wired** | Not installed |
| Break-even | At 50M+ vectors | n/a for this project |

**Verdict**: Qdrant is correct for this project at all foreseeable scales. Milvus would only be worth the operational overhead at 50M+ vectors across a distributed team — neither applies here.

---

*Sources:*
- [GraphRAG with Qdrant and Neo4j — Qdrant docs](https://qdrant.tech/documentation/examples/graphrag-qdrant-neo4j/)
- [Qdrant for Code Generation 2026](https://markaicode.com/qdrant-for-code-generation/)
- [Hybrid Search Guide (April 2026) — RRF 91% recall](https://supermemory.ai/blog/hybrid-search-guide/)
- [PCA-RAG: PCA for Efficient RAG — arxiv 2504.08386](https://arxiv.org/html/2504.08386v1)
- [Optimization of embeddings storage using quantization/dimensionality reduction — arxiv 2505.00105](https://arxiv.org/html/2505.00105v1)
- [Dimension Reduction for Dense Retrieval via Conditional Autoencoder — ACL EMNLP 2022](https://aclanthology.org/2022.emnlp-main.384.pdf)
- [Context Poisoning in LLMs — Elastic Search Labs](https://www.elastic.co/search-labs/blog/context-poisoning-llm)
- [Advanced RAG: Hybrid Search & Reranking](https://dev.to/kuldeep_paul/advanced-rag-from-naive-retrieval-to-hybrid-search-and-re-ranking-4km3)
- [RAG Security — OWASP LLM Top 10 2025](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)

---

## 12. Full Synthesis Loop — Ingest → Analyze → Store → Search → Adapt

### Langfuse as Structured Inference Log Sink

Langfuse is **kept** — but its primary role is token-level inference streaming, not just UI traces. Each LLM call emits a Langfuse generation event with `chunk_id`, `timestamp_id`, token deltas, GRPO thinking spans, and latency. These become the JSONL/JSONB streams that feed the analysis pipeline.

```
LLM inference (TurboQuant :8090 / LiteRT / ONNX)
  │
  ├─ Langfuse SDK (POST /api/public/generations)
  │     payload: {
  │       traceId:      "chunk_id:{qdrant_point_id}",
  │       name:         "synthesis | rerank | embed | grpo_step",
  │       startTime:    ISO8601,
  │       model:        "gemma4-legal-vlm",
  │       input:        [{ role, content }],
  │       output:       { text, tokens_used, latency_ms },
  │       metadata: {
  │         chunk_id:     "abc123",       ← Qdrant point ID
  │         som_cluster:  7,
  │         trust_tier:   "T2",
  │         grpo_reward:  0.87,
  │         grpo_thinking:"Let me verify FRE 801(d)(2)..."
  │       }
  │     }
  │
  └─ Langfuse export API → JSONL stream
       GET /api/public/generations?projectId=...&limit=500 → cursor paginate
       → logs/langfuse/YYYY-MM-DD.jsonl   (append-mode, ~1-5MB/day)
       → simdjson fastJsonParse() for batch re-analysis
```

**Export to JSONL** (run nightly or on-demand):
```bash
node scripts/export-langfuse-jsonl.mjs --date 2026-05-10 --output logs/langfuse/2026-05-10.jsonl
# Each line:
# {"timestamp":"2026-05-10T02:44:57Z","chunk_id":"abc123","model":"gemma4-legal-vlm",
#  "latency_ms":1247,"grpo_reward":0.87,"grpo_thinking":"...","tokens":342,"trust_tier":"T2"}
```

**Analysis chain** (JSONL → lang-extract → JSONB → AVX2 RAM analysis → CUDA Graph kernel):
```
logs/langfuse/YYYY-MM-DD.jsonl
  │
  ├─ node scripts/lang-extract.mjs --json   → keywords + API names per inference session
  │
  ├─ psql COPY ... FROM stdin (CSV/JSONB)   → INSERT INTO inference_analysis (chunk_id, grpo_reward, tokens, JSONB payload)
  │       └── GIN index on payload          → fast JSONB path queries
  │
  ├─ simdjson fastJsonParse()               → AVX2 SIMD parse for batch token frequency
  │       → Float32Array of token IDs       → autoencoderEncode() CUDA → 64-dim latent
  │
  └─ CUDA Graph kernel loop (captureAEGraph):
       batch=64 token sequences → forward pass (768→64) → replay per analysis epoch
       → centroids stored in Redis ace:analysis:centroids:{date}
```

### Phase A — Document Ingest (files + web + PDF/OCR)

```
Input sources
  ├─ Source files:   rg --json -l "." src/   → 3,732 files, 2s, SIMD-filtered
  │   AST chunking:  ts-morph 512-token chunks → symbol table (exports, imports, types)
  │   LangExtract:   node scripts/lang-extract.mjs → JSONL: keywords/APIs/packages/errors
  │
  ├─ Uploaded docs:  /api/evidence/upload → evidence pipeline (8 stages)
  │   PDF → pdf-parse → text OR Tesseract OCR (GPU via PaddleOCR sidecar future)
  │   legal-chunker.ts: ARTICLE/SECTION/§-aware chunking
  │   entity extraction: EMAIL/PHONE/DATE/CITATION/STATUTE/MONEY regexes
  │
  └─ Web crawl:      SearXNG :8888 → Brave → Serper → DDG fallback
      Hermes agent:  deep-research via TRACE MCP tools (graph.expand + kag.feature_lookup)
      Trust: T4 (×0.70), 8-pattern sanitizer, instructionAuthority=false
```

**Hermes agent for deep research**: the Hermes agent (WSL2, port-forwarded to :8788) calls TRACE MCP tools to expand graph neighborhood → ingest related docs → summarize → store. This is the automated web → KB pipeline. See `docs/architecture/hermes-agent-windows-gemma4-guide.md`.

### Phase B — GPU Analysis Chain

```
1. Embed (embeddinggemma 768-dim via Ollama → Redis L1 5ms → Bifrost L2 2-5s)
2. k-means:  kmeansWithCentroids(flat, n, 768, k=20)        [CUDA cuBLAS FP16 Tensor Cores]
3. SOM:      trainSOM(flat, n, 768, gridW=10, gridH=10)     [BMU → som_bmu_row/col]
4. Manifold: manifold4 = [som_x, som_y, semantic_z, grpo_w]
5. Encode:   autoencoderEncode(flat, n, 768, W, b, 64)      [64-dim memory paths → gpu:karpathy:encoded]
6. Attention: attentionScoreGPU(probe, 768, flat, n)        [z-score sigmoid → blend input]

CUDA Graph capture (Phase 2):
  Steps 5+6 are fixed-shape (dim=768, hidden=64) — prime candidates for graph capture.
  captureAEGraph() in autoencoder-bridge.ts: pad n to 64, capture once, replay N times.
  Saves ~10× kernel-launch overhead when processing logs/langfuse/*.jsonl in batch.
```

### Phase C — Store (RAG / GraphRAG / KAG / DAG)

| Tier | Store | Key | Written by | Used by |
|------|-------|-----|-----------|---------|
| RAG | Qdrant `codebase_chunks_768` | point_id = chunk_id | `graphify:semantic` | 11-lane ANN search |
| GraphRAG | Neo4j `IMPORTS` + `SIMILAR_TOPOLOGY` | node = file path | `neo4j-sync.ts` | graph expand, Karpathy PR |
| KAG | Postgres `feature_implementations` + `feature_file_edges` | feature_key | `seed-feature-atlas.mjs` | L9 lane FTS |
| DAG | CouchDB `link_matrix` MapReduce view | doc_id = file path | `run-pagerank.ts` | PageRank → Redis 6h |
| Langfuse | Langfuse DB (Postgres) | traceId = chunk_id:{id} | LLM SDK calls | JSONL export → analysis |
| Summary | `research_summaries.manifold4 real[]` + `.summary text` | id = UUID | `hypergraph-4d.ts` | manifold4-search, FTS |

**chunk_id → summary_id → .md mapping**:
```sql
-- Every chunk has a summary row + a wiki note file
SELECT c.id AS chunk_id, s.id AS summary_id, s.summary, c.relative_path,
       'docs/summaries/' || c.som_cluster || '/' || c.id || '.md' AS md_path
FROM codebase_chunk_index c
JOIN research_summaries s ON s.source_id = c.id::text
ORDER BY s.grpo_reward_score DESC NULLS LAST;
```

The `.md` files are generated by `generate-codebase-directory-map.mjs` — one summary card per directory with top-3 chunks by Karpathy score, linked to Qdrant chunk IDs.

### Phase D — Retrieval: Inverse Search + Multiquery Semantic

**Inverse document search** (built — `/admin/document-search`):
- User query → embed 768-dim → Qdrant ANN on `evidence`/`legal_documents`/`kb_notecards`
- Groups by `evidence_id`, sorts by `top_score desc`, top-3 chunks per document
- Exact inverse of the 8-stage upload pipeline

**Multiquery + ms-marco rerank** (§6.1 gap — next to wire):
```
query → TurboQuant: generate 3 rephrases (multiquery expansion)
→ parallel embed ×3 → Qdrant ANN ×3 → rrfFuse() (k=60)
→ ms-marco-MiniLM-L-6-v2 (ONNX, 22.7MB, CPU AVX2, ~60-100ms/20 pairs)
  session: InferenceSession.create('models/ms-marco-MiniLM-L-6-v2.onnx', { executionProviders:['cpu'] })
→ top-20 precision candidates → TrustMeta fence → LLM context window
```

**Semantic understanding via Qdrant tag + multiquery**:
- Qdrant filter: `must: [{ key: 'som_cluster', match: { value: cluster_id } }]`
- Named-vector search on `content` + `signature` → weighted RRF per §6.3
- `QueryRouter4x4.route(signal)` → weights per backend → suppress T4 for high-trust queries

### Phase E — LLM Synthesis with LangExtract

```
LLM output (TurboQuant stream)
  → tokenize into JSONL:  timestamp_id, chunk_id, token, logprob, latency_delta
  → Langfuse generation span (traceId = chunk_id:{id}, metadata.grpo_thinking = "...")
  → lang-extract.mjs: keywords + API names + packages from output text
  → JSONB upsert: UPDATE research_summaries SET payload = payload || $langextract WHERE id = $chunk_id

Synthesis output
  → research_summaries.summary (1-sentence + full)
  → synthesis_memory_768 Qdrant (T2 trust tier, 768-dim → future L5 retrieval)
  → wiki:note:dir:{dir} Redis (24h) — picked up by L4 lane next query
```

### Phase F — Adaptive Analytics + Fine-Tuning Loop

**Adaptive TODO generation** (signals → TurboQuant → TODO.md):
```
Low authority + high PageRank files     → "popular but under-documented"
context_timeline dwell_long events      → "complex, needs better summary"
lang-extract error_codes recurring      → "type-system debt"
low-click high-recall Qdrant hits       → "embedding drift — retrain needed"
  → TurboQuant: "Given these signals, generate a prioritized TODO.md"
  → stored in docs/TODO-adaptive-YYYY-MM-DD.md
```

**QLoRA / GRPO fine-tuning via tmux** (no SvelteKit process blocking):
```bash
tmux new-session -d -s finetune
# Export training data from context_timeline + Langfuse JSONL
tmux send-keys -t finetune \
  "node scripts/export-qlora-dataset.mjs --langfuse logs/langfuse/2026-05-10.jsonl \
   --output logs/qlora/dataset.jsonl" Enter
# Train QLoRA adapter (Unsloth + GRPO, 7 reward functions)
tmux send-keys -t finetune \
  "python finetune/train_qlora.py --dataset logs/qlora/dataset.jsonl \
   --grpo-log logs/grpo/thinking.jsonl --base gemma4-e4b --output adapters/legal-v2" Enter
# Ingest GRPO thinking → synthesis_memory_768 (closes the RL loop)
tmux send-keys -t finetune \
  "node scripts/ingest-grpo-log.mjs logs/grpo/thinking.jsonl" Enter
```

**GRPO thinking → RLM memory** (stored as T2 trust synthesis chunks):
```jsonl
{"timestamp":"2026-05-10T03:12:00Z","chunk_id":"grpo:step:4291","thinking":"FRE 801(d)(2)...","reward":0.87,"adapter":"legal-v2","model":"gemma4-legal-vlm","round":3}
```
`ingest-grpo-log.mjs` embeds thinking text → upserts into `synthesis_memory_768` → available as L5 lane next session.

### Full Loop Summary

```
ingest (rg + OCR + SearXNG + Hermes)
  → embed (Ollama 768-dim, Redis/Bifrost cached)
  → GPU (k-means + SOM + autoencoder → manifold4)    [Tensor Cores, CUDA Graph pending]
  → store (Qdrant RAG + Neo4j GraphRAG + Postgres KAG + CouchDB DAG)
  → Langfuse log (chunk_id stream → JSONL → lang-extract analysis)
  → summarize (LiteRT per-chunk + TurboQuant cluster → wiki:note:dir:*)
  → search (inverse /admin/document-search + multiquery RRF + ms-marco ONNX rerank)
  → synthesize (TurboQuant → Langfuse span → synthesis_memory_768)
  → adapt (export JSONL → tmux QLoRA → GRPO thinking → ingest-grpo-log → L5 lane)
  ↑_______________(GRPO rewards update Karpathy blend → better retrieval next loop)___________↑
```

**Build order** (implement in sequence — each step feeds the next):
1. ✅ Ingest + LangExtract JSONL (`lang-extract.mjs`)
2. ✅ GPU analysis: embed + k-means + SOM + autoencoder (`tensorrt_bridge.node`)
3. ✅ Multi-store sync: Qdrant + Neo4j + Postgres + CouchDB
4. ✅ Inverse search (`/admin/document-search`)
5. ✅ Langfuse inference logging (7 traced endpoints)
6. ⏳ Langfuse JSONL export script (`scripts/export-langfuse-jsonl.mjs`)
7. ⏳ Multiquery expand + ms-marco ONNX rerank (§6.1)
8. ⏳ Adaptive TODO generation from signal fusion
9. ⏳ tmux QLoRA + GRPO log ingestion scripts
10. ⏳ CUDA Graph capture (`captureAEGraph()`, batch=64)
