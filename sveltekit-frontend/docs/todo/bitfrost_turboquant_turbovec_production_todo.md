# BitFrost + TurboQuant + TurboVec Production Optimization TODO

**Purpose:** Explain what is working now, what TurboVec/TurboQuant/BitFrost each do, and the production optimization path for local Gemma4 inference, ACE context caching, retrieval, and agent orchestration.

**Scope:** Windows 10 + RTX 3060 Ti + SvelteKit + TRACE MCP + Redis + Postgres + Qdrant + Neo4j + CouchDB + TurboQuant/llama-server + Ollama.

---

## 1. Current Working State

### 1.1 TurboQuant / llama-server inference is working

The current inference lane is:

```text
Gemma4 / RotorQuant GGUF
  → TurboQuant / llama-server
  → OpenAI-compatible /v1/chat/completions
  → ACE / OpenAI facade
  → chat / synthesis / FeatureMap summaries
```

Recent runtime state:

```text
Endpoint: http://127.0.0.1:8090
Mode: text-only
Speculative decoding: enabled
KV cache: q8_0 / q8_0
Vision/mmproj: disabled automatically because draft model is active
```

Real 64k behavior comes from keeping ACE/Redis as the compact memory layer and
feeding TurboQuant smaller, curated context packets instead of giant prompt
dumps.

This is enough for:

- ACE context-pack synthesis
- Gemma4 text generation
- FeatureMap summaries
- Karpathy wiki summaries
- Hermes text planning
- Claude Code / local agent handoff briefs

It is **not** the right runtime for image/video/VLM work when speculative decoding is enabled.

Use Ollama or a separate non-draft VLM server for image/video analysis.

Later backlog item:

- keep ACE/Redis as the compact memory layer
- feed TurboQuant curated context packets instead of giant prompt dumps
- enforce this as the default 64k behavior for:
  - ACE context-pack synthesis
  - Gemma4 text generation
  - FeatureMap summaries
  - Karpathy wiki summaries
  - Hermes text planning
  - Claude Code / local agent handoff briefs

Memory tuning now in place:

- [x] shared Node heap wrapper added: `scripts/with-node-memory.mjs`
- [x] memory-heavy scripts use the wrapper on the main dev/check/build lanes
- [x] VS Code TypeScript server memory aligned to 12 GB
- [x] copy-paste memory commands documented in `docs/startup.md`
- [x] `npm run check` now includes the WebGPU/PageRank smoke (`scripts/smoke-compute-worker-gpu.mjs`) so Karpathy/ACE/Redis/BitFrost/KAG multi-hop errors surface in the main check path
- [x] PageRank/WebGPU smoke now writes `logs/webgpu-pagerank/latest.json` for multi-hop error review instead of only printing to console

Launcher/model discovery note:

- The launcher now resolves the actual repo-local runtime paths when older fallbacks are missing:
  - `tools\\llama-server\\llama-server.exe`
  - `vendor\\models\\gemma4-legal.gguf`
  - `vendor\\models\\mmproj-gemma4.gguf`
- The missing-model regression is now covered by the smoke path below.
- The `/v1/models` check should confirm `gemma4-legal.gguf` is visible before we call the launch path healthy.
- `npm run turbo:smoke` now probes `/health`, `/v1/models`, and `/v1/chat/completions`, confirms the response contains `turboquant-ok`, records `latencyMs`, captures prompt/completion tokens when available, and writes `logs/turboquant/health-latest.json`.
- TurboQuant launcher stabilization checklist:
  - [x] fix launcher path resolution
    - include `tools/llama-server/llama-server.exe`
    - fallback to `vendor/models` and `models/`
  - [x] add GGUF discovery logic
    - `gemma4-legal.gguf`
    - `iq4xs` variants
    - `mmproj` fallback
  - [x] confirm health check behavior
    - launcher short-circuits if `:8090` is already alive
  - [ ] add explicit mode flags
    - `--force-restart`
    - `--kill-existing`
    - `--debug-path-resolution`
  - [ ] add logging
    - resolved binary path
    - resolved model path
    - mmproj used
    - skip reason if already running
  - [ ] add validation step
    - verify GGUF exists before launch

Retrieval / storage lane note:

- `npm run dev:grpc` is the retrieval gRPC lane test. It starts TurboQuant, the Go retrieval service, and the frontend with gRPC enabled.
- Qdrant stays split by protocol:
  - REST `:6333` for HTTP health and direct collection inspection
  - gRPC `:6334` for retrieval-service integration
- Qdrant uses the image-supported env vars in `docker-compose.yml`:
  - `QDRANT__SERVICE__HTTP_PORT=6333`
  - `QDRANT__SERVICE__GRPC_PORT=6334`
  - do not replace them with `--grpc-address` CLI flags for this image
