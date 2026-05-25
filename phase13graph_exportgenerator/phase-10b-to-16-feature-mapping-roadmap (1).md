# Phase 10B → Phase 16 Roadmap: TurboVec Compression, Parent Atlas, Feature Mapping, and Gemma4 ACE Memory

## Goal

Build a comprehensive source-of-truth system for the codebase where Gemma4/OpenCode can answer multi-hop engineering questions using compact ACE packets instead of repeatedly scanning thousands of files.

The system should support:

- More than 1,000 `.md` / `.txt` / source files
- Large JSON maps over 30 MB
- Parent Atlas indexing
- Qdrant semantic retrieval
- Postgres durable graph truth
- Redis hot ACE packet cache
- TurboVec optional compression/rerank lane
- LangExtract-style structured extraction
- LangGraph validation and failure recovery
- Future cuVS / CUDA acceleration without breaking correctness

Core rule:

```txt
Accelerators improve latency, never correctness.
```

---

## System Layout

```txt
repo files / docs / json maps
  ↓
Parent Atlas indexer
  ↓
Postgres atlas_chunks + graph fields
  ↓
Qdrant semantic vector store
  ↓
TurboVec optional compressed rerank lane
  ↓
Redis ACE packet cache
  ↓
Gemma4 / Bifrost synthesis
  ↓
OpenCode + Svelte SSE UI
```

---

## Where TurboVec Comes Into Play

TurboVec should **not** replace Qdrant or Postgres.

Use TurboVec as an optional compression and reranking lane when the context set becomes too large, especially when working with:

- Thousands of `.md` and `.txt` files
- Large generated `.llms.txt` maps
- Large JSON feature maps over 30 MB
- Parent Atlas chunks with many near-duplicate summaries
- Multi-hop retrieval where Qdrant returns too many candidates

Correct TurboVec role:

```txt
Qdrant/Postgres produce candidate chunks
→ TurboVec compresses/reranks candidates
→ ACE packet receives compact ranked cards
→ Gemma4 sees only the best evidence
```

Fallback rule:

```txt
If TurboVec is offline, use Qdrant ranking order.
If Qdrant is offline, use Postgres hybrid search.
If Redis is offline, build packet without cache.
```

---

## Large File Strategy: >1K Markdown/Text Files and >30MB JSON Maps

### Problem

Raw context is too large for Gemma4 to use directly.

Bad pattern:

```txt
Load all markdown files → send to Gemma4
```

Good pattern:

```txt
chunk → summarize → tag → embed → graph-link → compress → cache → synthesize
```

### Processing Pipeline

```txt
1. Scan files
2. Chunk by heading/function/section
3. Create chunk_id
4. Extract features/env vars/routes/tables/tools
5. Summarize chunks
6. Store in Postgres atlas_chunks
7. Upsert embeddings into Qdrant
8. Build parent/child graph links
9. Use TurboVec to compress/rerank large candidate sets
10. Save compact ACE packets to Redis
```

---

## `atlas_chunks` Source-of-Truth Shape

Recommended fields:

