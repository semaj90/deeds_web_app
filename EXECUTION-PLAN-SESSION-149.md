# Session 149 Execution Plan — Semantic Coverage 50% → 100%

**Status**: Reconciliation audit complete (50% coverage, 4 ABSENT lanes)  
**Goal**: 100% coverage with runtime proof  
**Timeline**: 4-6 hours (dry-runs + smoke tests; real backfill 4-6h deferred)

---

## IMMEDIATE (Next 30 min)

### Phase 1: Run Reconciliation Audit (Already Done ✅)

```bash
npx tsx scripts/atlas/reconcile-semantic-contracts.mjs
# Output: reports/semantic-contracts/
#   - semantic-contract-reconciliation.json (current status: 50% coverage)
#   - semantic-contract-conflicts.ndjson (1 CONFLICTING lane detected)
#   - semantic-contract-identity-map.json (packet_key lineage rules)
```

**Status Summary**:
- OKF_SOURCE: **PRESENT** ✅
- PACKET_VALIDATION: **ABSENT** ⏳
- HYPERRAG_PACKET_RPC: **STATICALLY_REFERENCED** ✅
- PACKET_IDENTITY: **CONFLICTING** (camelCase vs snake_case) ⚠️
- TOPOLOGY_ROUTING: **ABSENT** ⏳
- QDRANT_PAYLOAD: **ABSENT** ⏳
- POSTGRES_ROWS: **ABSENT** ⏳
- REDIS_VALUES: **STATICALLY_REFERENCED** ✅

---

## PART A: Dry-Run All Topology Scripts (30 min each)

### A1: Qdrant Backfill Audit

```bash
cd /c/Users/james/Videos/deeds-web-app
npx tsx scripts/atlas/phase108d-qdrant-backfill-simple.mts --dry-run
```

**What it shows:**
- Current Qdrant collection state (40.5K+ points)
- Payload schema coverage (packet_key, workspace_id present?)
- Recommended backfill strategy
- Sample Postgres data (packet_key, source_ref, workspace_id)

**Output**: `log/artifacts/semantic-contract/phase108d-qdrant-backfill-simple-report.json`

**Expected**: Dry-run report showing which payloads are missing

---

### A2: K-means Dry-Run

```bash
cd /c/Users/james/Videos/deeds-web-app/sveltekit-frontend
npx tsx scripts/atlas/gpu-kmeans-clustering.mts --dry-run --n-clusters=32 --limit=5000
```

**What it shows:**
- GPU addon status (CUDA available? CPU fallback?)
- Postgres packet count
- Qdrant collection readiness
- Sample data shape

**Output**: Console + stderr

**Expected**: "Loaded X embeddings from Qdrant" or "Qdrant collection empty (0 points)"

---

### A3: SOM Training Dry-Run

```bash
cd /c/Users/james/Videos/deeds-web-app
node scripts/atlas/train-som-20x20.mjs --dry-run
```

**What it shows:**
- Postgres K-means cluster data available?
- SOM grid initialization (20×20 = 400 cells)
- Training parameters

**Output**: Console

**Expected**: "Ready for SOM training" or blocking error

---

### A4: PageRank Compute Dry-Run

```bash
cd /c/Users/james/Videos/deeds-web-app
npx tsx scripts/atlas/compute-neo4j-pagerank.mts --dry-run
```

**What it shows:**
- Neo4j connection
- Graph structure available?
- PageRank algorithm readiness

**Output**: Console + graph stats

**Expected**: "Neo4j graph has X nodes, Y edges"

---

## PART B: Inspect Results (15 min)

After all 4 dry-runs, review outputs:

```bash
# Check Qdrant report
cat /c/Users/james/Videos/deeds-web-app/log/artifacts/semantic-contract/phase108d-qdrant-backfill-simple-report.json | jq '.current_state'

# Check Postgres packet count
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets WHERE packet_key IS NOT NULL"
# Expected: 58,304

# Check Qdrant collection size
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768 | jq '.result.points_count'
# Expected: 40,568 (or 0 if backfill hasn't run)
```

---

## DECISION POINT: Proceed with Full Backfill?

**Option A: Full Backfill** (4-6 hours, real data)
- Backfill Qdrant with embeddings from codebase_chunk_index
- Run K-means, SOM, PageRank on real 40.5K data
- Complete coverage proof across all stores