- Bifrost vector-store health checks currently expect the gRPC lane on `:6334`; switching that field to `:6333` breaks Bifrost startup in the live container.
- DuckDB is offline-only reconciliation over exported artifacts. It does not power the online request path.
- The `duckdb\smoke-duckdb.ps1` wrapper delegates to `scripts\duckdb\smoke-duckdb.ps1`, which reads `memory/exports/graph-refresh-manifest.json`, `cluster-cards.jsonl`, and `pathway-cards.jsonl`.
- That smoke proves the export artifacts are readable; it does not mean the later phases are finished.
- App OpenAI-shaped calls now use `BIFROST_OPENAI_BASE_URL`; the live default is `http://127.0.0.1:3040/v1` and `/openai/v1` stays an override-only deployment prefix.
- The current Bifrost image logs `providers.turboquant_backend` as unsupported; keep TurboQuant routing app-side unless the gateway image adds provider support.
- Bifrost custom plugin work is documented for WSL2 + Docker; do not use Windows host execution as the canonical path for plugin troubleshooting.
- VS Code folder-open startup now uses `scripts/startup/run-service-health-check.mjs` and `scripts/startup/run-graphify-daily-startup.mjs`; the health check is clean and RabbitMQ is treated as skipped until the dev server is ready.
- The canonical startup ladder is WSL2/Docker-aware:
  - Bifrost is a Docker/WSL2 lane for custom plugin/runtime work
  - TurboQuant, VS Code task orchestration, and SvelteKit dev remain Windows-native lanes
  - the startup orchestrator now writes `.tmp/ace-startup-status.json` as the compact rollup and the folder-open health check is degraded-safe
  - topology-search is soft-gated and reports yellow when `:8101` is absent
- ACE backend identity now includes `kvQuant` and `draftModel` in addition to `modelName`, `modelQuant`, `backend`, `tokenizerHash`, `systemPromptHash`, `toolDefinitionsHash`, `repoGitSha`, `corpusHash`, `ragBundleHash`, and `graphSnapshotHash`.

### 1.2 Truth table — 2026-05-24

The current routing truth is:

| Lane | State | Notes |
|------|-------|-------|
| Redis ACE exact cache | verified | app-side hot cache before either model lane |
| Qdrant HTTP | verified | `6333` is for HTTP inspection / collection checks |
| Qdrant gRPC | verified | `6334` is the lane Bifrost currently expects for its vector-store path |
| Bifrost vector-store path | verified | keep it on `6334`; do **not** force `6333` when logs expect gRPC |
| Bifrost `turboquant_backend` provider | not active | current image reports it as unsupported |
| Bifrost `/health` | verified | health route returns OK on the live gateway |
| Bifrost OpenAI route | verified | direct `POST /v1/chat/completions` returns `Ok` for `ollama/gemma4-rotorquant:latest` |
| TurboQuant direct lane | verified | `http://127.0.0.1:8090` stays the direct local OpenAI-compatible lane |

Practical routing:

```text
Redis cache hit -> return ACE context pack
Redis miss + semantic retrieval -> Bifrost/Ollama
local fast generation -> TurboQuant direct :8090
```

Observed latency on 2026-05-24:

- direct Bifrost minimal chat: ~3.4s
- direct Ollama `ollama run gemma4-rotorquant:latest "say ok"`: ~3.8s
- strict Bifrost smoke: still times out at ~60s on the larger smoke harness path

That means the remaining failure is in the strict smoke harness path, not the basic Bifrost request path.

---

## 2. TurboVec vs TurboQuant vs BitFrost

### 2.1 TurboQuant / llama-server

**Role:** LLM inference runtime.

Use it for:

```text
text generation
Gemma4 synthesis
OpenAI-compatible chat completions
speculative decoding
RotorQuant / GGUF model serving
KV cache quantization
```

TurboQuant is where tokens are generated.

---

### 2.2 TurboVec

**Role:** vector / feature / encoded64 acceleration.

Use it for:

```text
encoded64 vectors
FeatureMap indexing
local feature search
graph synthesis acceleration
offline similarity experiments
small sidecar vector indexes
```

TurboVec does **not** replace Gemma4 inference.

It helps retrieval and indexing.

A good mental model:

```text
TurboQuant = speaks/generates
TurboVec   = finds/sorts/matches
```

