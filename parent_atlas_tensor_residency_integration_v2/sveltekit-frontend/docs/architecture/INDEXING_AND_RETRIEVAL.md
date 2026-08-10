# Indexing and Retrieval

## Postgres indexes

Use B-tree for exact/revision/tile membership lookups. Use BRIN only for append-correlated large event/time columns such as residency event `created_at`.

## Arrow index

The Arrow IPC file is the bulk artifact. `atlas_tensor_artifacts` points to it. `atlas_tensor_tiles.record_batch_index` identifies the record batch for a logical tile. `atlas_tensor_tile_members` maps packet keys to row offsets when reverse lookup is required.

## ANN

Do not cache HNSW internal levels as Atlas semantics. Cache revision-qualified route results, centroids, SOM cells, and candidate packet keys. HNSW/CAGRA internal node IDs remain backend-local.

## Retrieval flow

```text
query → semantic_768
      → centroid similarity
      → SOM/topology tile hints
      → ACE promotes tile(s)
      → exact/CAGRA/Qdrant candidates
      → canonical candidate IDs
      → graph/feature enrichment
      → canonical reranker
```

The tile stage is a prefilter/routing accelerator, not an independent fusion vote.