```sql
atlas_chunks (
  id uuid primary key,
  chunk_id text not null,
  path text not null,
  language text,
  feature_family text,
  parent_id uuid,
  summary text,
  content text,
  source_refs jsonb,
  chunk_ids jsonb,
  cluster_tags jsonb,
  env_vars jsonb,
  tools jsonb,
  routes jsonb,
  tables jsonb,
  dominant_tags jsonb,
  audit_score numeric,
  som_bmu_row integer,
  som_bmu_col integer,
  embedding vector(768),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

Indexes:

```sql
CREATE INDEX IF NOT EXISTS atlas_chunks_path_idx ON atlas_chunks(path);
CREATE INDEX IF NOT EXISTS atlas_chunks_parent_idx ON atlas_chunks(parent_id);
CREATE INDEX IF NOT EXISTS atlas_chunks_feature_family_idx ON atlas_chunks(feature_family);
CREATE INDEX IF NOT EXISTS atlas_chunks_source_refs_gin ON atlas_chunks USING gin(source_refs);
CREATE INDEX IF NOT EXISTS atlas_chunks_chunk_ids_gin ON atlas_chunks USING gin(chunk_ids);
CREATE INDEX IF NOT EXISTS atlas_chunks_cluster_tags_gin ON atlas_chunks USING gin(cluster_tags);
CREATE INDEX IF NOT EXISTS atlas_chunks_env_vars_gin ON atlas_chunks USING gin(env_vars);
CREATE INDEX IF NOT EXISTS atlas_chunks_summary_trgm ON atlas_chunks USING gin(summary gin_trgm_ops);
CREATE INDEX IF NOT EXISTS atlas_chunks_embedding_hnsw ON atlas_chunks USING hnsw(embedding vector_cosine_ops);
```

---

## ACE Packet Format

Compact packet for Gemma4:

```json
{
  "cartridgeId": "ace:packet:<runId>",
  "queryHash": "...",
  "intent": "failure|code|graph|hybrid",
  "clusterTags": ["atlas", "feature-map", "multi-hop"],
  "topoClass": "feature-synthesis",
  "sourceRefs": [],
  "rankedCards": [],
  "subgraph": {
    "nodes": [],
    "edges": []
  },
  "failureHints": [],
  "nextActions": [],
  "degraded": false,
  "ttlSeconds": 3600
}
```

Required validation:

```txt
No sourceRefs = degraded
No commands = degraded
No feature label = incomplete
No path = invalid card
No chunk_id = invalid retrieval card
```

---

## LangExtract-Style Structured Extraction

Use structured extraction before summarization so feature maps are stable.

Extract from each file/chunk:

```json
{
  "feature": "ace-cache",
  "language": "ts",
  "paths": [],
  "envVars": [],
  "routes": [],
  "apiEndpoints": [],
  "databaseTables": [],
  "mcpTools": [],
  "natsSubjects": [],
  "sourceRefs": [],
  "commands": [],
  "dependencies": [],
  "risks": [],
  "missingFeatures": []
}
```

This gives Gemma4 a structured feature map instead of raw prose.

---

## Multi-Hop Cache Traversal

Example query:

```txt
Where is auth wired and how does it connect to ACE packet streaming?
```

Traversal:

```txt
query
→ Redis ace:packet cache check
→ Qdrant semantic search
→ Postgres graph expansion by feature_family/source_refs/chunk_ids
→ TurboVec rerank if candidate count is high
→ LangExtract feature cards
→ ACE packet
→ Gemma4 synthesis
→ Redis trace store
```

Transition memory:

```json
{
  "from": "qdrant_hit",
  "to": "graph_expand",
  "intent": "feature-mapping",
  "success": true,
  "frequency": 12
}
```

Later, these transitions can train/rerank traversal paths.

---

# Phase TODOs

## Phase 10B — TurboVec + Qdrant Optimization

- [ ] Find actual gitignored GGUF path:

```powershell
rg --files -uu | rg -i "gemma|rotor|quant|gguf"
```

- [ ] Fix `ensure-llama-server.mjs` model candidate resolution.
- [ ] Normalize sidecar ports:

```txt
8791 = atlas/OpenCode MCP
8792 = TurboVec rerank sidecar
8793 = RotorQuant helper
8090 = llama-server Gemma4
4222 = NATS
6333 = Qdrant
6379 = Redis
5432/5434 = Postgres
```

- [ ] Add `retrieval.turbovec.rerank` NATS subject.
- [ ] Add fallback: TurboVec offline → Qdrant order.
- [ ] Enable Qdrant quantization before custom GPU search.
- [ ] Add test query:

```bash
npm run ace:packet -- "where is auth?"
```

---

## Phase 11 — cuVS / CUDA Sidecar Benchmark

- [ ] Create Python cuVS benchmark sidecar.
- [ ] Do not use C++ N-API yet.
- [ ] Add NATS subjects:

```txt
gpu.cuvs.search
gpu.cuda.rank
```

- [ ] Benchmark Qdrant vs cuVS on atlas chunks.
- [ ] Store benchmark traces in Redis/Postgres.
- [ ] Keep cuVS behind feature flag:

```txt
ENABLE_CUVS_SEARCH=false
```

Rule:

```txt
cuVS offline must not break retrieval.
```

---

## Phase 12 — CUDA Streams / Tensor Bridge / RNN Experiments

- [ ] Export transition memory from Redis.
- [ ] Build sequence memory dataset:

```txt
cache_miss → atlas_lookup
atlas_lookup → qdrant_hit
qdrant_hit → graph_expand
graph_expand → turbovec_rerank
turbovec_rerank → gemma4_response
```

- [ ] Prototype CUDA/RNN reranker as experimental lane only.
- [ ] Add flag:

```txt
ENABLE_CUDA_RANKER=false
```

- [ ] Do not block retrieval on CUDA.
- [ ] Do not send raw prompts to CUDA lane; send IDs/scores only.

---

## Phase 13 — Graph Synthesis + Feature MapReduce

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

- [ ] Add MapReduce summaries:
  - chunk summary
  - file summary
  - folder summary
  - feature summary
  - system summary

- [ ] Store summary layers in:

```txt
atlas_chunks.summary
atlas_chunks.sub_summaries
atlas_feature_cards
atlas_feature_edges
```

- [ ] Add command:

```bash
npm run atlas:graph:synthesize
```

- [ ] Output feature cards with:
  - paths
  - sourceRefs
  - commands
  - envVars
  - qdrantTags
  - chunkIds
  - parentIds

---

## Phase 14 — DuckDB + LangGraph + Langfuse

- [ ] Use DuckDB for offline analytics only.
- [ ] Export traces from Redis/Postgres to DuckDB.
- [ ] Add LangGraph run IDs to every ACE packet.
- [ ] Add Langfuse tracing for:
  - retrieval events
  - cache hits/misses
  - Qdrant latency
  - TurboVec rerank latency
  - Gemma4 latency
  - failureLookup retries

Rule:

```txt
DuckDB and Langfuse observe the system.
They do not sit in the request-critical correctness path.
```

---

## Phase 15 — Feature Labeling + Pruning

- [ ] Label every major feature:

```txt
auth
ace-cache
qdrant-search
postgres-atlas
opencode-tools
sse-chat
bifrost-gemma4
turbovec-rerank
langgraph-dag
nats-sidecars
feature-mapreduce
browser-cache
```

- [ ] Detect orphaned files with no feature label.
- [ ] Detect duplicate feature implementations.
- [ ] Detect stale scripts.
- [ ] Detect stale docs.
- [ ] Add pruning report:

```bash
npm run atlas:feature:prune-report
```

Rule:

```txt
Never delete automatically.
Only output review lists.
```

---

## Phase 16 — Implement Missing Features

- [ ] Convert prune report into missing-feature backlog.
- [ ] For each missing feature, require:
  - feature card
  - sourceRefs
  - env vars
  - commands
  - tests
  - rollback notes

- [ ] Gemma4/OpenCode agent must call:

```txt
ace:packet
atlas.search
failureLookup
trace.store
```

- [ ] Required checks:

```bash
npm run ci:all
npm run smoke:mcp:opencode-sidecars
npm run ace:packet -- "<feature query>"
```

---

## OpenCode Agent Guardrails

OpenCode/Gemma4 must not claim success unless:

```txt
sourceRefs.length > 0
commands.length > 0
paths.length > 0
chunkIds.length > 0
```

Failure routing:

```txt
missing_sourceRefs → failureLookup → synthesize once → END
generic_answer → failureLookup → synthesize once → END
duplicate_tool_call → failureLookup → synthesize once → END
max_attempts → END
```

---

## Recommended Scripts

```jsonc
{
  "scripts": {
    "ace:packet": "node scripts/ace/build-packet.mjs",
    "ace:ask": "node scripts/ace/ask-gemma4.mjs",
    "ace:stream": "node scripts/ace/stream-gemma4.mjs",
    "atlas:graph:synthesize": "node scripts/atlas/graph-synthesize.mjs",
    "atlas:feature:prune-report": "node scripts/atlas/feature-prune-report.mjs",
    "qdrant:quantize": "node scripts/qdrant/enable-quantization.mjs",
    "turbovec:rerank:test": "node scripts/atlas/test-turbovec-rerank.mjs",
    "phase10b:test": "npm run ace:packet -- \"where is auth?\" && npm run smoke:mcp:opencode-sidecars"
  }
}
```

---

## Final Architecture Principle

```txt
Postgres = truth
Qdrant = canonical semantic recall
Redis = hot ACE/prompt/trace cache
TurboVec = optional compression/rerank for large candidate sets
LangExtract = structured feature extraction
LangGraph = stateful routing and failure control
Gemma4/Bifrost = synthesis
cuVS/CUDA/TensorRT = later acceleration lanes
DuckDB/Langfuse = analytics and observability
OpenCode = agent/tool caller
Svelte SSE = live UI visibility
```

The goal is not just faster search.

The goal is a durable, multi-hop, feature-aware source-of-truth layer that lets Gemma4 reason over the codebase using compact, traceable, cached context packets.