For the full retrieval chain, see [docs/hyperrag-turbovec-rtx-pipeline.md](file:///C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/docs/hyperrag-turbovec-rtx-pipeline.md). That pipeline is about context quality, not tok/sec: TurboVec 4-bit ANN prefilter, Qdrant dense search, 4D topology filtering, Atlas merge, and compact packet synthesis before Gemma4 decode.

---

### 2.3 BitFrost / NanoFlow-style cache

**Role:** logical context-pack reuse.

This does **not** mean raw KV-cache serialization.

Cache stores:

```text
summary
chunk IDs
graph paths
tool policy
FeatureMap packets
Wiki cards
relationship reports
retrieval trace metadata
```

Cache does **not** store:

```text
raw llama KV tensors
GPU pointers
native handles
hidden reasoning
raw model memory
```

Safe flow:

```text
query
  → build cache identity
  → Redis ace:ctx:{cacheKey}
  → Postgres llm_context_cache
  → NVMe .cache/ace/context-packs/{cacheKey}.json
  → if hit: reuse compact context pack
  → if miss: full retrieval
  → send compact prompt to TurboQuant
```

### 2.4 Next cache follow-on: ACE Context Pack Cache

The next documented cache task is not a rewrite of the storage layer. It is a compact retrieval-product cache that sits in front of Gemma4/Bifrost and stores only what the retriever needs to reuse.

The current cache identity contract includes:

- `modelName`
- `modelQuant`
- `kvQuant`
- `draftModel`
- `backend`
- `tokenizerHash`
- `systemPromptHash`
- `toolDefinitionsHash`
- `repoGitSha`
- `corpusHash`
- `ragBundleHash`
- `graphSnapshotHash`
- `tscDiagnostics`
- `turboVecCandidates`

Use this shape:

```text
Redis hot pointer
  → Postgres llm_context_cache audit row
  → SeaweedFS or NVMe JSON snapshot
  → compact ACE / NES packet to Gemma4 / Bifrost
```

Current implementation note:

- `src/lib/server/cache/ace-context-pack-cache.ts` now exposes the ACE pack
  builders and snapshot helpers.
- `graphify:daily` now uses the `--tsc` index path, so TS diagnostics are
  populated into `code:ts:diag:manifest` before pack reuse.
- `npm run ace:context-pack:smoke` is available as the contract smoke for the
  Redis pointer + local snapshot round-trip.
- `npm run ace:retrieval-top-cache:smoke` covers the top-N query-hash retrieval
  cache round-trip.
- VS Code folder-open startup now includes `scripts/startup/run-ace-context-pack-startup.mjs`
  so the cache layer is exercised alongside graphify and the service health check.
- VS Code folder-open startup also includes `scripts/startup/run-ace-top-retrieval-startup.mjs`
  so query-hash retrieval reuse is checked on open, not only during change-driven
  incremental runs.
- VS Code folder-open startup also includes `scripts/startup/run-feature-map-startup.mjs`
  so feature labeling / consolidation smoke is checked on open.
- The ACE incremental startup lane now runs the top-retrieval cache smoke too,
  so startup validates both compact context reuse and query-hash result reuse.
- The ACE startup wrapper writes `.tmp/ace-startup-status.json` on degraded runs
  and surfaces the failing subsystem as `redis`, `postgres`, `snapshot`, or
  `tscDiagnostics` instead of blocking workspace open.

Store only:

```text
chunkIds
summaryIds
sourceRefs
graphPaths
feature packets
wiki cards
tool policy
retrieval trace
nextSteps
tsc diagnostics summary
TurboVec candidates
```

Do not store:

```text
raw KV tensors
GPU pointers
hidden reasoning
native handles
raw model memory
```

Naming transition note:

- `MINIO_*` remains the legacy compatibility name in older code and docs
- `SEAWEED_*` is the canonical new runtime naming in docs/env going forward
- keep the existing S3-compatible adapter path, but treat SeaweedFS as the canonical backend
- [x] SeaweedFS alias modules now exist for the object-store surface
- [x] visible admin/evidence labels now say SeaweedFS instead of MinIO
- [ ] migrate remaining imports off MinIO-labeled entrypoints where practical
- [x] add canonical `/seaweed/{bucket}/{key}` proxy while keeping `/minio/{bucket}/{key}` as a legacy alias
- [ ] track remaining compatibility baggage explicitly:
  - `minio_path`
  - `minioUrl`
  - legacy `minio` health alias
  - legacy shim modules and comments
  - do not rename these without a migration plan; they are contract names, not string cleanup
- [ ] plan a compatibility migration for the remaining MinIO contract names
  - `minio_path`
  - `minioUrl`
  - legacy `minio` health alias
  - legacy shim modules and comments
  - define the database / API / UI rename boundary before changing any contract field

### 2.5 TurboVec / ACE storage contract

Use the same retrieval-product shape across Postgres, Redis, and Qdrant. Keep
the lanes separate:

- Postgres stores durable JSONB metadata and audit truth.
- Redis stores hot pointers, cluster membership, and short-lived packet state.
- Qdrant stores semantic payload metadata for vector filtering and rerank.

Postgres JSONB example:

```json
{
  "embeddingModel": "embeddinggemma",
  "dimension": 768,
  "norm": 1.732,
  "quantizer": "turbovec-4bit",
  "rotationSeed": "rotorquant-v1",
  "packedBytesRef": "redis:turbovec:vec:chunk_123",
  "clusterId": "cluster_kag_12",
  "manifold4": {
    "x": 0.42,
    "y": -0.13,
    "z": 0.78,
    "w": 0.21
  },
  "sourceRef": "src/lib/server/ai/kag-runner.ts#L10-L40"
}
```

Redis keys:

```text
turbovec:vec:{chunkId}             packed bytes
turbovec:norm:{chunkId}            original norm
turbovec:cluster:{clusterId}       member ids
turbovec:meta:{chunkId}            quantizer metadata
ace:cluster:hot                    hot cluster sorted set
ace:packet:{runId}                 final ACE packet
semantic:bifrost:{model}:{prefixHash}:{suffixHash}
llm_output:{queryHash}
summary:cluster:{clusterId}
ace:graph:edges:{nodeId}
```

Qdrant payload:

```json
{
  "stable_key": "chunk_123",
  "feature_family": "kag",
  "cluster_id": "cluster_kag_12",
  "manifold4": [0.42, -0.13, 0.78, 0.21],
  "turbovec_ref": "redis:turbovec:vec:chunk_123",
  "quantizer": "turbovec-4bit",
  "source_ref": "src/lib/server/ai/kag-runner.ts#L10-L40"
}
```

Rules:

```text
Do not use quaternion transforms for 768d TurboVec compression.
Use random orthogonal rotation or Hadamard-style fast rotation for 768d compression.
Use 4D / quaternion transforms only for visualization and routing surfaces.
AVX2 / SIMD should handle bit-pack, unpack, and approximate dot-product prefilters.
GPU should accelerate throughput, not define correctness.
Autoencoder + SOM should produce topology signals, not semantic truth.
```

The practical blend score remains:

```text
finalScore =
  0.35 * original768Cosine
+ 0.20 * turboVecApproxCosine
+ 0.20 * graphRelationScore
+ 0.15 * clusterHotness
+ 0.10 * manifold4Proximity
```

Cacheable retrieval products to keep in the ACE lane:

- TypeScript diagnostics snapshots
- `codebase-atlas.min.json` per commit
- encoded64 TurboVec hot-file vectors
- top-N retrieval results by query hash
- per-file feature hash maps
- cluster cards and pathway cards
- authority-score top lists
- KAG note manifests
- ACE retrieval traces and next-step plans

---

## 3. Does this bypass Triton?

For the current local stack: **yes**.

Use:

```text
TurboQuant / llama-server
  → text inference
  → OpenAI-compatible /v1/chat/completions
  → speculative decoding
  → GGUF/RotorQuant weight quantization
  → KV q8_0/q8_0 or supported KV quant
```

Skip for now:

```text
Triton Inference Server
TensorRT-LLM migration
vLLM migration
SGLang migration
custom FlashAttention stack
```

Add Triton/TensorRT/vLLM/SGLang only later if you need:

- many concurrent users
- continuous batching
- Linux production deployment
- multi-GPU scheduling
- centralized serving for multiple models
- throughput beyond what llama-server/TurboQuant can provide

---

## 4. Does this mean no FlashAttention?

Do **not** add a separate FlashAttention project right now.

Use whatever optimized attention path your TurboQuant/llama-server binary already exposes.

Your near-term bottlenecks are more likely:

```text
context assembly
retrieval fanout
rerank / cross-encoder latency
cache misses
VRAM pressure
model reload / cold start
overly large prompts
```

not raw attention kernel performance.

FlashAttention is a backend-level optimization, not an application feature.

---

## 5. NVMe / SSD Cold Cache

For a 5–10 GB knowledge base, NVMe should store **cold context and knowledge artifacts**, not raw KV tensors.

Use NVMe for:

```text
.cache/ace/context-packs/*.json
cached wiki cards
FeatureMap packets
retrieval traces
summaries
graph snapshots
Qdrant snapshots
CouchDB exports
large markdown/wiki artifacts
```

Do not use NVMe yet for:

```text
live model KV tensors
GPU memory dumps
native pointer snapshots
raw llama-server internals
```

Safe NVMe cold-cache model:

```text
NVMe cold cache
  → compact JSON context packs
  → reload into RAM quickly
  → avoid repeated retrieval and prompt assembly
```

Risky future model:

```text
NVMe KV offload
  → actual transformer KV pages
  → requires backend/runtime support
  → belongs to vLLM/TensorRT-LLM/SGLang/NanoFlow-style serving systems
```

Build the safe version first.

---

## 6. Redis Hot Cache

Redis is the hot memory tier.

Use Redis for:

```text
current ACE context packs
cache hit counters
FeatureMap summaries
FeatureMap glyphs
AGENTS directory cards
cluster centroids
Karpathy scores
encoded64 centroids
recent query plans
```

Suggested key patterns:

```text
ace:ctx:{cacheKey}
ace:ctx:hits:{cacheKey}
ace:ctx:meta:{cacheKey}

feature:summary:{featureId}
feature:glyph:{featureId}
feature:map:{featureId}

agents:dir:{dirHash}
agents:feature:{featureKey}
agents:tag:{tag}

gpu:karpathy:scores
gpu:autoencoder:centroids_64

grpo:memory:{queryHash}
```

Redis is not the source of truth.

It is a fast cache and ranking signal store.

---

## 7. Postgres Durable Cache Ledger

Postgres stores durable audit and cache records.

Important table:

```text
llm_context_cache
```

Use it for:

```text
cache key
cache identity metadata
summary
chunk IDs
graph paths
tool policy
cache source
hit counts
created_at
updated_at
```

Postgres provides the durable fallback when Redis is empty or restarted.

---

## 8. Qdrant / Neo4j / CouchDB / Postgres Roles

### Qdrant

Primary semantic retrieval engine.

Use for:

```text
codebase_chunks_768
qdrant_docs
feature summaries
AGENTS card payloads
video/image/frame summaries later
encoded_64 vectors later
```

### Neo4j

GraphRAG and multi-hop reasoning engine.

Use for:

```text
Pentagon Search
community relationships
Feature → File → Route → Proto → Schema
AgentsCard → Directory → Feature → Tag
dependency traversal
storage/interface mapping
```

### CouchDB

Wiki / MapReduce layer.

Use for:

```text
Karpathy wiki pages
AGENTS directory cards
MapReduce link_matrix
by_feature_key views
by_tag views
by_activity_score views
```

### Postgres

Durable relational and JSONB ledger.

Use for:

```text
feature_maps
grpo_memory_sticks
rg_search_runs
rg_search_hits
llm_context_cache
metadata_envelopes
audit logs
case/evidence/legal structured data
```

---

## 9. pgvector vs Qdrant vs TurboVec

### pgvector

Good for:

```text
small/fallback vector search
SQL joins with structured metadata
debug/admin queries
durable embeddings alongside relational data
```

Do not duplicate every Qdrant vector into pgvector yet.

### Qdrant

Good for:

```text
primary semantic search
hybrid dense+sparse retrieval
payload filters
large vector collections
multi-stage retrieval
```

### TurboVec

Good for:

```text
local encoded64 acceleration
FeatureMap vector work
small sidecar retrieval
smoke tests
offline vector experiments
```

Recommended split:

```text
Qdrant   = main semantic/hybrid engine
Neo4j    = graph reasoning engine
Postgres = durable truth and audit
TurboVec = local acceleration / encoded64 lane
Gemma4   = planner and synthesizer
```

---

## 10. 1-bit / low-bit LLM and KV research

Current practical path:

```text
TurboQuant KV q8_0/q8_0
logical context cache in Redis/Postgres/NVMe
```

Future research path:

```text
4-bit / 2-bit / 1-bit KV compression
backend-level KV paging
custom llama-server / vLLM / TensorRT-LLM work
```

Do not implement 1-bit KV caching in app code right now.

The app-level safe optimization is context-pack reuse.

---

## 11. Agent Frameworks Compared

### TypeScript ACE / MCP stack

Best for the current app.

```text
SvelteKit + TypeScript
  → ACE planner
  → TRACE MCP tools
  → Redis / Qdrant / Neo4j / Postgres / CouchDB
  → TurboQuant Gemma4
```

Use for:

- codebase indexing
- legal/evidence retrieval
- admin dashboard
- operator-gated tools
- local Windows workflow
- Hermes/Claude tool boundary

### LangGraph

Python graph workflow framework for stateful/conditional agents.

Use later for:

```text
long-running background research
checkpointed workflows
conditional routing
PDF ingestion → web fallback → citation validation → synthesis
```

Defer until the TypeScript/MCP lane hits a real branching/checkpointing limit.

### Google ADK

Useful for Google Cloud / Vertex AI-centered agents.

Not needed for the local Gemma4/TurboQuant stack right now.

### OpenAI / Claude agents

Use as external operators.

They should call TRACE MCP tools, not directly mutate DB/vector/graph stores.

---

## 12. Production Optimization TODO

### Phase 0 — Lock runtime contract

- [ ] Confirm TurboQuant endpoint: `http://127.0.0.1:8090/v1`
- [ ] Confirm text-only mode when speculative decoding is enabled
- [ ] Confirm VLM is separate through Ollama or another non-draft server
- [ ] Record current launch command: `npm run turbo:start:detached`
- [ ] Record current KV mode: `q8_0/q8_0`
- [ ] Record draft model path
- [ ] Record model quant type: RotorQuant / GGUF

---

### Phase 1 — TurboQuant health smoke

Create:

```text
scripts/smoke-turboquant-health.mjs
```

Checks:

- [x] launcher resolves `tools\\llama-server\\llama-server.exe`
- [x] launcher resolves `vendor\\models\\gemma4-legal.gguf`
- [x] `GET /health`
- [x] `GET /v1/models`
- [x] smoke can see `gemma4-legal.gguf`
- [x] `node scripts/smoke-turboquant-health.mjs`
- [ ] `POST /v1/chat/completions`
- [ ] response contains `turboquant-ok`
- [ ] records latencyMs
- [ ] records prompt/completion tokens if available
- [ ] writes `logs/turboquant/health-latest.json`

Package script:

```json
{
  "scripts": {
    "turbo:smoke": "node scripts/smoke-turboquant-health.mjs"
  }
}
```

---

### Phase 2 — ACE backend identity

Ensure cache key includes:

- [x] modelName
- [x] modelQuant
- [x] backend
- [x] tokenizerHash
- [x] systemPromptHash
- [x] toolDefinitionsHash
- [x] repoGitSha
- [x] corpusHash
- [x] ragBundleHash
- [x] graphSnapshotHash

Ensure `openai-facade.ts` passes:

```text
backend = turboquant
modelQuant = rotorquant
kvQuant = q8_0/q8_0
draftModel = true/false
```

---

### Phase 3 — BitFrost / NanoFlow logical cache

Finish:

```text
resolveContextCacheSources()
```

Order:

```text
Redis ace:ctx:{cacheKey}
  → Postgres llm_context_cache
  → local JSON .cache/ace/context-packs/{cacheKey}.json
  → miss
```

- [x] Redis hit wins
- [x] Redis down falls back to Postgres
- [x] Postgres down falls back to local JSON
- [x] corrupt local JSON returns miss
- [x] toolPolicy survives roundtrip
- [x] no retrieval fails because cache failed

---

### Phase 4 — NVMe cold cache

Create:

```text
.cache/ace/context-packs/
```

- [x] Write compact JSON context packs by cacheKey
- [x] Add cache size limit, e.g. 2–5 GB
- [x] Add LRU cleanup script:
  - `scripts/cache/prune-ace-context-packs.mjs`
- [x] Add package script:
  - `cache:ace:prune`
- [x] Store lastUsedAt
- [x] Store estimated token savings

---

### Phase 5 — Redis hot cache

Keys:

```text
ace:ctx:{cacheKey}
ace:ctx:hits:{cacheKey}
ace:ctx:meta:{cacheKey}
```

Status:
- [x] `ace:ctx:{cacheKey}` hot pointer exists
- [x] Postgres audit row exists via `llm_context_cache`
- [x] local snapshot exists under `.cache/ace/context-packs/`
- [x] `lastUsedAt` is persisted in the audit row
- [x] `ace:ctx:hits:{cacheKey}` counter
- [x] `ace:ctx:meta:{cacheKey}` metadata key
- [x] increment hits on reuse
- [x] store cacheSource
- [x] store promptTokensSavedEstimate
- [x] TTL 6h–48h depending on repo SHA freshness

---

### Phase 6 — Token-saving metrics

Emit:

Status:
- [x] contextCacheHit
- [x] cacheSource: `redis|postgres|local-json|miss`
- [x] reusedChunkCount
- [x] skippedRetrievalLanes
- [x] promptTokensSavedEstimate
- [x] timeSavedMsEstimate
- [x] repoGitSha
- [x] ragBundleHash
- [x] graphSnapshotHash

Current note:
- The cache code now writes hot keys, local logs, `ace_retrieval_runs.metadata`, and Langfuse traces for context-pack access.
- `npm run ace:context-pack:metrics:smoke` now validates the Redis hot-key updates and the local log append path.
- The remaining metrics work is live transport validation when Langfuse credentials are enabled.

Write to:

```text
Langfuse trace
ace_retrieval_runs.metadata
logs/ace-context-cache/latest.json
```

---

### Phase 7 — TurboQuant generation benchmark

Benchmark:

- [x] no cache
- [x] Redis cache hit
- [x] Postgres cache hit
- [x] local JSON cache hit
- [x] changed repo SHA miss
- [x] changed system prompt miss
- [x] changed tool definitions miss
- [x] `turbo:bench:cache-matrix`

Record:

```text
time_to_first_token_ms
tokens_per_second
prompt_tokens
completion_tokens
cache_source
```

Writes:

```text
logs/turboquant/bench-cache-matrix-latest.json
```

---

### Phase 8 — Speculative decoding rules

- [x] keep draft model on for text-only synthesis
- [x] disable draft model for VLM/mmproj
- [x] record `draftModel=true` in cache metadata
- [x] if outputs look unstable, smoke with draft off
- [x] do not use draft for strict JSON-critical tests until validated

---

### Phase 9 — KV quant rules

- [x] keep `kv=q8_0/q8_0` initially
- [x] do not go lower until retrieval quality smoke passes
- [x] record KV mode in logs
- [x] compare q8_0 vs f16 if quality seems off
- [ ] do not implement 1-bit KV in app code yet

---

### Phase 10 — FlashAttention decision gate

- [x] check if current TurboQuant/llama-server launcher path uses optimized attention flag
- [x] if supported, test one smoke with it enabled
- [ ] if model crashes or quality shifts, leave off
- [ ] do not compile separate FlashAttention
- [ ] do not add Triton just for FlashAttention

Decision:

```text
FlashAttention is backend-level optimization.
Not an app-level feature.
```

---

### Phase 11 — Triton / TensorRT / vLLM / SGLang decision gate

Do not add now.

Consider later only if:

- [ ] multiple concurrent users
- [ ] need continuous batching
- [ ] need Linux production server
- [ ] need multi-GPU scheduling
- [ ] llama-server cannot hit required throughput
- [ ] need centralized serving for multiple models

---

### Phase 12 — Agent orchestration decision

Current:

```text
TypeScript ACE + MCP = primary orchestration
Hermes Workspace = operator UI
Claude Code = coding operator
Gemma4 = local planner/synthesizer
```

Defer:

- [ ] LangGraph background worker
- [ ] Google ADK
- [ ] OpenAI hosted agents
- [ ] direct cloud agent DB writers

---

### Phase 10B — TurboVec + Qdrant Optimization

- [x] Find the actual gitignored GGUF path
  - `vendor\models\gemma4-legal.gguf`
  - `vendor\models\mmproj-gemma4.gguf`
  - `models\gemma4-legal-iq4xs-direct.gguf`
  - `models\mmproj-F16.gguf`
- [x] Fix `ensure-llama-server.mjs` model candidate resolution
- [ ] Normalize sidecar ports
  - `8791 = atlas/OpenCode MCP`
  - `8792 = TurboVec rerank sidecar`
  - `8793 = RotorQuant helper`
  - `8090 = llama-server Gemma4`
  - `4222 = NATS`
  - `6333 = Qdrant`
  - `6379 = Redis`
  - `5432/5434 = Postgres`
- [x] Add `retrieval.turbovec.rerank` NATS subject
- [x] Add fallback: TurboVec offline -> Qdrant order
- [x] Enable Qdrant quantization before custom GPU search
- [x] Add smoke query: `npm run ace:packet -- "where is auth?"`

---

### Phase 11 — cuVS / CUDA Sidecar Benchmark

- [x] Create Python cuVS benchmark sidecar
- [x] Do not use C++ N-API yet
- [x] Add NATS subjects:
  - `gpu.cuvs.search`
  - `gpu.cuda.rank`
- [x] Benchmark Qdrant vs cuVS on atlas chunks
  - degraded runs are allowed
  - the smoke must still write:
    - Redis `cuvs:benchmark:latest`
    - Redis `cuvs:benchmark:<hash>`
    - Postgres `llm_context_cache`
    - degraded reason
- [x] Store benchmark traces in Redis/Postgres
- [x] Keep cuVS behind feature flag: `ENABLE_CUVS_SEARCH=false`
- [x] cuVS offline must not break retrieval

---

### Phase 12 — CUDA Streams / Tensor Bridge / RNN Experiments

Experimental lane only. Do not block retrieval, and do not move into this work until the Phase 11 benchmark gate is writing Redis/Postgres traces and degraded reasons correctly.

- [x] Export transition memory from Redis (Redis first; context_timeline fallback when Redis is empty)
- [x] Build sequence memory dataset:
  - `cache_miss -> atlas_lookup`
  - `atlas_lookup -> qdrant_hit`
  - `qdrant_hit -> graph_expand`
  - `graph_expand -> turbovec_rerank`
  - `turbovec_rerank -> gemma4_response`
- [x] Publish `ace:autoencoder:weights` and `ace:autoencoder:meta` to Redis
- [x] Run `npm run ae:centroids` and write `gpu:autoencoder:centroids_64`
- [x] `graphify:cluster-summaries:v1:fast` now consumes the SOM centroids
- [x] `karpathy:gpu` wrapper is callable again
- [x] Prototype CUDA/RNN reranker as experimental lane only
- [x] Add flag: `ENABLE_CUDA_RANKER=false`
- [x] Add smoke: `ace:cuda-reranker:smoke`
- [x] Do not block retrieval on CUDA
- [x] Do not send raw prompts to CUDA lane; send IDs/scores only

---

### Phase 13 — Graph Synthesis + Feature MapReduce

- [x] Add degraded intent synthesis record path:
  - `src/lib/server/ace/intent-synthesis.ts`
  - writes `intent_synthesis`
  - degraded mode uses `autoencoder_weights_pending`
  - does not block on `ace:autoencoder:weights`
- [x] Add smoke:
  - `npm run ace:intent-synthesis:smoke`
  - confirms degraded write + round-trip
- [x] Add Postgres-first GRPO-lite reward loop:
  - `src/lib/server/ace/intent-synthesis-reward.ts`
  - writes `intent_synthesis_rewards`
  - caches hot summaries in Redis `ace:reward:*`
  - degraded mode uses `karpathy_encoded_pending`
  - does not block on `gpu:karpathy:encoded`
- [x] Add smoke:
  - `npm run ace:intent-reward:smoke`
  - confirms Postgres write + Redis hot-cache write + degraded fallback
- [ ] Build feature graph from:
  - paths
  - imports
  - env vars
  - routes
  - API endpoints
  - DB tables
  - MCP tools
  - NATS subjects
  - OpenCode tools
  - package scripts
- [x] PageRank authority rebuild now prefers the CUDA bridge when the graph fits, accepts env-driven refresh/write flags, caches `couchdb:pagerank_scores` behind a graph hash, and skips Neo4j→CouchDB republish on cache hit
- [x] Authority snapshot now consolidates `couchdb:pagerank_scores`, `ace:authority:top`, and `gpu:karpathy:scores` into `logs/authority/latest.json` for multi-hop analysis
- [x] ACE fusion now reads the authority snapshot as a fallback signal when candidates do not already carry PageRank or authority fields
- [x] HyperRAG dense multi-query now hydrates the consolidated authority snapshot so Karpathy / ACE / Redis / BitFrost / KAG results share one fallback authority source
- [x] `graphify:cluster-summaries` now points at the real SOM summary script, and the Redis centroid layer is now populated by `npm run ae:centroids`
- [ ] Add MapReduce summaries:
  - chunk summary
  - file summary
  - folder summary
  - feature summary
  - system summary
- [ ] Store summary layers in:
  - `atlas_chunks.summary`
  - `atlas_chunks.sub_summaries`
  - `atlas_feature_cards`
  - `atlas_feature_edges`
- [x] Add command: `npm run atlas:graph:synthesize`
- [ ] Output feature cards with:
  - paths
  - sourceRefs
  - commands
  - envVars
  - qdrantTags
  - chunkIds
  - parentIds

---

### Phase 14 — DuckDB + LangGraph + Langfuse

- [ ] Use DuckDB for offline analytics only
- [ ] Export traces from Redis/Postgres to DuckDB
- [ ] Add LangGraph run IDs to every ACE packet
- [ ] Add Langfuse tracing for:
  - retrieval events
  - cache hits/misses
  - Qdrant latency
  - TurboVec rerank latency
  - Gemma4 latency
  - failureLookup retries
- [ ] DuckDB and Langfuse observe the system
- [ ] They do not sit in the request-critical correctness path

---

### Phase 15 — Feature Labeling + Pruning

- [ ] Label every major feature:
  - `auth`
  - `ace-cache`
  - `qdrant-search`
  - `postgres-atlas`
  - `opencode-tools`
  - `sse-chat`
  - `bifrost-gemma4`
  - `turbovec-rerank`
  - `langgraph-dag`
  - `nats-sidecars`
  - `feature-mapreduce`
  - `browser-cache`
- [ ] Detect orphaned files with no feature label
- [ ] Detect duplicate feature implementations
- [ ] Detect stale scripts
- [ ] Detect stale docs
- [ ] Add pruning report: `npm run atlas:feature:prune-report`

---

## 13. Immediate Next Commits

### Commit 1

```text
test(turbo): add TurboQuant health and cache identity smoke
```

Files:

```text
scripts/smoke-turboquant-health.mjs
tests/unit/llm-context-cache.test.ts
src/lib/server/cache/README.md
```

### Commit 2

```text
feat(cache): finish NanoFlow-style ACE context reuse
```

Files:

```text
src/lib/server/ace/llm-context-cache.ts
src/lib/server/ace/context-cache-planner.ts
src/lib/server/cache/README.md
```

### Commit 3

```text
feat(cache): add NVMe ACE context-pack pruning
```

Files:

```text
scripts/cache/prune-ace-context-packs.mjs
.cache/ace/context-packs/
```

---

## 14. Guardrails

Do not do yet:

- [ ] do not implement raw KV serialization
- [ ] do not change llama-server / TurboQuant runtime
- [ ] do not add Triton
- [ ] do not add TensorRT-LLM
- [ ] do not add vLLM
- [ ] do not add SGLang
- [ ] do not add separate FlashAttention
- [ ] do not change identity strategy
- [ ] do not run `drizzle push`
- [ ] do not run `buildHypergraph4D()` write job
- [ ] do not run full 10M TurboVec ingest
- [ ] do not scale before cache tests are green

---

## 15. Final Mental Model

```text
TurboQuant / RotorQuant
  = inference runtime

TurboVec
  = local vector/encoded64 acceleration

BitFrost / NanoFlow cache
  = logical context-pack reuse

Redis
  = hot cache

Postgres
  = durable cache ledger

NVMe JSON
  = cold-start fallback

Qdrant / Neo4j / CouchDB
  = retrieval substrate

Gemma4
  = planner + synthesizer

Triton / TensorRT / vLLM / SGLang
  = future serving upgrades, not current work
```

---

## 16. Direct Execution Order

1. [x] `resolveContextCacheSources()` is implemented.
2. [x] `llm-context-cache.test.ts` covers the fallback order and toolPolicy roundtrip.
3. [x] Add NanoFlow/BitFrost README note.
4. [x] Add TurboQuant health smoke.
5. [x] Add NVMe context-pack prune script.
6. [x] Add token-savings metrics.
7. [x] Benchmark cache hit vs miss.
8. Only then consider attention/KV/runtime alternatives.
