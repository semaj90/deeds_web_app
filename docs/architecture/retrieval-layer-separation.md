# Retrieval Layer Separation

_Date: 2026-06-02_

## The three layers

The retrieval stack is now separated into three distinct layers. Reports and
new code must not mix them.

```
Layer 1 — Orchestration
  retrieval/orchestrator.ts
    embed → sparse gate → vector search → corrective RAG →
    graph expansion → authority scoring → GRPO rerank →
    ACE context pack

Layer 2 — Search Contract
  search/qdrant-search.ts          (canonical entry point for codebase ANN)
    searchCodebaseAnn()            (the stable caller contract)
    getCodebaseAnnBackend()        (reads CODEBASE_ANN_BACKEND env var)

Layer 3 — Backend Implementation
  search/qdrant-search.ts          → Qdrant HNSW      (default, production)
  search/turbovec-search.ts        → TurboVec SIMD    (acceleration lane)
  retrieval/turbovec-rerank.ts     → TurboVec rerank  (post-ANN pass)
  [future] cuVS/CAGRA worker      → GPU ANN           (experimental seam)
  [future] IVF-RaBitQ worker      → compressed ANN    (future)
```

## The hard rule

**Callers never call Qdrant directly.**

All retrieval flows enter through `retrieval/orchestrator.ts` for the full
pipeline, or `search/qdrant-search.ts:searchCodebaseAnn()` for a bare
ANN call. No route, service, or graph node should import `QdrantManager`
and call `.search()` for retrieval work.

The reason: the backend is already swappable via `CODEBASE_ANN_BACKEND`.
A caller that bypasses the contract breaks the swap and couples the call
site to Qdrant specifically.

## Compressed semantic geometry rule

The retrieval lane uses **compressed approximate semantic geometry with optional
exact rescore**.

That means:

```txt
payload / sourceRef / feature_id filters
  -> approximate ANN over compressed or indexed vector geometry
  -> dynamic oversampling when the query is ambiguous
  -> optional exact rescore on the smaller candidate set
  -> graph expansion and packet assembly
```

Qdrant owns the default HNSW / payload-filtered candidate search. TurboVec and
LibTorch may rerank or rescore bounded candidate sets, but they do not replace
the `SearchBackend.search()` contract or the Postgres/sourceRef ledger.

## What each layer is responsible for

### Layer 1 — Orchestration (`retrieval/orchestrator.ts`)

- Chooses what to search, in what order, with what filters
- Composes the pipeline: embed → ANN → graph → rerank → pack
- Adds corrective RAG, DAG citation ordering, authority chain expansion
- Reads `RetrievalRequest`, returns `RetrievalResult`
- Logs inference observations via `logInference()`
- Is read-only: no writes to Postgres, Qdrant, Redis, Neo4j from here

The orchestrator owns the *policy*. It does not own the ANN math.

### Layer 2 — Search Contract (`search/qdrant-search.ts`)

```typescript
// Stable caller contract — backend can swap without breaking callers
export async function searchCodebaseAnn(
  embedding: number[],
  limit?: number,
  topoClass?: string,
  collection?: string
): Promise<QdrantCodeResult[]>
```

This function signature is the stable contract. Callers get back
`QdrantCodeResult[]` regardless of which backend is active.

The contract file also owns:
- `QdrantCodeResult` type (the shared result shape)
- backend routing via `getCodebaseAnnBackend()`
- the fall-through comment explaining the cuVS future seam

### Layer 3 — Backend Implementations

| File | Backend | Status | When active |
|---|---|---|---|
| `search/qdrant-search.ts` (inline) | Qdrant HNSW | Production | `CODEBASE_ANN_BACKEND=qdrant` (default) |
| `search/turbovec-search.ts` | TurboVec SIMD | Acceleration lane | `CODEBASE_ANN_BACKEND=turbovec` |
| `retrieval/turbovec-rerank.ts` | TurboVec rerank | Post-ANN pass | called from orchestrator after ANN |
| `retrieval/turbovec-prefilter.ts` | TurboVec prefilter | Candidate pruning | optional pre-ANN stage |
| [future] cuVS gRPC worker | cuVS CAGRA | Experimental | behind same `searchCodebaseAnn()` |
| [future] Rust ANN gRPC | IVF-RaBitQ | Future | behind same contract |

## TurboVec is additive, not a replacement

TurboVec accelerates two specific passes that Qdrant is not designed for:

**Rerank pass** (current):
```
Qdrant top-100
  → JS cosine / GPU attention (libtorch)
    → now: turbovecRerank() SIMD batch cosine
      → top-10 to orchestrator
```

**Candidate prefilter** (current):
```
1000 HyperRAG candidates
  → turbovecPrefilter() compressed embedding prune
    → 100 candidates
      → Gemma4 synthesis
```

Qdrant remains the ANN store. TurboVec is a SIMD acceleration layer that
sits after Qdrant on the hot rerank path and optionally before Qdrant on
the candidate pruning path.

