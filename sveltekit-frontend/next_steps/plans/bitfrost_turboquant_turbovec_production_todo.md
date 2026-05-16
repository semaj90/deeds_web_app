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
Endpoint: http://127.0.0.1:8080
Mode: text-only
Speculative decoding: enabled
KV cache: q8_0 / q8_0
Vision/mmproj: disabled automatically because draft model is active
```

This is enough for:

- ACE context-pack synthesis
- Gemma4 text generation
- FeatureMap summaries
- Karpathy wiki summaries
- Hermes text planning
- Claude Code / local agent handoff briefs

It is **not** the right runtime for image/video/VLM work when speculative decoding is enabled.

Use Ollama or a separate non-draft VLM server for image/video analysis.

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

- [ ] Confirm TurboQuant endpoint: `http://127.0.0.1:8080/v1`
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

- [ ] `GET /v1/models`
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

- [ ] modelName
- [ ] modelQuant
- [ ] backend
- [ ] tokenizerHash
- [ ] systemPromptHash
- [ ] toolDefinitionsHash
- [ ] repoGitSha
- [ ] corpusHash
- [ ] ragBundleHash
- [ ] graphSnapshotHash

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

- [ ] Redis hit wins
- [ ] Redis down falls back to Postgres
- [ ] Postgres down falls back to local JSON
- [ ] corrupt local JSON returns miss
- [ ] toolPolicy survives roundtrip
- [ ] no retrieval fails because cache failed

---

### Phase 4 — NVMe cold cache

Create:

```text
.cache/ace/context-packs/
```

- [ ] Write compact JSON context packs by cacheKey
- [ ] Add cache size limit, e.g. 2–5 GB
- [ ] Add LRU cleanup script:
  - `scripts/cache/prune-ace-context-packs.mjs`
- [ ] Add package script:
  - `cache:ace:prune`
- [ ] Store lastUsedAt
- [ ] Store estimated token savings

---

### Phase 5 — Redis hot cache

Keys:

```text
ace:ctx:{cacheKey}
ace:ctx:hits:{cacheKey}
ace:ctx:meta:{cacheKey}
```

- [ ] TTL 6h–48h depending on repo SHA freshness
- [ ] increment hits on reuse
- [ ] store lastUsedAt
- [ ] store cacheSource
- [ ] store promptTokensSavedEstimate

---

### Phase 6 — Token-saving metrics

Emit:

- [ ] contextCacheHit
- [ ] cacheSource: `redis|postgres|local-json|miss`
- [ ] reusedChunkCount
- [ ] skippedRetrievalLanes
- [ ] promptTokensSavedEstimate
- [ ] timeSavedMsEstimate
- [ ] repoGitSha
- [ ] ragBundleHash
- [ ] graphSnapshotHash

Write to:

```text
Langfuse trace
ace_retrieval_runs.metadata
logs/ace-context-cache/latest.json
```

---

### Phase 7 — TurboQuant generation benchmark

Benchmark:

- [ ] no cache
- [ ] Redis cache hit
- [ ] Postgres cache hit
- [ ] local JSON cache hit
- [ ] changed repo SHA miss
- [ ] changed system prompt miss
- [ ] changed tool definitions miss

Record:

```text
time_to_first_token_ms
tokens_per_second
prompt_tokens
completion_tokens
cache_source
```

---

### Phase 8 — Speculative decoding rules

- [ ] keep draft model on for text-only synthesis
- [ ] disable draft model for VLM/mmproj
- [ ] record `draftModel=true` in cache metadata
- [ ] if outputs look unstable, smoke with draft off
- [ ] do not use draft for strict JSON-critical tests until validated

---

### Phase 9 — KV quant rules

- [ ] keep `kv=q8_0/q8_0` initially
- [ ] do not go lower until retrieval quality smoke passes
- [ ] record KV mode in logs
- [ ] compare q8_0 vs f16 if quality seems off
- [ ] do not implement 1-bit KV in app code yet

---

### Phase 10 — FlashAttention decision gate

- [ ] check if current TurboQuant/llama-server binary supports optimized attention flag
- [ ] if supported, test one smoke with it enabled
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

1. Finish `resolveContextCacheSources()`.
2. Finish `tests/unit/llm-context-cache.test.ts`.
3. Add NanoFlow/BitFrost README note.
4. Add TurboQuant health smoke.
5. Add NVMe context-pack prune script.
6. Add token-savings metrics.
7. Benchmark cache hit vs miss.
8. Only then consider attention/KV/runtime alternatives.