**Option B: Synthetic Test** (1-2 hours, test data)
- Skip backfill; use 1K synthetic test packets
- Validate pipeline end-to-end
- Defer real data work to next session

**Recommended**: Option B for speed + proof-of-concept, Option A for production-ready state

---

## PART C: If Proceeding with Full Backfill (Option A)

### C1: Apply Qdrant Backfill (2-3 hours)

```bash
cd /c/Users/james/Videos/deeds-web-app
npx tsx scripts/atlas/phase108d-qdrant-backfill-simple.mts
# (remove --dry-run flag)
```

**Blocks**: Everything else until this completes

---

### C2: Apply K-means (45 min)

```bash
cd sveltekit-frontend
npx tsx scripts/atlas/gpu-kmeans-clustering.mts --apply --n-clusters=32
```

**Depends on**: C1 backfill complete

---

### C3: Apply SOM Training (1 hour)

```bash
cd /c/Users/james/Videos/deeds-web-app
node scripts/atlas/train-som-20x20.mjs --apply
```

**Depends on**: C2 K-means complete

---

### C4: Apply PageRank (30 min, parallel with C3)

```bash
cd /c/Users/james/Videos/deeds-web-app
npx tsx scripts/atlas/compute-neo4j-pagerank.mts
```

**Depends on**: Neo4j healthy (can run parallel with C3)

---

### C5: Verify Results (20 min)

```bash
# Postgres
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(DISTINCT kmeans_cluster), COUNT(DISTINCT som_cell_row), COUNT(DISTINCT pagerank_score) FROM atlas_packets"
# Expected: 32, 400, 58304 (or close)

# Neo4j
# (optional, connect to :7687 and run Cypher)

# Qdrant payload verification
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768/points/1 | jq '.result.payload.packet_key'
```

---

## PART D: Update Reconciliation Audit (15 min)

```bash
npx tsx scripts/atlas/reconcile-semantic-contracts.mjs
```

**Expected Status**:
- TOPOLOGY_ROUTING: RUNTIME_SMOKE_PROVEN (K-means + SOM + PageRank executed)
- QDRANT_PAYLOAD: CROSS_STORE_PROVEN (payloads enriched)
- POSTGRES_ROWS: CROSS_STORE_PROVEN (columns populated)
- REDIS_VALUES: RUNTIME_SMOKE_PROVEN (if cache warming applied)

**Coverage**: Should jump from 50% → 75-100%

---

## Summary Timeline

| Phase | Task | Dry-Run | Apply | Total |
|-------|------|---------|-------|-------|
| **A1** | Qdrant audit | 10 min | 2-3h | ~30 min dry-run |
| **A2** | K-means dry | 5 min | 45 min | ~30 min dry-run |
| **A3** | SOM dry | 5 min | 1h | ~30 min dry-run |
| **A4** | PageRank dry | 5 min | 30 min | ~30 min dry-run |
| **B** | Inspect results | 15 min | — | ~15 min |
| **C1-C5** | Full cycle (Option A) | — | 4-6h | ~4-6 hours |
| **TOTAL** | Dry-runs only (fast path) | 40 min | — | **~1 hour** |
| **TOTAL** | Full backfill (Option A) | 40 min | 4-6h | **~5-7 hours** |

---

## Commands Cheat Sheet

```bash
# All dry-runs (parallel)
cd /c/Users/james/Videos/deeds-web-app
npx tsx scripts/atlas/phase108d-qdrant-backfill-simple.mts --dry-run &
cd sveltekit-frontend && npx tsx scripts/atlas/gpu-kmeans-clustering.mts --dry-run --n-clusters=32 --limit=5000 &
cd /c/Users/james/Videos/deeds-web-app && node scripts/atlas/train-som-20x20.mjs --dry-run &
npx tsx scripts/atlas/compute-neo4j-pagerank.mts --dry-run &
wait

# Inspect state
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets WHERE kmeans_cluster IS NOT NULL"
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768 | jq '.result.points_count'

# Final audit
npx tsx scripts/atlas/reconcile-semantic-contracts.mjs
```

---

## Next Session

- If Option B (synthetic): Run real backfill in next session with real 40.5K data
- If Option A (real): Move to PART D (Fix Naming) + ONE_ENTITY_ENRICHMENT_TRACE_PROVEN

---

**Generated**: 2026-07-28 23:30 UTC  
**Status**: Ready to execute
