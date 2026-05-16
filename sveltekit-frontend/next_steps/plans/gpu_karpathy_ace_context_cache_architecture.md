# CUDA Graph + Redis/BitFrost Cache + 4D Topology Retrieval Architecture

**Purpose:** define the next safe design for ACE context retrieval, GPU/Karpathy codebase indexing, Redis/BitFrost-style cache layers, 4D topology transforms, and HMM-style “if not this, then this” agentic error recovery.

**Status:** design note / implementation guide. Do not treat as a green light to run heavy GPU indexing, `buildHypergraph4D()` write jobs, broad Drizzle migrations, or identity migrations.

---

## 0. Executive summary

The best design is **not** “put the whole graph in VRAM” and not “serialize raw LLM KV cache.” The best design is:

```txt
codebase / docs / features / activity
  ↓
Graphify + FeatureMap + AGENTS/Karpathy Wiki
  ↓
Qdrant vectors + Neo4j graph + CouchDB wiki + Postgres JSONB
  ↓
Redis hot cache + BitFrost-style NVMe context packs
  ↓
ACE planner chooses lanes
  ↓
Gemma4/TurboQuant synthesizes from compact context packets
```

CUDA Graphs belong only on **fixed-shape repeated tensor kernels**, such as:

```txt
[batch, 768] → [batch, 64] autoencoder encode
query × candidates cosine batches
fixed topK rerank tensors
fixed SOM/BMU lookup
```

They do **not** belong on:

```txt
rg parsing
file I/O
markdown parsing
Qdrant network calls
Neo4j graph traversal
dynamic variable-length retrieval
```

Redis and BitFrost/NVMe should cache **derived packets**, not native pointers:

```txt
Redis:
  hot scores, centroids, feature packets, AGENTS cards, query traces

NVMe / BitFrost-style cache:
  cold context-pack JSON
  compressed cards
  retrieval traces
  wiki snapshots
```

---

## 1. Source-of-truth constraints

### Do this

- Keep **Qdrant** as the primary semantic/hybrid vector engine.
- Keep **Neo4j** as the GraphRAG / Pentagon multi-hop graph engine.
- Keep **Postgres** as durable JSONB/audit/schema truth.
- Keep **Redis** as hot cache.
- Keep **CouchDB** as Karpathy wiki / MapReduce rollup layer.
- Keep **TurboVec** as a local encoded64 / feature-vector accelerator.
- Keep **Gemma4/TurboQuant** as planner/synthesizer, not storage.

### Do not do this yet

- Do not run `drizzle push`.
- Do not mutate the identity strategy for `cases.user_id` vs `users.id`.
- Do not run `buildHypergraph4D()` as a write job until identity is decided.
- Do not enable CUDA Graph capture until fixed-shape tensor workloads are stable.
- Do not replace Qdrant with TurboVec/cuVS.
- Do not serialize raw llama-server KV cache.
- Do not claim unverified native HMM/Rust bridge shipped unless artifacts exist.

---

## 2. What official docs imply

### CUDA Graphs

NVIDIA CUDA Graphs are right for capturing a stable sequence of GPU work and replaying it. Stream capture brackets existing stream work with `cudaStreamBeginCapture()` and `cudaStreamEndCapture()`, and captured work is appended to an internal graph rather than executed immediately. CUDA Graph launch uses `cudaGraphLaunch(graphExec, stream)`.

For this stack, that means CUDA Graphs are valuable only after the pipeline has stable tensor shapes and reusable buffers.

### Node N-API

Node-API is the correct boundary for the C++/CUDA bridge because it gives ABI stability across Node versions when the addon uses Node-API exclusively. Use this for N-API `.node` modules that expose CUDA/LibTorch kernels to TypeScript.

### Node worker threads

Node worker threads are useful for CPU-heavy JavaScript tasks. They do not help much with I/O-heavy work; built-in async I/O is more efficient there. So use worker pools for parsing/chunking/hashing/metadata, not for Redis/Qdrant/Postgres network operations.

