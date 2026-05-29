# cluster-cards.jsonl — Schema and usage

This folder contains the canonical JSON Schema and an example line for the `cluster-cards.jsonl` artifact produced by the clustering/aggregation pipeline.

Files:
- `cluster-cards.schema.json` — JSON Schema (Draft-07) for each cluster card object.
- `cluster-cards.example.jsonl` — Single-line example; real centroid vectors are typically 768-dim float arrays.

Purpose:
- Materialize cluster cards as newline-delimited JSON so they can be bulk-loaded into Postgres JSONB, Redis, or Qdrant payloads.
- Each card represents a cluster centroid + metadata used by downstream UI, ranking, and pipeline synthesis (e.g., pathway cards).

Validation:
Install `ajv-cli` (or use any JSON Schema validator) and run:

```bash
npm install -g ajv-cli
ajv validate -s docs/cluster-cards.schema.json -d docs/cluster-cards.example.jsonl
```

Note: the example uses a short centroid vector for readability. Production cards should include the full embedding vector length used by the pipeline (e.g., 768 floats). If you want to store vectors in a more compact form for export/import, consider base64-encoding the Float32 blob and adding a `centroid_vector_b64` field alongside or instead of `centroid_vector`.

Load into Postgres (bulk import example):

```sql
-- Using psql on a table 'cluster_cards' with a jsonb column 'card'
COPY cluster_cards(card) FROM '/path/to/cluster-cards.jsonl';
```

Or ingest into Qdrant as payloads keyed by `id` and with `centroid_vector` as the centroid/metadata.

Where to place the artifact:
- `sveltekit-frontend/memory/cluster-cards/cluster-cards.jsonl` is a recommended location (gitignored). The orchestration scripts expect the pipeline to write into `memory/`.
