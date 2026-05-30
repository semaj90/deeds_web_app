# Phase19C — Build GPU-ready analytics dataset (local only)

Purpose
-------
Produce an on-disk analytics dataset for GPU training/analysis without writing to Qdrant or Redis. This step preserves `sourceRef` and `graphVersion`, applies a `schemaMask`, and emits:

- `atlas-training-dataset.jsonl` — merged training rows (glyphs, ledger rows, calls, uses)
- `atlas-vector64-dataset.jsonl` — deterministic 64-dim float vectors for each row (placeholder for autoencoder outputs)
- `atlas-reward-attribution.json` — summary report highlighting missing joins and counts

Requirements & Safety
---------------------
- No writes to Qdrant, Redis, or Postgres are performed by this script.
- Preserve `sourceRef` and `graphVersion` fields verbatim when present.
- Provide `--schema-mask` to tag outputs.
- No LoRA or model training performed.

Usage
-----
Run from repository root. Example:

```powershell
node scripts/atlas/build_phase19c_atlas.mjs \
  --input-glyphs memory/exports/glyph_records.jsonl \
  --input-ledger memory/exports/outcome-ledger.ndjson \
  --input-calls memory/exports/calls-edges.jsonl \
  --input-uses-db memory/exports/uses-db.jsonl \
  --input-uses-tool memory/exports/uses-tool.jsonl \
  --out-dir .tmp/phase19c \
  --schema-mask phase19c.v1 \
  --graph-version 1
```

Outputs
-------
- `.tmp/phase19c/atlas-training-dataset.jsonl`
- `.tmp/phase19c/atlas-vector64-dataset.jsonl`
- `.tmp/phase19c/atlas-reward-attribution.json`

Notes
-----
- `atlas-vector64-dataset.jsonl` uses a deterministic hash-to-vector function as a placeholder for a real autoencoder; replace with real autoencoder outputs later.
- The `atlas-reward-attribution.json` includes a `missingJoins` sample (first 100) to help debug join key issues—this is the immediate blocker before meaningful reward learning.

Next Steps
----------
- Run the script and inspect `atlas-reward-attribution.json` to measure how many ledger rows lack `sourceRef` joins.
- Implement Phase19B backfill to populate `card_source_refs` and `card_id` columns, then regenerate datasets.
Atlas loader helper

This folder contains tooling to persist the scanner output `.tmp/atlas-component-profiles.jsonl` into Postgres.

Usage

1. Export `DATABASE_URL` in your shell (do NOT edit the repo `.env` file):

PowerShell (temporary for the session):

```powershell
$env:DATABASE_URL = 'postgresql://legal_admin:YOUR_PASSWORD@localhost:5434/legal_ai_db'
node scripts/atlas/load-profiles-to-postgres.mjs .tmp/atlas-component-profiles.jsonl
```

Unix / WSL / Git Bash:

```bash
export DATABASE_URL='postgresql://legal_admin:YOUR_PASSWORD@localhost:5434/legal_ai_db'
node scripts/atlas/load-profiles-to-postgres.mjs .tmp/atlas-component-profiles.jsonl
```

Notes
- The script will create table `atlas_component_profiles` if it does not exist.
- It upserts on `source_ref` (source id) so it is safe to re-run.
- Ensure Postgres is reachable and the role/database exist before running.
