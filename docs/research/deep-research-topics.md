# TRACE/Karpathy Performance Lane — Deep Research Plan

**Last Updated:** 2026-05-06
**Audience:** Claude Code (static analysis), Gemma4 (MCP tool search), Karpathy Wiki (Redis `wiki:note:*`)
**Status:** 5 ordered execution steps — ready to implement

---

## Why This Exists

The Karpathy 4D topological wiki (Redis `wiki:note:*`) is the shared memory layer between:
- Claude Code — reads this file at planning time
- Gemma4 — searches via `trace.kag_search` MCP tool
- Karpathy indexer — ingests this as a `wiki:note:research:*` entry

Each section maps to a concrete engineering task. Complete them in order. Do not reorder — step N depends on step N-1 being stable.

---

## Runtime Split Contract

| Layer | Owner | Examples |
|-------|-------|---------|
| **TypeScript** | Orchestration, APIs, MCP tools, worker_threads, JSONB metadata | SvelteKit routes, `inference-router.ts`, `context-assembler.ts` |
| **GPU / LibTorch** | Dense tensor math, cosine rerank, k-means, SOM/BMU | `tensorrt_bridge.node`, `libtorch-bridge.ts` |
| **Redis** | Hot cache, tensor cache, similarity cache, retrieval traces, wiki notes (`wiki:note:*`) | `redis-exact-match.ts`, `topo-candidate-cache.ts`, `hmm-wiki-logger.ts` |
| **Qdrant** | Vector index and semantic retrieval | `codebase_chunks_768`, `evidence_items`, `legal_glossary` |
| **Neo4j / GDS** | Graph analysis, PageRank, communities, shortest paths, `SIMILAR_TOPOLOGY` edges | `gpu-graph-analysis.ts`, `directory-summarizer.ts` |
| **Gemma4** | Synthesis AFTER retrieval has already been narrowed by cache + graph layer | `gemma4-agent.ts`, `/api/ai/agent` |
| **MCP** | Safe model-facing tool surface | `trace-mcp-server.ts` :8788 |

**Invariant**: Gemma4 MUST call named MCP tools. It does NOT talk to gRPC, Qdrant, Neo4j, or Postgres directly.

---

## Step 1 — fix(cuda): harden clusterEmbeddings and graphSimilarity safety

**File**: `simd-bridge/cpp/libtorch_graph.cc`
**Estimated time**: 2-3 hours
**Risk**: Low (defensive guards only, no algorithm change)

### What to do

1. **Empty-cluster guard** in `clusterEmbeddings`:
   - After each k-means iteration, check for empty clusters
   - Re-seed empty cluster from the farthest point from its nearest centroid
   - If n < k, return `{error: "n_less_than_k", n, k}` immediately

2. **N-cap guard** in `graphSimilarity`:
   - Hard limit: if (n > 8192) return `{error: "n_exceeds_cap", n, cap: 8192}`
   - Return structured error details to TS bridge (not naked C++ exception)

3. **TypeScript bridge update** (`src/lib/server/gpu/libtorch-bridge.ts`):
   - Handle `{error: ...}` shape from addon, surface as `GpuError` with `code` + `details`

### Test requirements

```typescript
// tests/cuda-hardening.spec.ts
it('clusterEmbeddings: no NaN centroids when k > populated clusters', ...)
it('clusterEmbeddings: safe rejection when n < k', ...)
it('graphSimilarity: structured error for n > cap', ...)
it('libtorch-bridge: GpuError shape from empty-cluster rejection', ...)
```

---

## Step 2 — feat(cuda): async N-API GPU calls for large workloads

**File**: `simd-bridge/cpp/libtorch_graph.cc` + `src/lib/server/gpu/libtorch-bridge.ts`
**Estimated time**: 3-4 hours
**Risk**: Medium (N-API async requires careful thread safety)

### What to do

1. Wrap `graphSimilarity`, `clusterEmbeddings`, `batchCosineSimilarity` in **N-API AsyncWorker** for `n >= 256`
2. Preserve synchronous path for `n < 256` (V8 overhead not worth async for small n)
3. TypeScript side: return `Promise<T>` from bridge (verify callers are already async-shaped)

### Test requirements

```typescript
it('large-n path: event loop remains unblocked during GPU computation', ...)
it('async path resolves correct result matching sync baseline', ...)
it('threshold: n=255 uses sync, n=256 uses async', ...)
```

