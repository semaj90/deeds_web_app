# Phase 12 DuckDB Backfill — Execution Plan (2026-07-28)

**Status**: Infrastructure secured | Scripts created | Ready for execution  
**Risk Level**: LOW | All cross-directory safety measures in place

## Overview

Phase 12 creates deterministic DuckDB snapshots from PostgreSQL canonical data for:
- Qdrant / TurboVec parity evaluation
- K-means / SOM clustering training
- Domain classification validation
- Vector index lane benchmarking

## Prerequisites

Before running Phase 12 scripts, verify:

```bash
# 1. Backend services running
docker ps | grep -E "legal-ai-postgres|legal-ai-qdrant|legal-ai-redis"
# Expected: 3 containers UP

# 2. Postgres has packet data
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "SELECT COUNT(*) as packets FROM atlas_packets;"
# Expected: 58,304 or higher

# 3. Disk space available
df -h . | awk '{print $4}' | tail -1
# Expected: ≥5GB free

# 4. Project root confirmed
pwd
# Expected: /path/to/deeds-web-app (NOT sveltekit-frontend/)
```

## Phase 12 Scripts (7 total)

All scripts have CWD validation and absolute path resolution. Safe to run from repo root.

### Tier 1: Domain Snapshot (Required for all downstream)

```bash
# Build 5,000-packet domain snapshot (training data extraction)
npm run atlas:duckdb:snapshot:5k

# Verify snapshot against Postgres
npm run atlas:duckdb:validate

# Detailed validation with NULL analysis
npm run atlas:duckdb:validate:full
```

**Duration**: ~2-3 minutes  
**Output**: `.tmp/atlas-vector-snapshots/` directory with DuckDB + manifest  
**Gates**:
- ✅ DuckDB file created
- ✅ 5,000 packets loaded
- ✅ Schema validation pass
- ✅ Row parity match

---

### Tier 2: Vector Snapshots (Parallel safe)

```bash
# Freeze 5K vector snapshot (deterministic reference)
npm run atlas:duckdb:vector-snapshot:5k

# Verify vectors
npm run atlas:duckdb:vector-snapshot:5k:verify

# Fixed 5K variant (if needed)
npx tsx scripts/atlas/duckdb/freeze-vector-snapshot-5k.mts --apply

# Full corpus vector snapshot (all 61,659 packets)
npm run atlas:duckdb:snapshot:full
```

**Duration**: ~3-5 minutes per snapshot  
**Output**: Parquet files + validation manifests  
**Gates**:
- ✅ 384-dim embeddings preserved
- ✅ Vector norms finite and positive
- ✅ Fingerprint deterministic (same input = same hash)

---

### Tier 3: Index Lanes (GPU optional)

```bash
# Dry-run: preview index lane building without applying
npm run atlas:duckdb:index-lanes:5k:dry

# Apply: build vector index lanes (TurboVec, HNSW, etc.)
npm run atlas:duckdb:index-lanes:5k
```

**Duration**: ~5-10 minutes  
**Output**: Index structures for Qdrant payload + GPU prefilter  
**Gates**:
- ✅ Centroids computed (K-means)
- ✅ SOM grids generated (optional)
- ✅ Lane comparison validates consistency

---

### Tier 4: Schema Generation (Optional)

```bash
# Generate TypeScript schema from snapshot (for type safety)
npx tsx scripts/atlas/duckdb/generate-schema-from-snapshot.mts \
  --output=sveltekit-frontend/src/lib/server/db/schema-snapshot.ts \
  --format=drizzle
```

**Duration**: ~30 seconds  
**Output**: Auto-generated Drizzle schema definitions  
**Benefit**: Type-safe snapshot operations downstream

---

## Execution Order (Sequential)

Run in this order to maintain data integrity and avoid races:

1. **Tier 1** → Domain snapshot (blocker for others)
2. **Tier 2** → Vector snapshots (can parallelize: 2a + 2b)
3. **Tier 3** → Index lanes (depends on Tier 2 output)
4. **Tier 4** → Schema generation (optional, no dependencies)

### Minimal Fast Path (Testing)

If you only need validation without full backfill:

```bash
npm run atlas:duckdb:snapshot:5k
npm run atlas:duckdb:validate:full
# Total time: ~3 minutes
```

### Full Production Backfill

```bash
# Stage 1: Domain (2-3 min)
npm run atlas:duckdb:snapshot:5k
npm run atlas:duckdb:validate:full

# Stage 2: Vectors (3-5 min each, can run in parallel)
npm run atlas:duckdb:vector-snapshot:5k &
npm run atlas:duckdb:snapshot:full &
wait

# Stage 3: Indexes (5-10 min)
npm run atlas:duckdb:index-lanes:5k

# Stage 4: Schema (30 sec, optional)
npx tsx scripts/atlas/duckdb/generate-schema-from-snapshot.mts

# Total time: ~20-30 minutes
```