## Valkey cache layout for this stack

Each layer caches at a different granularity:

| Key | Layer | What is cached |
|---|---|---|
| `cache:prompt:{sha256}` | Orchestrator | Full answer + sourceRefs. Exact-match hit skips all layers. |
| `cache:semantic:{emb_hash}` | Contract | Packet IDs + feature IDs for a query embedding. Bifrost L2 cache. |
| `ace:topo:{class}:{hash}` | Contract | Topo-byte prefilter candidates. TTL 300s. Skips Qdrant ANN on hit. |
| `gpu:karpathy:scores` | Contract | Karpathy blend per file path. Used for post-ANN rerank. |
| `ace:task:{workspace_task_id}` | Orchestrator | Task semantic packet (T4 hot-context). |
| `engram:{workspace_task_id}` | Orchestrator | Engram memory tuple. |

## ACE blend weights (canonical)

The final ordering after retrieval passes uses the Karpathy blend:

```
semantic_vector  × 0.60
tag_score        × 0.12
ast_graph        × 0.10
som_boost        × 0.08
hyperedge        × 0.10
```

Community context (GraphRAG preamble) is prepended but not scored inline.

## What is complete as of 2026-06-02

| Component | State |
|---|---|
| `retrieval/orchestrator.ts` | Production — full pipeline wired |
| `search/qdrant-search.ts` + contract | Production — backend routing live |
| `search/turbovec-search.ts` | Acceleration lane — active when `CODEBASE_ANN_BACKEND=turbovec` |
| `retrieval/turbovec-rerank.ts` | Wired from orchestrator |
| `parent_atlas_documents` | 5,253 rows promoted |
| `task_semantic_packets` | 185 rows with `summary_llm` |
| `ace:task:*` Redis keys | Populated on T4 pass |
| Valkey (valkey-bundle 8.1.1) | Live on 127.0.0.1:6379 |
| GPU bridge | 15 live exports, FP16 OK, CUDA graph OK |
| cuVS CAGRA | Not yet implemented — seam ready in Layer 3 |
| Rust gRPC ANN | Not yet implemented — seam ready in Layer 3 |
| TurboVec N-API module | Sidecar path active; native N-API path pending build |

## What the pipeline promotion looks like

The repo-to-retrieval pipeline is now operational end-to-end:

```
Repo files
  ↓ packetizer (scripts/atlas/*)
Postgres ledger (task_semantic_packets, parent_atlas_documents)
  ↓ Gemma4 summarizer (T3)
summary_llm written to packets
  ↓ Redis T4 push
ace:task:{id} hot cache
  ↓ Qdrant index
codebase_chunks_768 (768d, HNSW)
  ↓ searchCodebaseAnn() via Layer 2 contract
ANN candidates
  ↓ turbovecRerank() via Layer 3
Reranked top-K
  ↓ orchestrator.ts assembly
RetrievalResult → Gemma4 context
```

## Where new code belongs

| Task | Layer | File |
|---|---|---|
| Add a new retrieval strategy (new ANN or prefilter) | Layer 3 | New file in `search/` or `retrieval/`, routed via `getCodebaseAnnBackend()` or called from orchestrator |
| Change what the orchestrator does with results | Layer 1 | `retrieval/orchestrator.ts` |
| Add a new caller that needs retrieval | Layer 1 | Call `orchestrator.retrieve()` or `searchCodebaseAnn()` — never `QdrantManager.search()` directly |
| Change result shape | Layer 2 | Update `QdrantCodeResult` in `search/qdrant-search.ts` AND `search/turbovec-search.ts` |
| Add a Valkey cache key | Any | Add to the table above; use ioredis cold-start pattern from `memory/ioredis-coldstart-pattern.md` |

## Cross-references

- [qdrant-search-contract.md](qdrant-search-contract.md) — Qdrant Query API patterns (multi-stage, fusion, grouping)
- [compressed-semantic-geometry.md](compressed-semantic-geometry.md) — Filter first, approximate compressed search second, exact rescore only on bounded candidates
- [retrieval-architecture.md](retrieval-architecture.md) — Staged pipeline: sparse → dense → graph → synthesis
- [cold-warm-hot-packet-lifecycle.md](cold-warm-hot-packet-lifecycle.md) — Storage tier rules; superseded-score is advisory
- [trace-runtime-split.md](trace-runtime-split.md) — MCP boundary rule: Gemma4 calls MCP tools, not raw Qdrant/Postgres
- [storage-tier-schema.md](storage-tier-schema.md) — Postgres + Qdrant + Valkey tier responsibilities
- `sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts` — Layer 1 implementation
- `sveltekit-frontend/src/lib/server/search/qdrant-search.ts` — Layer 2 contract
- `sveltekit-frontend/src/lib/server/search/turbovec-search.ts` — Layer 3 acceleration backend
- `sveltekit-frontend/src/lib/server/search/codebase-ann-backend.ts` — Backend selector