### Performance target

- 1000-dim batch of 512: < 30ms wall-clock, event loop free during GPU kernel
- 1000-dim batch of 2048: < 120ms, event loop free

---

## Step 3 — feat(indexer): add worker-thread pool for chunk/metadata pipeline

**Files**: `src/lib/server/indexer/worker-pool.ts` (new), `src/lib/server/indexer/chunk-worker.ts` (new)
**Estimated time**: 4-5 hours
**Risk**: Medium (worker_threads message passing, transferable ArrayBuffers)

### What to do

1. **Worker pool** (`worker-pool.ts`):
   - Fixed pool size: `Math.min(os.cpus().length - 1, 6)`
   - Task queue with bounded backpressure (drop or reject when queue > 512)
   - Round-robin + work-stealing (steal from longest queue)

2. **Chunk worker** (`chunk-worker.ts`):
   - Receives: raw file content + metadata envelope
   - Produces: `{hash, chunks[], entities[], qdrantPayload}`
   - Steps: hashing -> legal-chunker -> entity-extraction -> payload generation
   - Transfer `Float32Array` embedding buffers (zero-copy via `Transferable`)

3. **Batch writer** (`src/lib/server/indexer/qdrant-batch-writer.ts`):
   - Accumulate worker results, flush every 50 items or 2s (whichever first)
   - Retry failed upserts with exponential backoff

### Gemma4 rule

Gemma4 stays OUT of worker pool. Only exception: selective summary tasks where a worker spawns a short Ollama call and stores the result in Redis — no streaming, fire-and-forget only.

---

## Step 4 — feat(cache): add tensor/similarity cache keys

**Files**: `src/lib/server/cache/tensor-cache.ts` (new), updates to `libtorch-bridge.ts`
**Estimated time**: 2-3 hours
**Risk**: Low (additive caching layer, falls through on miss)

### What to do

1. **Embedding cache** — Key: `tensor:embed:{sha256(content)}` -> 768-dim Float32Array (base64 in Redis), TTL: 24h
2. **Centroid member cache** — Key: `tensor:centroid:k{k}:{sha256(sortedMemberIds)}` -> cluster assignment array, TTL: 1h
3. **Similarity result cache** — Key: `tensor:sim:{sha256(queryVec)}:{collectionName}:{limit}` -> scored result list, TTL: 5min
4. **Redis pipeline batching** — Batch `setex` calls in groups of 20 using `redis.pipeline()`

### Smoke test requirement

```typescript
it('repeated query: second call has analysisMs < 5 (cache hit, no GPU)', ...)
it('tensor-cache: embedding stored after first call, retrieved on second', ...)
```

---

## Step 5 — feat(agent): wire Gemma4 tool-call controller to TypeScript MCP graph/search tools

**Files**: `src/mcp/server.ts` (add new tools), `src/lib/server/ai/gemma4-agent.ts` (update tool loop)
**Estimated time**: 4-6 hours
**Risk**: Medium (tool loop requires careful rate limiting and result truncation)

### MCP Tool Surface

All tools are **read-only**. No writes, no mutations.

| Tool name | What it does | Upstream call |
|-----------|-------------|---------------|
| `trace.kag_search` | KAG-style query over Redis + Qdrant + Neo4j | `fetchACPKnowledgeResults()` |
| `topology.search_near` | Find nearby nodes by 4D SOM coordinates | `topoPrefilter()` + Qdrant ANN |
| `graph.expand_neighborhood` | N-hop graph neighbors from a node ID | Neo4j Cypher |
| `graph.shortest_path` | Weighted shortest path between two nodes | Neo4j GDS |
| `clusters.get_summary_lenses` | Cluster summaries + authority scores | Redis + Qdrant payload |
| `trace.explain_retrieval` | Explain why chunks were selected | `retrievalTrace` from ACEContext |

### Tool call flow

```
Gemma4 / Claude (model)
  | tool_calls JSON
  v
trace-mcp-server.ts :8788
  | validates tool name against allowlist
  v
TypeScript handler
  | may call gRPC client (embedding :50051, retrieval :50053)
  v
Go/TS retrieval or embedding service
  |
  v
Result returned to model as tool_result
```

### Configuration