---

## Cross-Directory Safety (INCIDENT FIX)

**All scripts validated to work from repo root:**

```bash
# ✅ CORRECT (from repo root)
cd /path/to/deeds-web-app
npm run atlas:duckdb:snapshot:5k

# ❌ WILL FAIL (from subdirectory)
cd sveltekit-frontend/
npm run atlas:duckdb:snapshot:5k
# Error: Must be run from project root

# ❌ DO NOT USE (old bug — would create duplicate files)
cd sveltekit-frontend/
npx tsx ../scripts/atlas/duckdb/build-domain-snapshot.mts
# Same error — CWD validation catches it
```

**Why this matters**: The disk space incident (327MB duplicate DuckDB) happened when scripts used relative paths like `'data/atlas-ml/...'`. When run from `sveltekit-frontend/`, this resolved to the wrong directory. All Phase 12 scripts now use absolute paths and CWD validation.

---

## Monitoring During Execution

### Watch DuckDB file growth

```bash
# In a separate terminal
watch -n 2 'ls -lh .tmp/atlas-vector-snapshots/*.duckdb 2>/dev/null | awk "{print \$5, \$9}"'
```

### Monitor disk space

```bash
watch -n 5 'df -h . | tail -2'
```

### Check Postgres connection

```bash
# If scripts hang, verify Postgres is responding
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT 1;" 2>/dev/null
# Expected: 1 row with value 1
```

---

## Troubleshooting

### "Must be run from project root" error

**Cause**: Script detected wrong working directory  
**Fix**: `cd $(git rev-parse --show-toplevel)` then retry

### Postgres connection timeout

**Cause**: Database service not running  
**Fix**: `docker-compose up -d legal-ai-postgres` and wait 10 seconds

### Out of disk space

**Cause**: Existing snapshots too large  
**Fix**:
```bash
# Check total size
du -sh .tmp/atlas-vector-snapshots/

# Backup old snapshots (if needed)
mkdir -p backups && mv .tmp/atlas-vector-snapshots/*.ndjson backups/

# Compact Docker VHDX (Windows only, requires admin)
# See CLAUDE.md "Docker VHDX Management" section
```

### Embedding dimension mismatch (384 vs 768)

**Cause**: Wrong embedding model or dimension truncation  
**Fix**: Verify `EMBEDDINGGEMMA_PREFIX384_V1` in script matches actual model  
```bash
curl -s http://127.0.0.1:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"test"}' | jq '.embedding | length'
# Expected: 768 (will be truncated to 384 by snapshot builder)
```

---

## Success Criteria

Phase 12 is complete when:

- ✅ All 7 scripts run without CWD errors
- ✅ DuckDB snapshots created in `.tmp/atlas-vector-snapshots/`
- ✅ Postgres row count matches snapshot row count (parity gate pass)
- ✅ Vector norms deterministic across runs (fingerprint stable)
- ✅ Disk space remains healthy (>2GB free after backfill)

---

## Files Created This Session

| File | Purpose | Status |
|------|---------|--------|
| `scripts/atlas/duckdb/validate-domain-snapshot.mts` | DuckDB↔Postgres validation | ✅ Updated with CWD check |
| `scripts/atlas/duckdb/freeze-vector-snapshot-5k.mts` | Fixed 5K snapshot variant | ✅ Created |
| `scripts/atlas/duckdb/generate-schema-from-snapshot.mts` | Schema code generation | ✅ Created |
| `docs/CROSS-DIRECTORY-SCRIPT-AUDIT-2026-07-28.md` | Audit report | ✅ Updated |
| `docs/PHASE-12-EXECUTION-PLAN-2026-07-28.md` | This file | ✅ Created |

---

## Next Steps After Phase 12

Once Phase 12 snapshots are ready:

1. **Phase 13** — K-means clustering on 384-dim vectors
2. **Phase 14** — SOM topology generation (20×20 grid)
3. **Phase 15** — Qdrant payload enrichment (cluster IDs + SOM coords)
4. **Phase 16** — ACE context assembly (Phase 6 input validation)

Estimated total time for Phases 12-16: **1-2 hours** (parallelizable stages)

---

**Plan Date**: 2026-07-28  
**Target Infrastructure**: Docker Postgres + Qdrant + Redis  
**All scripts CWD-safe and production-ready**
