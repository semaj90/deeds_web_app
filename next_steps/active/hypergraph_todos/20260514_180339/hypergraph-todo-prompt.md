# Hypergraph Todo Prompt

Use this as the next hypergraph/topology task prompt.

## Goal
Export codebase embeddings, build k-means topology, and prepare the data model for SOM + manifold4 without overfitting terminology.

## Current plan
1. Export `codebase_chunks_768` embeddings to NDJSON.
2. Build 100 clusters with batch-safe checkpointing.
3. Optionally run the Redis checkpoint mode for long builds.
4. Add SOM/grid topology after k-means.
5. Store chunk topology metadata as `cluster_id`, `som_x`, `som_y`, `semantic_z`, `activity_w`, and `manifold4`.

## Suggested commands
```bash
npm run hypergraph:export

node sveltekit-frontend/scripts/export-embeddings-qdrant.mjs \
  --collection codebase_chunks_768 \
  --vector-name content \
  --output tmp/codebase_chunks_768-embeddings.ndjson

node sveltekit-frontend/scripts/hypergraph-build.mjs \
  --input tmp/codebase_chunks_768-embeddings.ndjson \
  --clusters 100 \
  --batch-size 200 \
  --checkpoint-every 1000 \
  --out next_steps/active/hyper_centroids.json \
  --assignments next_steps/active/hyper_assignments.ndjson

npm run --workspace sveltekit-frontend hypergraph:build:redis -- \
  --input tmp/codebase_chunks_768-embeddings.ndjson \
  --clusters 100 \
  --batch-size 200 \
  --checkpoint-every 1000 \
  --out next_steps/active/hyper_centroids.json
```

## Hardware tuning
- Start with `clusters=100`, `batch-size=200`, `checkpoint-every=1000`.
- If memory spikes, drop to `batch-size=50` and `checkpoint-every=250`.
- If stable, increase `batch-size` toward `500`.

## Terminology
- `manifold4` is a retrieval/topology coordinate, not a quaternion.
- Quaternion means 3D rotation `[w, x, y, z]`.
- `manifold4` means `[som_x, som_y, semantic_z, activity_w]`.
- Do not use quaternion language unless the value actually encodes rotation.

## Suggested storage shape
```json
{
  "chunk_id": "chunk_123",
  "cluster_id": "cluster_42",
  "som_x": 8,
  "som_y": 5,
  "semantic_z": 0.83,
  "activity_w": 0.22,
  "manifold4": [8, 5, 0.83, 0.22]
}
```

## Notes
- Keep topology snapshots durable in files and Postgres.
- Use Redis for hot centroid lookup and ACE context cache only.
- Backfill Qdrant payloads with cluster/topology fields after the build.