maxToolRounds: 3, maxToolResultChars: 12000
Blocked tools: qdrant.upsert, neo4j.write, redis.set, *write*, *delete*

### YorHA metadata exposure

The OpenAI facade `yorha` block includes: toolsUsed[], toolRounds, toolResultChars

---

## HMM ACE Flow -> 4D Wiki Integration

The HMM section classifier feeds 4D coordinates into the wiki store — narrative coherence dimension of the Karpathy topology.

### 4D coordinate mapping

| Dimension | Source | Meaning |
|-----------|--------|---------|
| **x** | `topology.gridX` (dominant glyph) | NES tile grid X position |
| **y** | `topology.gridY` (dominant glyph) | NES tile grid Y position |
| **z** | `ACEFlowAnalysis.flowScore` | Narrative coherence (0-1) |
| **w** | `SECTION_W[dominantSection]` | Legal document position (0-6) |

SECTION_W: PARTIES=0, JURISDICTION=1, FACTS=2, LEGAL_AUTHORITY=3, CLAIMS=4, PRAYER_HOLDING=5, UNKNOWN=6

### Cache-first logging

Key: `wiki:note:hmm:{glyphPoolHash}` TTL: 6h
glyphPoolHash = sha256(sortedGlyphIds).slice(0, 24)

result.fromCache === true  -> setex was NOT called (Redis hit, skip re-analysis)
result.fromCache === false -> setex was called with 4D note
force=true                 -> bypass cache, always write

### MCP searchability

Gemma4 calls `trace.kag_search` with query "narrative flow coherence"
-> `scanHMMNotes({ minFlowScore: 0.7 }, 50)`
-> sorted by z desc (highest coherence first)
-> each note carries glyphIds, sectionCoverage, compressionHints, gaps

---

## TypeScript 7 Native Audit Lane

`tsgo` runs as a parallel type audit — does NOT replace `svelte-check` or `tsc`.

```bash
cd sveltekit-frontend
npx tsgo --noEmit           # ~10x faster than tsc
npm run typecheck:native    # same via package.json alias
npm run audit:tsgo:json     # writes JSONB to scratch/audits/tsgo-diagnostics.json
```

JSONB output feeds ACE/TRACE as error-relevance signals via `scripts/tsgo-diagnostics-to-jsonb.mjs`.
Side-by-side rule: Keep `typescript` installed for SvelteKit, eslint, typescript-eslint. CI keeps `svelte-check` until TS 7 stable.

---

## Protobuf / MCP-gRPC Lane

```bash
npm run proto:from-zod    # Zod schema -> .proto definitions
npm run proto:compile     # .proto -> TypeScript client stubs
```

Proto files: `src/proto/`. gRPC clients: `src/lib/server/grpc/`. MCP tools call gRPC clients — model never sees gRPC directly.

---

## Quick-Reference npm Scripts

| Script | What it does |
|--------|-------------|
| `trace:start` | Start full TRACE stack (MCP + search + Ollama) |
| `runtime:ensure` | Verify all runtime services healthy before indexing |
| `mcp:trace` | Start `trace-mcp-server.ts` on :8788 |
| `mcp:ensure` | Health-check MCP server, restart if down |
| `search:ensure` | Ensure go-search-service :8096 is up |
| `llama:ensure` | Ensure llama-server TurboQuant :8090 is up |
| `smoke:trace` | 5-pillar smoke test for TRACE stack |
| `gpu:smoke` | Verify GPU addon exports + CUDA available |

---

## VS Code Task Groups

| Group | Tasks | Mode |
|-------|-------|------|
| **TRACE: Ensure Full Stack** | runtime:ensure + mcp:ensure + search:ensure + llama:ensure | Parallel |
| **GPU Gate** | Audit D18 simdjson + Audit D20 GPU Parity + GPU Smoke Hardening | Parallel |
| **Phase A: Map + Verify + Test** | Graphify Map + Verify TRACE + tsgo + Test Code-Intel Suite | Parallel |
| **Phase B: Semantic + Forest** | Graphify Semantic + Forest Warm + Context Build Plan | Parallel |
| **Phase C: GPU** | GPU SOM+Hypergraph + GPU PageRank + GPU Cluster Summaries | Parallel |
| **Quality Gate** | Verify TRACE + Test Code-Intel Suite + tsgo | Parallel |