### Qdrant hybrid retrieval

Qdrant hybrid queries support RRF-style fusion. RRF boosts documents that appear near the top across multiple result sets, which maps cleanly to your dense, sparse, graph, wiki, and FeatureMap lanes.

### Redis vector/cache role

Redis supports vector indexes such as HNSW. Redis docs describe HNSW as a multi-layer graph-based approximate nearest-neighbor index, useful for large datasets where search performance/scalability matter more than exact accuracy. In your stack, Redis is still better used as a hot cache and small fast lookup layer than as the canonical vector database.

### Neo4j GraphRAG

Neo4j’s GraphRAG package is official and supports RAG, knowledge graph building, pipelines, vector indexes, and external vector retrievers such as Qdrant. That fits your split: Neo4j for multi-hop structure, Qdrant for vectors.

---

## 3. Memory-tier policy

| Layer | Store | Use for | Do not use for |
|---|---|---|---|
| VRAM | RTX 3060 Ti | active tensor batches, fixed CUDA Graph buffers, encoded64 kernels | durable knowledge |
| CPU RAM | Node/SvelteKit | context assembly, parsing batches, graph JSON, temporary arrays | all-vector permanent index |
| Redis | hot cache | centroids, scores, AGENTS cards, feature packets, query traces | canonical truth |
| BitFrost/NVMe | cold cache | context-pack JSON, compressed cards, retrieval traces, wiki snapshots | per-token hot loop |
| Qdrant | vector DB | dense/sparse/hybrid semantic retrieval, payload filters | graph truth |
| Neo4j | graph DB | multi-hop traversal, dependencies, Feature→File→Route→Proto→Schema | vector ANN hot path |
| CouchDB | wiki/MapReduce | AGENTS/Karpathy wiki docs, link matrix, rollups | online tensor rerank |
| Postgres | durable DB | JSONB feature maps, audit logs, search runs, schema truth | high-speed tensor math |

---

## 4. NES/tile architecture analogy

Think like a 1983 NES cartridge, but for modern retrieval:

```txt
tile        = candidate batch
sprite      = file/chunk/FeatureMap/AGENTS card
nametable   = directory graph / feature graph / wiki map
palette     = feature tags / trust tier / audit status
bank switch = load next corpus shard from Qdrant/NVMe
PPU cache   = Redis hot context and centroids
VRAM        = active tensor batch only
```

Rule:

```txt
Do not load the whole world into VRAM.
Load one tile/batch.
Process it.
Cache the summary/centroid/result.
Evict or reuse buffer.
```

---

## 5. ACE retrieval architecture

### Current target flow

```txt
User query
  ↓
intent classifier / HMM-style state guess
  ↓
ACE planner builds retrieval plan
  ↓
parallel lanes:
  L0 Redis exact/context cache
  L1 rg / sparse / BM42
  L2 Qdrant dense/hybrid search
  L3 Neo4j Pentagon Graph multi-hop
  L4 CouchDB/AGENTS Karpathy Wiki
  L5 FeatureMap / glyph / GRPO memory sticks
  L6 qdrant_docs official documentation
  L7 user.activity / recommendations
  L8 error-fix memory / HMM recovery
  ↓
RRF / score blend
  ↓
MARCO rerank + LangExtract entity density
  ↓
token-aware context packet
  ↓
Gemma4 via TurboQuant
```

### HMM-style “if not this, then this” logic

Use HMM/state-machine logic to guess the recovery lane when retrieval or code repair gets stuck:

```txt
if query mentions compile/type/import:
  state = CODE_ERROR
  prefer lanes = [rg, tsgo diagnostics, imports graph, AGENTS card]

elif query mentions schema/table/column:
  state = DB_DRIFT
  prefer lanes = [Postgres introspection, Drizzle schema, migration audit]

elif query mentions retrieval/rerank/qdrant:
  state = RETRIEVAL_DEBUG
  prefer lanes = [Qdrant payload, ACE traces, FeatureMap, RRF logs]

elif query mentions graph/dependency/proto:
  state = GRAPH_REASONING
  prefer lanes = [Neo4j Pentagon Search, codebase-graph.json, proto extractor]

elif query mentions GPU/CUDA/encoded64:
  state = GPU_PIPELINE
  prefer lanes = [autoencoder docs, Redis weights, Qdrant encoded_64, CUDA smoke]

else:
  state = GENERAL_RESEARCH
  prefer lanes = [wiki.search, qdrant_docs, FeatureMap summaries]
```

Then the agentic workflow becomes:

```txt
observe query
  ↓
classify state
  ↓
try primary lane
  ↓
if insufficient:
    try fallback lane
  ↓
if still insufficient:
    ask for operator decision OR produce bounded plan
  ↓
store selected/rejected source IDs in GRPO memory stick
```

---

## 6. BitFrost / NanoFlow-style cache design

In this repo, “BitFrost cache” should mean **logical context-pack cache**, not native KV tensors.

### Cache key

```txt
cacheKey = sha256(
  modelName +
  modelQuant +
  backend +
  tokenizerHash +
  systemPromptHash +
  toolDefinitionsHash +
  repoGitSha +
  corpusHash +
  ragBundleHash +
  graphSnapshotHash
)
```

### Cache layers

```txt
L1 Redis:
  ace:ctx:{cacheKey}

L2 Postgres:
  llm_context_cache

L3 NVMe:
  .cache/ace/context-packs/{cacheKey}.json
```

### Cache payload

```json
{
  "summary": "...",
  "chunkIds": ["..."],
  "graphPaths": ["..."],
  "featurePackets": ["..."],
  "agentsCards": ["..."],
  "toolPolicy": {
    "allowedTools": ["wiki.search", "trace.kag_search"],
    "writeTools": []
  },
  "createdAt": "ISO",
  "repoGitSha": "...",
  "ragBundleHash": "..."
}
```

### Rule

```txt
Cache text/context decisions, not native pointers.
Cache compact context packets, not hidden reasoning.
Cache selected source IDs, not private chain-of-thought.
```

---

## 7. Redis cluster design for topology and ACE

### Redis key families

```txt
# AGENTS/Karpathy Wiki
agents:dir:{dirHash}
agents:feature:{featureKey}
agents:tag:{tag}
agents:stale

# FeatureMap
feature:summary:{featureId}
feature:glyph:{featureId}
feature:map:{featureId}
grpo:memory:{queryHash}

# ACE context
ace:context:{contextHash}
ace:ctx:{cacheKey}
ace:retrieval:{runId}

# GPU/Karpathy
gpu:karpathy:scores
gpu:autoencoder:centroids_64
gpu:autoencoder:centroids_64:meta

# 4D topology
topology:manifold4:{chunkId}
topology:cluster:{clusterId}
topology:som:{row}:{col}

# Error-fix/HMM
error:fingerprint:{hash}
error:state:{queryHash}
error:fix-pattern:{patternId}
```

### 4D topology record

```json
{
  "chunkId": "src/lib/server/ace/context-assembler.ts#L120-L220",
  "som_x": 11,
  "som_y": 7,
  "semantic_z": 0.63,
  "grpo_w": 0.41,
  "clusterId": 12,
  "featureKeys": ["ace.context", "hyperrag.multi_lane"],
  "updatedAt": "ISO"
}
```

### Use in ACE

```txt
query embedding
  ↓
top semantic hits
  ↓
look up manifold4 and cluster scores
  ↓
boost nearby SOM/4D topology
  ↓
prefer active/hot feature cards
  ↓
build compact context packet
```

---

## 8. Qdrant payload design

Backfill AGENTS and FeatureMap metadata into Qdrant payloads:

```json
{
  "agents_card_id": "agents:dir:src-lib-server-ace",
  "dir_path": "src/lib/server/ace",
  "dir_summary": "ACE context assembly, retrieval lanes, and token-aware packet building.",
  "feature_keys": ["ace.context", "hyperrag.multi_lane", "nanoflow.context_cache"],
  "qdrant_tags": ["ace", "retrieval", "cache", "graph-rag"],
  "audit_status": "SHIPPED",
  "agents_activity_score": 8,
  "feature_glyph_mask": 119,
  "encoded64_version": "ae-2026-05-10",
  "manifold4": [11, 7, 0.63, 0.41],
  "trust_tier": "local_code_truth"
}
```

This lets Qdrant filters narrow context before expensive reranking:

```txt
filter:
  feature_keys contains "ace.context"
  audit_status in ["SHIPPED", "PARTIAL"]
  trust_tier = "local_code_truth"
```

---

## 9. CUDA Graph implementation targets

### Good candidates

```txt
autoencoderEncodeGraph:
  input shape [256, 768]
  output shape [256, 64]

batchCosineGraph:
  query [1, 768]
  candidates [4096, 768]
  output [4096]

topKGraph:
  scores [4096]
  output topK indices

somBmuGraph:
  query [1, 64]
  centroids [20, 64]
  output top cluster IDs
```

### C++/N-API shape

```cpp
// Pseudocode only.
class CudaGraphCache {
  cudaGraph_t graph;
  cudaGraphExec_t exec;
  cudaStream_t stream;

  torch::Tensor inputBuffer;
  torch::Tensor outputBuffer;

  bool captured = false;
};

Napi::Value AutoencoderEncodeGraph(const Napi::CallbackInfo& info) {
  // 1. Validate fixed shape.
  // 2. Copy Float32Array into preallocated inputBuffer.
  // 3. If not captured: warmup + cudaStreamBeginCapture + ops + cudaStreamEndCapture.
  // 4. Else cudaGraphLaunch(exec, stream).
  // 5. Copy outputBuffer to Float32Array.
}
```

### TypeScript wrapper

```ts
export async function autoencoderEncodeGraph(
  batch: Float32Array,
  opts: { n: 256; dim: 768; outDim: 64 }
): Promise<Float32Array>;
```

### Guardrails

- Capture only after normal GPU path is already green.
- Only fixed shapes.
- Use reusable buffers.
- Fallback to normal `autoencoderEncode()`.
- Do not capture variable Qdrant/RG/Neo4j work.
- Do not capture graph traversal.

---

## 10. Agentic error recovery workflow

### Goal

When Gemma4 or Claude Code gets stuck, ACE should recover by checking structured signals instead of asking the LLM to guess blindly.

### Workflow

```txt
1. Capture failure
   - compile error
   - missing import
   - schema mismatch
   - no retrieval hits
   - low confidence synthesis
   - failed test

2. Normalize fingerprint
   - error kind
   - file path
   - symbol/table/route
   - stack trace signature
   - query intent

3. HMM/state classifier
   - CODE_ERROR
   - DB_DRIFT
   - RETRIEVAL_DEBUG
   - GRAPH_REASONING
   - GPU_PIPELINE
   - DOCS_MISMATCH

4. Retrieve likely fixes
   - rg exact error text
   - FeatureMap by feature key
   - AGENTS card for directory
   - GraphRAG neighbors
   - previous GRPO memory sticks
   - official docs if external API involved

5. Generate bounded plan
   - “if not this, then this”
   - exact files to inspect
   - commands to run
   - tests to verify

6. Store outcome
   - selectedSourceIds
   - rejectedSourceIds
   - rewardSignals
   - cacheKeys
```

### Example

```txt
Error: Cannot find module '$lib/services/foo'

HMM state:
  CODE_ERROR

Primary lane:
  service move audit / rg stale import paths

Fallback:
  codebase-graph import edges

Plan:
  if '$lib/services/foo' moved:
    replace with '$lib/server/services/foo'
  else:
    inspect barrel exports
  run svelte-check
```

---

## 11. Recommended implementation order

### Now

