# Atlas Export → Cluster Worker

Overview
- Hybrid flow: Node orchestrator dispatches a Python clustering worker. Node previews Qdrant upsert (centroids), optional Redis invalidation.
- Dry-run first. Writes to Qdrant/Redis only with explicit flags.

Files
- `scripts/opencode/export-listener.mjs` — watcher / one-shot dispatcher. Use `--once --input <jsonl>` for single-run.
- `workers/atlas-cluster-worker.py` — Python k-means worker. Produces `.tmp/atlas-cluster-assignments.jsonl` and `.tmp/atlas-cluster-assignments.centroids.json`.
- `scripts/atlas/qdrant-upsert-clusters.mjs` — preview or upsert centroids to Qdrant. Use `--write` to perform writes. Use `--publish` to publish Redis invalidation.
- `scripts/atlas/qdrant-utils.mjs` — helpers to build Qdrant point payloads.

Rules
- No Qdrant writes unless `--write` is provided to `qdrant-upsert-clusters.mjs`.
- No Redis publish unless `--publish` is provided.
- No Postgres writes anywhere in this flow.
- Input must be JSONL/NDJSON and contain `sourceRef` (or `source_ref`). Rows without `sourceRef` are rejected.
- Preserve `sourceRef` and `graphVersion` in outputs.
- Validate vector dimension (default 768). Rows with bad dim are rejected.
- Output assignments: `.tmp/atlas-cluster-assignments.jsonl` (rows with `id, sourceRef, graphVersion, cluster, distance`) and centroids summary `.tmp/atlas-cluster-assignments.centroids.json`.

Extra rule
- Do not use clustering output for reward attribution until sourceRef/card joins are fixed (Phase19B). Clustering is preview-only until joins are validated.

Dry-run commands
```bash
node scripts/opencode/export-listener.mjs --once --input memory/exports/atlas/cards.jsonl --dry-run
python workers/atlas-cluster-worker.py \
  --input memory/exports/atlas/cards.jsonl \
  --out .tmp/atlas-cluster-assignments.jsonl \
  --k 16 \
  --dry-run
node scripts/atlas/qdrant-upsert-clusters.mjs \
  --input .tmp/atlas-cluster-assignments.centroids.json \
  --collection codebase_chunks_768 \
  --dry-run
```

Worker report fields (printed to stdout)
- `rows read`
- `rows accepted`
- `rows rejected_missing_sourceRef`
- `rows rejected_bad_dim`
- `clusters produced`
- `avg distance to centroid`
- `output path`

Notes
- The Python worker uses a minimal numpy-based k-means implementation to avoid heavy dependencies. It writes centroids as JSON for the Node upsert preview.
- Qdrant upsert uses centroid vectors (one point per cluster). If you prefer upserting members, change the workflow but remember the rules about not writing unless `--write`.
# Atlas Export Cluster Worker

Purpose: orchestrate an export → clustering → Qdrant preview pipeline. This is intentionally dry-run first.

Components
- `scripts/opencode/export-listener.mjs` — Node one-shot runner (spawns Python worker, previews Qdrant upsert).
- `workers/atlas-cluster-worker.py` — Python clustering worker. Dry-run uses deterministic hash-based assignment. Real KMeans requires `numpy` and `scikit-learn`.
- `scripts/atlas/qdrant-upsert-clusters.mjs` — preview/persist Qdrant upserts; honors `--dry-run`, `--write`, and `--publish` flags.
- `scripts/atlas/qdrant-utils.mjs` — helper for Qdrant HTTP upsert.

Rules
- No Qdrant writes unless `--write` is given.
- No Redis publish unless `--publish` is given.
- No Postgres writes performed by these scripts.
- Input must be NDJSON/JSONL; each row must include `sourceRef` and embedding vector of configured dimension (default 768).
- Preserve `sourceRef` and `graphVersion` in outputs and Qdrant payloads.
- Validate vector dimension; reject rows with bad dims.
- Output assignments are written to `.tmp/atlas-cluster-assignments.jsonl` by default.
- Extra rule: Do not use clustering output for reward attribution until sourceRef/card joins are fixed.

Dry-run test commands

```bash
node scripts/opencode/export-listener.mjs --once --input memory/exports/atlas/cards.jsonl --dry-run
python workers/atlas-cluster-worker.py \
  --input memory/exports/atlas/cards.jsonl \
  --out .tmp/atlas-cluster-assignments.jsonl \
  --k 16 \
  --dry-run
node scripts/atlas/qdrant-upsert-clusters.mjs \
  --input .tmp/atlas-cluster-assignments.jsonl \
  --collection codebase_chunks_768 \
  --dry-run
```

Worker report fields
- `rows read`
- `rows accepted`
- `rows rejected_missing_sourceRef`
- `rows rejected_bad_dim`
- `clusters produced`
- `avg distance to centroid`
- `output path`

Notes
- The Python worker uses a lightweight deterministic assignment in `--dry-run` so the shape is validated without heavy dependencies.
- For production clustering, install `numpy` and `scikit-learn` in the worker environment.

Publishing invalidation

If you want to publish a bifrost/Redis invalidation message without performing Qdrant writes, use the helper:

```bash
# dry-run (prints message)
node scripts/atlas/publish-bifrost-invalidation.mjs --collection codebase_chunks_768 --dry-run

# publish to Redis (requires REDIS_URL env var, or defaults to redis://localhost:6379)
REDIS_URL=redis://redis:6379 node scripts/atlas/publish-bifrost-invalidation.mjs --collection codebase_chunks_768 --publish
```

The publisher prefers `ioredis` (already in repo deps) and falls back to the node `redis` client if available.
