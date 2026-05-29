# Atlas: Glyphs → QLoRA pipeline

This folder contains tools and scripts for ingesting ACE packet cards into Postgres as `glyph_records`, computing GRPO reward scores, assembling JSONL training pairs, sampling for active learning, and recording LoRA adapter checkpoints.

High-level guidance
- This directory is for offline batch jobs only. Do NOT call these scripts from SvelteKit request handlers.
- All SQL migrations live under `sveltekit-frontend/drizzle/manual/` and are applied manually by operators.
- By default, the ingestion script runs in dry-run mode and will not write to the database unless `--apply` is passed.

Quick start (dry-run)

```bash
# from repo root
node scripts/atlas/ingest-ace-cards-to-glyphs.mjs      # dry-run: print summary + sample SQL
node scripts/atlas/ingest-ace-cards-to-glyphs.mjs --out sql  # write SQL to scripts/atlas/out/
```

To actually write rows to Postgres, ensure you have reviewed the manual migrations and run the SQL in `sveltekit-frontend/drizzle/manual/` on the target DB, then run:

```bash
node scripts/atlas/ingest-ace-cards-to-glyphs.mjs --apply
```

Notes
- The ingestion script will not query Qdrant, Redis, or SeaweedFS. Embedding and centroid fields are left null for Phase 2 to fill.
- The pipeline uses `glyph_records` table shape from `sveltekit-frontend/drizzle/manual/20260529_glyph_records.sql`.
- Keep LoRA weights out of git; adapters should be uploaded to SeaweedFS and referenced by `lora_training_runs.checkpoint_uri`.

Next steps
- `compute-glyph-rewards.mjs` — compute `reward_score` using GPU or CPU fallback.
- `glyphs-to-training-pairs.mjs` — assemble `{prompt,completion,reward}` JSONL for QLoRA training.
- `sample-glyphs-for-training.mjs` — active learning sampler to select informative glyphs.

If you want me to proceed, I can create `compute-glyph-rewards.mjs` next.
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
