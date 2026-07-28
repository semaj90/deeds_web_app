# Phase 12 Quick Start — One-Shot Execution

**Use this to run Phase 12 from scratch when services are available.**

## Pre-flight (1 minute)

```bash
# 1. Navigate to repo root
cd /path/to/deeds-web-app

# 2. Confirm correct location
pwd
# Output should end with: deeds-web-app

# 3. Check services online
docker ps | grep -E "postgres|qdrant|redis"
# Expected: 3 containers (at minimum postgres)
```

## Quick Path (3 minutes — validation only)

```bash
# Build 5K domain snapshot
npm run atlas:duckdb:snapshot:5k

# Validate against Postgres
npm run atlas:duckdb:validate:full
```

**Output**: Manifest files in `.tmp/atlas-vector-snapshots/`  
**Success**: "✅ All validations passed!"

---

## Full Production Path (20-30 minutes)

```bash
# Stage 1: Domain snapshot (2-3 min)
npm run atlas:duckdb:snapshot:5k
npm run atlas:duckdb:validate:full

# Stage 2a: Vector snapshots (parallel, 3-5 min each)
npm run atlas:duckdb:vector-snapshot:5k &
npm run atlas:duckdb:snapshot:full &
wait

# Stage 2b: Verify vectors
npm run atlas:duckdb:vector-snapshot:5k:verify

# Stage 3: Index lanes (5-10 min)
npm run atlas:duckdb:index-lanes:5k

# Stage 4: Schema generation (optional, 30 sec)
npx tsx scripts/atlas/duckdb/generate-schema-from-snapshot.mts
```

---

## If Something Breaks

```bash
# Check if it's a CWD error (run from repo root only)
pwd
# Should NOT contain "sveltekit-frontend"

# Check Postgres is responding
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets;" 2>/dev/null

# Check disk space
df -h . | tail -1

# See full execution plan
cat docs/PHASE-12-EXECUTION-PLAN-2026-07-28.md
```

---

## Expected Files After Success

```
.tmp/atlas-vector-snapshots/
├── atlas-vector-snapshot.duckdb
├── vector-snapshot-5k-manifest.json
├── vector-snapshot-5k.parquet
├── atlas-vector-index-lanes.duckdb
└── [other snapshot files]
```

**Total size**: ~50-75MB (varies by snapshot size)

---

**All scripts safe from cross-directory execution errors.**  
**CWD validation prevents disk space incident recurrence.**
