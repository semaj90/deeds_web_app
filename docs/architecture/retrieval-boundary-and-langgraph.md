# Retrieval Abstraction & LangGraph Boundary

> **Status**: ENFORCED — also mirrored in `/AGENTS.md` for agent-context pickup.
> **Updated**: 2026-06-19

---

## 1. Retrieval Abstraction Boundary

### Boundary files

| Role | File |
|---|---|
| Vector search backend | `sveltekit-frontend/src/lib/server/search/qdrant-search.ts` |
| Pipeline orchestration | `sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts` |
| Backend interface | `sveltekit-frontend/src/lib/server/search/search-backend.ts` |

### `SearchBackend<T>` interface

The only public surface callers may touch:

```typescript
export interface SearchBackendRequest {
  embedding: number[];
  limit?: number;
  topoClass?: string;
  collection?: string;
}

export interface SearchBackend<TResult> {
  readonly name: string;
  search(request: SearchBackendRequest): Promise<TResult[]>;
}
```

Callers must code against `SearchBackend<T>`, never against `QdrantClient` or any Qdrant-specific type directly.

### Retrieval policy (ordered)

1. **Filter first** — payload conditions, `topo_class`, encoded-cluster prefilter (`ACE_ENCODED_PREFILTER_ENABLED`)
2. **Approximate semantic search** — Qdrant ANN on quantized / HNSW-compressed vectors (bounded candidate set)
3. **Exact rescore** — only on the bounded set, only when quality threshold or telemetry gate requires it (`CORRECTIVE_RAG_THRESHOLD`)

### cuVS / CAGRA swap surface

cuVS is an **optional GPU acceleration lane** behind the same `SearchBackend<T>` contract.

- cuVS is NOT the canonical store
- cuVS does NOT change the result shape or caller API
- When cuVS is present it replaces Qdrant's ANN pass only — filter and rescore steps are unchanged
- Implementation path: a new `CuVSSearchBackend implements SearchBackend<QdrantCodeResult>` registered via `getCodebaseAnnBackend()` in `codebase-ann-backend.ts`

### Canonical truth

| Store | Role |
|---|---|
| **Postgres** `atlas_packets`, `nes_chrom_packets`, `research_summaries` | Canonical truth — packet/ledger tables |
| `sourceRef` + cold-original provenance | Join key and cold storage locator |
| **Parent Atlas** `@deeds/parent-atlas` | Canonical join spine (`sourceRef + feature_id`) |
| **Qdrant** | Mirror only — approximate geometry, not truth |
| **Redis / Valkey** | Bitfrost hot cache, centroid routing — not truth |
| **Neo4j** | Graph topology mirror — not truth |

---

## 2. LangGraph Boundary

LangGraph is **optional orchestration and testing infrastructure only**.

### Allowed

- Validation workflows (dry-run only)
- Planning graphs — agent sequencing, step dependency resolution
- Subagent task graphs
- Gemma4 / function-tool calling simulation
- Dry-run reasoning traces (no side effects)

### Hard blocked — never from a graph node

| Operation | Why blocked |
|---|---|
| Direct write to Postgres | Must go through promotion queue + schema gates |
| Direct write to Qdrant | Must go through sync lane + payload contract |
| Direct write to Redis / Valkey | Must go through bounded apply scripts |
| Direct write to Neo4j | Must go through graph-sync lane |
| Direct write to DuckDB | Must go through audit-only pipeline |
| Direct write to SeaweedFS | Must go through archival promotion gate |
| Archive / move / delete operations | Must go through validation report + bounded apply |

### Mutation path (always)

```
LangGraph node
    (read-only decision / plan)
    -> Promotion queue entry
    -> Schema gate validation
    -> Validation report (dry-run, human-reviewable)
    -> Bounded apply script (--apply flag, explicit approval)
    -> Durable write to store
```

---

## 3. Canonical join spine

The join key across all stores is:

- `sourceRef`  — file path / chunk ID, stable across Qdrant, Postgres, Redis, Neo4j
- `feature_id` — feature cluster label, from Parent Atlas MapReduce

No retrieval result, graph node output, or telemetry row is canonical unless it carries both.
