Prepare knowledge-layer artifacts
================================

This folder contains helpers to assemble a compact knowledge layer from local assets (sidecar audits, parent atlas, feature files) and prepare payloads for Qdrant ingestion.

Files
- `prepare-knowledge-layer.mjs` — aggregates notecards and writes:
  - `.opencode/knowledge-notecards.jsonl` — newline-delimited notecards
  - `.opencode/qdrant-sidecar-payload.jsonl` — Qdrant-ready objects with `vector: null` placeholder

Usage (dry-run)

Run locally (does NOT call embedding endpoints by default):

```bash
node sveltekit-frontend/scripts/atlas/prepare-knowledge-layer.mjs
```

To generate embeddings (operator-only, requires a running embed service):

```bash
# example: embed endpoint at http://localhost:5173/api/embed
node sveltekit-frontend/scripts/atlas/prepare-knowledge-layer.mjs --embed --host http://localhost:5173
```

Operator guidance
- Inspect `.opencode/knowledge-notecards.jsonl` and verify titles/summaries before embedding.
- Use your preferred embedding service (Ollama, local embed endpoint, or remote) to produce 768-dim vectors.
- Write vectors back into `.opencode/qdrant-sidecar-payload.jsonl` replacing `vector: null` with the numeric array.
- Use Qdrant bulk import or the project's existing Qdrant ingestion scripts to push the payload into `codebase_chunks_768` or a new collection `sidecar_notecards_768`.

Graph analysis
- Once ingested into Qdrant, run multi-hop retrieval from key seeds (e.g., destructive_risk entries) and combine with the codebase graph (`scripts/graph-data-500.json`) for feature-label mapping.
- We provide `scripts/graph-analysis-results.json` as an example input for graph analytic pipelines. Prefer running the heavy analysis on a workstation or CI runner with GPU and Qdrant available.
