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
To run the full pipeline (Export -> Build -> Topology -> Tag):

```bash
node sveltekit-frontend/scripts/hypergraph-pipeline.mjs codebase_chunks_768 100
```

Individual steps:
- `hypergraph-build.mjs` — Streaming online k-means builder with optional Redis checkpointing. Reads NDJSON of embeddings and writes centroids + assignments.
- `export-embeddings-qdrant.mjs` — Pulls vectors from Qdrant into NDJSON.
- `hypergraph-topology-writer.mjs` — Computes k-NN among centroids for fast greedy lookup.
- `hypergraph-tag-qdrant.mjs` — Writes `som_cluster` payload back to Qdrant.

Lookup Server
-------------
The lookup server (`hypergraph-lookup-server.mjs`) supports:
1. **Brute force lookup**: Good for small $K$.
2. **Greedy Topology Search**: Uses the neighbor graph to find the nearest centroid in $O(\log K)$ steps. Triggered automatically if neighbors are indexed.

Next steps
----------
- Integrate Postgres research_summaries into the pipeline.
- Add cluster-narrative generation via Ollama (Gemma4).
- Tune `--checkpoint-every` and `--batch-size` for your environment.

Notes
-----
- The script is intentionally dependency-light; if you want Redis checkpoints, ensure `ioredis` is installed in the frontend workspace.
- Run the script outside Vite (separate terminal) to avoid memory contention.
