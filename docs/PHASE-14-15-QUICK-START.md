# Phase 14/15: Offline Summarization Pipeline — Quick Start

## Overview

Complete two-lane architecture for offline Gemma4 semantic enrichment:

- **Lane 1** (Fast): Read feature cards → prepare metadata → DuckDB
- **Lane 2** (Slow): Batch Gemma4 summaries → embed → enrich Postgres & Qdrant

## Prerequisites

```powershell
# Verify services are running
curl http://127.0.0.1:11434/api/tags       # Ollama
curl http://127.0.0.1:6333                 # Qdrant
docker ps | findstr "postgres"             # PostgreSQL
```

## Quick Start

### Option 1: PowerShell Launcher (Recommended)

```powershell
cd C:\Users\james\Videos\deeds-web-app

# Verify mode (dry-run, safe)
.\scripts\launch-phase-14-15-pipeline.ps1 -Mode verify -Limit 10 -Verbose

# Apply mode (persistent writes)
.\scripts\launch-phase-14-15-pipeline.ps1 -Mode apply -Limit 100
```

### Option 2: Individual npm Tasks

From `sveltekit-frontend/`:

```bash
# Task 2: Gemma4 batch summaries (dry-run)
npm run atlas:summaries:gemma4:batch -- --dry-run --limit=50

# Task 2: Gemma4 batch summaries (apply)
npm run atlas:summaries:gemma4:batch:apply -- --limit=50

# Task 3: DuckDB import
npm run atlas:summaries:import:apply

# Task 4: Embedding prep
npm run atlas:summaries:embed:apply -- --limit=100

# Task 5: Pruning report
npm run atlas:summaries:prune-report
```

## Data Flow

```
atlas_packets (Postgres) + Qdrant orphans
         ↓
    loadFeatureCards()
         ↓
    Gemma4 batch (5 layers: chunk/file/folder/feature/system)
         ↓
    enrichCard() → summary_* columns populated
         ↓
    backfillPostgres() → Update atlas_packets
         ↓
    upsertQdrant() → Update codebase_chunks_768 payloads
         ↓
    exportJSON() → docs/reports/feature-summaries/gemma4-enriched-*.json
         ↓
    DuckDB tables: packet_summaries, feature_edges, orphan_packets
```

## Output Files

After successful run:

```
docs/reports/
  ├─ feature-summaries/
  │  └─ gemma4-enriched-2026-06-14.json      # Enriched cards + stats
  │
  └─ pruning-report-2026-06-14.json          # Orphan/stale/duplicate analysis
```

## Key Hard Rules

1. **60s timeout per card** — Gemma4 timeout → skip card, continue (fail-open)
2. **Sequential execution only** — No parallel Ollama calls (single GPU)
3. **Dual-ledger preservation** — Never delete orphaned Qdrant data
4. **Provenance tracking** — All writes include `enriched_by`, `provenance` fields
5. **No higher-hop enrichment** — Until Qdrant/Postgres 0/50 mismatch resolved

## Troubleshooting

### Ollama timeout
```bash
# Check Ollama health
curl http://127.0.0.1:11434/api/tags

# Restart Ollama
docker restart <container_id>

# Verify model loaded
ollama list | grep gemma4
```

### Postgres connection error
```bash
# Check DATABASE_URL env var
$env:DATABASE_URL

# Verify connection
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT 1"
```

### Qdrant unreachable
```bash
# Check Qdrant health
curl http://127.0.0.1:6333/health

# Verify collection exists
curl http://127.0.0.1:6333/collections/codebase_chunks_768
```

## Monitoring

```bash
# Watch summary generation progress
npm run atlas:summaries:gemma4:batch:apply -- --limit=50 --verbose

# Check enrichment stats
Select-String "summary_success_count" docs/reports/feature-summaries/gemma4-enriched-*.json

# Verify DuckDB import
npm run atlas:summaries:import:apply

# Check orphan detection
cat docs/reports/pruning-report-*.json | jq '.findings'
```

## Next Steps (Post-Pipeline)

1. **Review pruning report** — identify orphan consolidation strategy
2. **Verify Qdrant consistency** — `npm run atlas:qdrant:payload:debug`
3. **Backfill embeddings** — if embedding-prep timed out
4. **Monitor for divergence** — ensure Postgres/Qdrant stay aligned
5. **Gate higher-hop enrichment** — until Phase C validation PASS

## Safeguards

✅ **DRY-RUN MODE**: Preview all changes without persistence  
✅ **VERBOSE LOGGING**: Track per-card success/timeout counts  
✅ **DUAL-LEDGER**: Both Postgres and Qdrant updated with provenance  
✅ **FAIL-OPEN**: Timeouts skip cards, continue pipeline  
✅ **ROLLBACK-SAFE**: All writes use ON CONFLICT DO UPDATE (idempotent)

## Performance Expectations

| Mode | Limit | Duration | Memory | Notes |
|------|-------|----------|--------|-------|
| Dry-run | 50 | ~30s | 400MB | No DB writes |
| Verify | 50 | ~2min | 500MB | Reads + embeddings |
| Apply | 50 | ~3min | 600MB | Full persistence |
| Apply | 200 | ~12min | 1.2GB | Batch enrichment |

*Times vary with Ollama concurrency and network latency*

## References

- **Gemma4 Rules**: `CLAUDE.md` § "Gemma4 LLM Call Rules"
- **Parent Atlas**: `CLAUDE.md` § "Parent Atlas Lineage & Synthesis"
- **Canonical Lineage**: `memory/canonical-lineage-contract.md`
- **Architecture**: `docs/architecture/atlas-operating-system.md`
- **Implementation**: `scripts/atlas/gemma4-batch-summaries.mjs`

---

**Status**: All 7 tasks complete and ready to use  
**Last Updated**: 2026-06-14  
**Maintainer**: Claude Code