```txt
1. Finish `resolveContextCacheSources()` tests.
2. Add NanoFlow-style context cache README note.
3. Finish `agents:qdrant:backfill` dry-run safety.
4. Add `wiki.status` and `wiki.search` MCP tools.
5. Add Knowledge Base Manager lane health panel.
```

### Next

```txt
6. Backfill AGENTS card metadata into Qdrant payloads.
7. Add RG-Atlas run/hit persistence.
8. Add FeatureMap compact packets to ACE context assembly.
9. Add HMM error recovery state classifier.
10. Add GRPO memory stick write on fix/retrieval outcome.
```

### Later

```txt
11. encoded_64 Qdrant backfill in dry-run.
12. Redis 64d centroids.
13. Stage A0 encoded prefilter in shadow mode.
14. CUDA Graph capture for fixed-shape autoencoder/cosine batches.
15. 4D topology write jobs after identity strategy is decided.
```

---

## 12. Concrete TODO cards

### TODO A — ACE context cache

```txt
File:
  src/lib/server/ace/llm-context-cache.ts

Add:
  resolveContextCacheSources()

Tests:
  tests/unit/llm-context-cache.test.ts

Verify:
  npx vitest run tests/unit/llm-context-cache.test.ts
```

### TODO B — AGENTS Qdrant payload

```txt
Script:
  scripts/agents/backfill-qdrant-payload.mjs

Command:
  npm run agents:qdrant:backfill -- --dry-run --limit 100

Payload:
  agents_card_id
  dir_summary
  feature_keys
  qdrant_tags
  audit_status
  agents_activity_score
```

### TODO C — RG-Atlas

```txt
Tables:
  rg_search_runs
  rg_search_hits

Pipeline:
  rg → persisted hits → Qdrant semantic join → Redis Karpathy score → RRF → ACE packet
```

### TODO D — HMM recovery

```txt
File:
  src/lib/server/ace/hmm-recovery-router.ts

Input:
  query + error fingerprint + retrieval trace

Output:
  state
  primary lanes
  fallback lanes
  confidence
  recommended next commands
```

### TODO E — CUDA Graph

```txt
File:
  simd-bridge/cpp/cuda_graph_autoencoder.cc

Expose:
  autoencoderEncodeGraph()

Only for:
  fixed [256,768] → [256,64] batches
```

---

## 13. Final architecture

```txt
Hermes / Chat / Claude Code
  ↓
TRACE MCP / SvelteKit API
  ↓
ACE planner
  ├─ context cache: Redis → Postgres → NVMe JSON
  ├─ wiki search: Redis/CouchDB/Qdrant
  ├─ graph search: Neo4j Pentagon Search
  ├─ feature memory: FeatureMap + GRPO stick
  ├─ docs lane: qdrant_docs
  ├─ error recovery: HMM router
  └─ tensor lane: encoded64 + CUDA Graph later
  ↓
token-aware packet
  ↓
Gemma4 / TurboQuant
  ↓
answer + trace + selected/rejected sources
  ↓
GRPO memory stick + cache update
```

---

## 14. Key decision

**Do not optimize CUDA first.** Finish the cache and retrieval substrate first.

The order is:

```txt
correct context
  → durable trace
  → hot cache
  → semantic + graph + wiki fusion
  → HMM recovery
  → encoded64 prefilter
  → CUDA Graph replay
```

That order gives Gemma4 better context immediately and preserves a clean path to RTX acceleration later.

---

## Source anchors

- NVIDIA CUDA C++ Programming Guide — CUDA Graphs, stream capture, and `cudaGraphLaunch`.
- Node.js Node-API documentation — ABI-stable native addon boundary.
- Node.js worker_threads documentation — CPU-heavy JS parallelism and worker-pool guidance.
- Qdrant hybrid queries documentation — RRF fusion.
- Redis vector search documentation — HNSW index behavior and scale/performance tradeoffs.
- Neo4j GraphRAG Python documentation — official GraphRAG package and Qdrant external retriever support.
- Repo handoff notes — FeatureMap/GRPO/NES glyph pipeline and NanoFlow-style ACE context cache.
