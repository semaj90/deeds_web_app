Hypergraph Build & Export Scripts
================================

Overview
--------
This folder contains tools to build a hypergraph / cluster index from vector embeddings outside of the Vite dev process to avoid OOM during large k-means jobs.

Files
-----
- `hypergraph-build.mjs` — Streaming online k-means builder with optional Redis checkpointing. Reads NDJSON of embeddings and writes centroids + assignments.

Quick Usage
-----------
From the repository root run:

```bash
node sveltekit-frontend/scripts/hypergraph-build.mjs \
  --input path/to/embeddings.ndjson \
  --clusters 100 \
  --batch-size 200 \
  --out next_steps/active/hyper_centroids.json \
  --assignments next_steps/active/hyper_assignments.ndjson
```

With Redis checkpointing (recommended for long runs):

```bash
npm run --workspace sveltekit-frontend hypergraph:build:redis -- \
  --input path/to/embeddings.ndjson \
  --clusters 100 \
  --out next_steps/active/hyper_centroids.json
```

Input format
------------
NDJSON where each line is a JSON object with at least an `id` and `embedding` array, for example:

```json
{"id":"vec-1","embedding":[0.12,0.33,...]}
```

Next steps
----------
- Export embeddings from Qdrant or Postgres into NDJSON (driver script planned).
- Add SOM/topology indexing to shard centroids into Redis for fast nearest-centroid lookups.
- Tune `--checkpoint-every` and `--batch-size` for your environment.

Notes
-----
- The script is intentionally dependency-light; if you want Redis checkpoints, ensure `ioredis` is installed in the frontend workspace.
- Run the script outside Vite (separate terminal) to avoid memory contention.
