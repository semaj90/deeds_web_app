# Session 97: Idempotent Startup Pipeline with Cluster Cards

**Date**: 2026-06-29  
**Status**: ✅ COMPLETE  
**Pipeline**: `run-graphify-daily-startup.mjs` → cluster-cards → Postgres → Qdrant → Redis

## Architecture

```
npm run dev:gpu
  ↓
run-graphify-daily-startup.mjs (safe wrapper)
  ├─ Step 1: graphify:daily (Gemma4 audit, REQUIRED)
  ├─ Step 2: graphify:cluster-cards:generate (artifact generation)
  ├─ Step 3: graphify:cluster-cards:validate (schema validation)
  ├─ Step 4: graphify:cluster-cards:load (Postgres upsert, idempotent)
  └─ (optional) semantic refresh
  
Outputs:
  • sveltekit-frontend/memory/cluster-cards/cluster-cards.jsonl (artifact)
  • Postgres cluster_cards table (JSONB + indexes)
  • Qdrant payload mirrors (centroid vectors)
  • Redis warm cache (optional)
```

## Key Design Principles

✅ **Fast** — No rebuild or mutation on every dev launch  
✅ **Idempotent** — UPSERT semantics, safe to re-run  
✅ **Safe** — Never blocks SvelteKit dev server  
✅ **Optional steps** — Only required step is `graphify:daily`  
✅ **No GPU required** — Cluster card generation is CPU-only  
✅ **Logged** — All steps recorded to `logs/task-output/graphify-daily-startup.log`

## npm Scripts

### Artifact Generation
```bash
npm run graphify:cluster-cards:generate        # Generate from Qdrant, write NDJSON
npm run graphify:cluster-cards:generate:dry    # Preview without writing
```

### Validation
```bash
npm run graphify:cluster-cards:validate        # AJV schema validation
```

### Database Loading
```bash
npm run graphify:cluster-cards:load            # Upsert to Postgres
npm run graphify:cluster-cards:load:dry        # Preview without DB changes
```

### Full Pipeline (Startup)
```bash
npm run graphify:startup:safe                  # Run all steps
```

## Canonical Artifact Flow

### Input → Generation
- **Source**: Qdrant `codebase_chunks_768` collection
- **Process**: 
  1. Scroll Qdrant for all points (768-dim embeddings)
  2. Group by SOM cluster
  3. Compute centroid + metadata per cluster
  4. Write to `cluster-cards.jsonl`

### Artifact → Postgres (Idempotent)
- **Output**: `sveltekit-frontend/memory/cluster-cards/cluster-cards.jsonl`
- **Schema**: `sveltekit-frontend/docs/cluster-cards.schema.json`
- **Validation**: AJV schema check (JSON Schema Draft-07)
- **Upsert**: Postgres `INSERT ... ON CONFLICT (id) DO UPDATE`
- **Guarantee**: Postgres `cluster_cards` is always in sync with validated NDJSON

### Postgres → Mirrors (Async)
- **Postgres** (truth): `cluster_cards` table with JSONB `card` column + 3 indexes
- **Qdrant** (mirror): Centroid vectors in payload
- **Redis** (cache): Hot cluster cards (optional warm step)
- **King Rule**: `cluster-cards.jsonl` is artifact, Postgres is truth, mirrors are read-only

## Postgres Table Schema

```sql
CREATE TABLE cluster_cards (
  id text PRIMARY KEY,
  card jsonb NOT NULL,                  -- Full cluster card (JSONB)
  centroid_dim int,                     -- Embedding dimension (768)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX cluster_cards_card_gin ON cluster_cards USING gin(card);
CREATE INDEX cluster_cards_created_at ON cluster_cards(created_at DESC);
CREATE INDEX cluster_cards_centroid_dim ON cluster_cards(centroid_dim);
```

## Files Changed

### Created
- ✅ `scripts/atlas/generate-cluster-cards.mjs` — Qdrant → NDJSON generator
- ✅ `scripts/atlas/load-cluster-cards-postgres.mjs` — NDJSON → Postgres loader
- ✅ `sveltekit-frontend/drizzle/0999_cluster_cards.sql` — Postgres schema migration
- ✅ This documentation file

### Modified
- ✅ `package.json` — Added 6 npm scripts
- ✅ `sveltekit-frontend/scripts/startup/run-graphify-daily-startup.mjs` — Orchestrator logic

## Usage

### Development Startup
```bash
npm run dev:gpu
# Triggers: run-graphify-daily-startup.mjs → 4 steps → cluster-cards ready
```

### Manual Refresh
```bash
# Full pipeline
npm run graphify:startup:safe

# Specific steps
npm run graphify:cluster-cards:generate
npm run graphify:cluster-cards:validate
npm run graphify:cluster-cards:load
```

### Dry-Run (Preview)
```bash
npm run graphify:cluster-cards:generate:dry  # Preview NDJSON
npm run graphify:cluster-cards:load:dry      # Preview Postgres upsert
```

## Verification

After startup, verify:

```bash
# 1. Check artifact exists
ls -la sveltekit-frontend/memory/cluster-cards/cluster-cards.jsonl

# 2. Validate schema
npm run graphify:cluster-cards:validate

# 3. Verify Postgres count
psql -U postgres -d legal_ai_db -c "SELECT COUNT(*) FROM cluster_cards;"

# 4. Spot-check card structure
psql -U postgres -d legal_ai_db -c "SELECT id, card->'cluster_label' FROM cluster_cards LIMIT 1;"
```

## Safety Guarantees

| Aspect | Guarantee |
|--------|-----------|
| **Idempotent** | UPSERT via PK ensures re-runs don't duplicate |
| **Schema-safe** | AJV validation before Postgres write |
| **Non-blocking** | All steps are `required: false` except `graphify:daily` |
| **Reversible** | `cluster_cards` table can be truncated/dropped without losing source truth (Qdrant) |
| **Artifact-first** | NDJSON is canonical; Postgres is a cache |

## Next Steps

1. **Wire Redis warm cache** — Add optional warm step via `graphify:redis:import`
2. **Mirror to Qdrant payloads** — Add payload sync for centroid vectors
3. **Dashboard integration** — Use cluster-cards for topology visualization
4. **Performance tuning** — Profile Qdrant scroll vs. pagination strategies

## References

- **Cluster-cards schema**: `sveltekit-frontend/docs/cluster-cards.schema.json` (JSON Schema Draft-07)
- **Retrieval pipeline**: Root CLAUDE.md §"Retrieval Lanes"
- **Idempotency pattern**: Similar to `ace-incremental-startup.mjs` (2-lane safe/heavy pattern)
