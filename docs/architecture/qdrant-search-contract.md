# Qdrant Search Contract

This repo uses Qdrant in two different ways:

- simple semantic lookup for one query vector at a time
- multi-query / multi-stage retrieval for hybrid and cluster-aware search

The first path is already in production code. The second path is the one to
use when we need staged candidate generation, fusion, or cluster-topic recall.

## Current Repo Surfaces

| File | Role |
|---|---|
| [sveltekit-frontend/src/routes/api/tags/search/+server.ts](../../sveltekit-frontend/src/routes/api/tags/search/+server.ts) | Semantic tag search over `document_tags` using `searchTagsBySemantic()`. |
| [sveltekit-frontend/src/lib/server/ace/tag-sync.ts](../../sveltekit-frontend/src/lib/server/ace/tag-sync.ts) | Mirrors tags to Postgres, Qdrant, and CouchDB, and exposes semantic tag search. |
| [sveltekit-frontend/src/lib/server/search/qdrant-search.ts](../../sveltekit-frontend/src/lib/server/search/qdrant-search.ts) | Codebase semantic search with `topo_class` filtering and encoded-cluster prefilter hooks. |
| [sveltekit-frontend/src/lib/server/retrieval/codebase-context.ts](../../sveltekit-frontend/src/lib/server/retrieval/codebase-context.ts) | Cluster-aware retrieval using `neo4j_gpuCluster` and `som_cluster`. |
| [sveltekit-frontend/src/lib/server/ace/cluster-tags-cache.ts](../../sveltekit-frontend/src/lib/server/ace/cluster-tags-cache.ts) | Hot cache for `qdrant_cluster_tags.json` and related cluster summaries. |
| [sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts](../../sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts) | Central Qdrant client and payload indexer for `cluster_id`, `som_cluster`, `tags`, and `topo_class`. |
| [sveltekit-frontend/src/lib/server/services/knowledge-search/QdrantKnowledgeStore.ts](../../sveltekit-frontend/src/lib/server/services/knowledge-search/QdrantKnowledgeStore.ts) | Plain Qdrant search builder for tags, source, date, and payload filters. |

## What Qdrant Calls This

Qdrant exposes a single Query API for most search shapes:

- nearest-neighbor search
- search by ID
- recommendations
- discovery search
- scroll
- grouping
- order-by
- hybrid search
- multi-stage search
- random sampling

The key endpoint is:

```http
POST /collections/{collection_name}/points/query
```

For multi-query work, the important pieces are:

- `prefetch` for subqueries
- `query` for the main query or fusion step
- `fusion: "rrf"` or `fusion: "dbsf"` for result fusion
- nested `prefetch` for staged retrieval
- `group_by` when you want one result group per document or cluster

## Official Query Patterns To Use

Use these patterns when the repo needs more than a single ANN call:

```json
{
  "prefetch": [
    {
      "query": [0.01, 0.45, 0.67],
      "using": "dense",
      "limit": 20
    },
    {
      "query": {
        "indices": [1, 42],
        "values": [0.22, 0.8]
      },
      "using": "sparse",
      "limit": 20
    }
  ],
  "query": {
    "fusion": "rrf"
  },
  "limit": 10
}
```

Use multi-stage rescoring when a cheap representation should fetch candidates
and a larger representation should do the final ranking.

Use grouping when multiple chunk points belong to the same document and you want
to suppress duplicate documents in the result set.

## Repo Search Contract

For this codebase, the stable search contract is:

- use `match: { any: [...] }` for array payload filters like tags
- use `match: { value: ... }` for scalar payload filters like cluster IDs
- create payload indexes for hot filter fields before depending on restrictive queries
- use `score_threshold` only for simple semantic lookups where a cutoff is useful
- keep `searchTagsBySemantic()` and plain `QdrantManager.search()` for simple lookups
- use the Query API for cluster-topic recall, hybrid sparse+dense fusion, and staged rescoring

## How This Maps To The Current Roadmap

- cluster topic recall should start from `cluster-tags-cache.ts`
- warm routing should come from `centroid_id`, `cluster_id`, and `som_cluster`
- hot recall should land in Redis before Qdrant ANN
- final rerank should happen after the query API reduces the candidate set

## Caller Rule (added 2026-06-02)

Qdrant is Layer 3 — a backend implementation, not a public API.

Do not import `QdrantManager` and call `.search()` from routes, services,
or LangGraph nodes. All ANN retrieval enters through:

- `retrieval/orchestrator.ts` — full pipeline (embed → ANN → graph → rerank → pack)
- `search/qdrant-search.ts:searchCodebaseAnn()` — bare ANN call with stable contract

The backend behind `searchCodebaseAnn()` is swappable via `CODEBASE_ANN_BACKEND`.
Current options: `qdrant` (default), `turbovec`. Future: cuVS, Rust gRPC ANN.

See [retrieval-layer-separation.md](retrieval-layer-separation.md) for the full
three-layer architecture and where new code belongs.

## References

- Qdrant Search: https://qdrant.tech/documentation/search/search/
- Qdrant Hybrid Queries: https://qdrant.tech/documentation/search/hybrid-queries/
- Qdrant Query API schema: https://api.qdrant.tech/api-reference/search/query-points
- Storage tier design: [storage-tier-schema.md](storage-tier-schema.md)
- Retrieval architecture: [retrieval-architecture.md](retrieval-architecture.md)
- Three-layer separation: [retrieval-layer-separation.md](retrieval-layer-separation.md)
- Active roadmap note: [2026-05-19_qdrant-cluster-autoencoder-roadmap.md](../../next_steps/active/2026-05-19_qdrant-cluster-autoencoder-roadmap.md)