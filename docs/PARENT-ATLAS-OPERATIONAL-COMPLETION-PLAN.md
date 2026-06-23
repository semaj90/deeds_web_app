# Parent Atlas Operational/Proof Work — 2.5-Day Completion Plan

**Status**: Architecture frozen (100% complete). Remaining work is operational proof and schema wiring.

**Total Effort**: ~2.5 days (~20 hours)  
**Execution Order**: Strict dependency order (cannot parallelize)

---

## Phase 1: Live Tree/Summary/Topology Schema Reconciliation (4-6 hours) 🔴 BLOCKING

**Why this first**: All other phases depend on canonical schema definitions.

### 1.1 Audit Current Schema State

Check what tables exist:
```bash
psql -U legal_admin -d legal_ai_db -c "
  SELECT table_name FROM information_schema.tables 
  WHERE table_schema='public' AND table_name LIKE 'atlas_%'
  ORDER BY table_name;
"
```

### 1.2 Create Bridge Migration

Required bridges:
- `atlas_tree_nodes.parent_id` → `parent_node_id` (UUID FK to self)
- `atlas_summary_layers.summary_level` → `summary_type` (ENUM)
- `atlas_summary_layers.relation_type` 
- `atlas_topology_index`: Add pagerank, betweenness, eigenvector fields

**File**: `drizzle/manual/0047_atlas_schema_bridges.sql`

```sql
ALTER TABLE atlas_tree_nodes
  ADD COLUMN IF NOT EXISTS parent_node_id uuid 
    REFERENCES atlas_tree_nodes(id) ON DELETE SET NULL;

ALTER TABLE atlas_summary_layers
  ADD COLUMN IF NOT EXISTS summary_type text NOT NULL DEFAULT 'feature' 
    CHECK (summary_type IN ('document', 'cluster', 'feature', 'domain', 'global'));

ALTER TABLE atlas_summary_layers
  ADD COLUMN IF NOT EXISTS relation_type text DEFAULT 'relates_to'
    CHECK (relation_type IN ('contains', 'summarizes', 'relates_to'));

ALTER TABLE atlas_topology_index
  ADD COLUMN IF NOT EXISTS pagerank real DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS betweenness real DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS eigenvector real DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS topology_version int DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_atlas_tree_parent_node ON atlas_tree_nodes(parent_node_id);
CREATE INDEX IF NOT EXISTS idx_atlas_summary_type ON atlas_summary_layers(summary_type);
CREATE INDEX IF NOT EXISTS idx_atlas_topology_pagerank ON atlas_topology_index(pagerank DESC NULLS LAST);
```

### 1.3 Apply & Verify

```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < drizzle/manual/0047_atlas_schema_bridges.sql
psql -U legal_admin -d legal_ai_db -c "\d atlas_tree_nodes"
```

**Exit Criterion**: All 5 bridge columns exist + 4 indexes created

---

## Phase 2: Replay Breadth Expansion (4-6 hours)

**Input**: Current 50-query replay at `docs/reports/replay-trace-summary.json`  
**Output**: 100-query replay with cold/warm/repeat coverage  
**Dependency**: Phase 1

### 2.1 Generate Additional Queries

```bash
node scripts/atlas/generate-replay-queries.mjs \
  --seed=42 --count=50 --output=.tmp/replay-queries-batch-2.jsonl
```

### 2.2 Run Expanded Replay

```bash
npx tsx scripts/atlas/run-replay-harness.mjs \
  --queries=docs/reports/replay-trace-summary.json,.tmp/replay-queries-batch-2.jsonl \
  --output=docs/reports/replay-100-query-proof.json \
  --record-cold-warm-repeat
```

### 2.3 Validate Results

Verify:
- 100/100 queries completed
- cold queries: baseline latency
- warm queries: latency < cold × 0.3 (cache speedup)
- repeat queries: identical results (deterministic)
- No packet_key mutations
- Redis cache hit rate > 80% on warm queries

**Exit Criterion**: 100-query proof with cold/warm/repeat coverage PASS

---

## Phase 3: Provenance Breadth Expansion (4-6 hours)

**Input**: 100-query replay from Phase 2  
**Output**: Provenance rows with story_id, task_id, worker_id, trace_id, packet_key, feature_id, cache_namespace, cache_hit_source  
**Dependency**: Phase 2

### 3.1 Create Provenance Schema

**File**: `drizzle/manual/0048_atlas_provenance_tree.sql`

```sql
CREATE TABLE IF NOT EXISTS atlas_provenance_tree (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id text NOT NULL,
  task_id text NOT NULL,
  worker_id text NOT NULL,
  trace_id text NOT NULL,
  packet_key text NOT NULL,
  feature_id text,
  cache_namespace text,
  cache_hit_source text CHECK (cache_hit_source IN 
    ('l1_redis', 'l2_bifrost', 'qdrant', 'neo4j', 'cold')),
  query_text text,
  query_hash text,
  retrieval_latency_ms real,
  total_latency_ms real,
  result_count int,
  recorded_at timestamp DEFAULT now(),
  UNIQUE(trace_id, packet_key)
);

CREATE INDEX idx_atlas_provenance_story ON atlas_provenance_tree(story_id);
CREATE INDEX idx_atlas_provenance_task ON atlas_provenance_tree(task_id);
CREATE INDEX idx_atlas_provenance_trace ON atlas_provenance_tree(trace_id);
```

### 3.2 Backfill from Replay

```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < drizzle/manual/0048_atlas_provenance_tree.sql

npx tsx scripts/atlas/materialize-provenance-from-replay.mjs \
  --replay=docs/reports/replay-100-query-proof.json \
  --output=.tmp/provenance-backfill.ndjson

npx tsx scripts/atlas/ingest-provenance-tree.mjs \
  --input=.tmp/provenance-backfill.ndjson \
  --apply
```

### 3.3 Validate Coverage

```bash
psql -U legal_admin -d legal_ai_db -c "
  SELECT 
    COUNT(*) as total_rows,
    COUNT(DISTINCT story_id) as unique_stories,
    COUNT(DISTINCT trace_id) as unique_traces,
    COUNT(cache_hit_source) as cache_sources
  FROM atlas_provenance_tree;
"
```

**Exit Criterion**: 100+ provenance rows with all 8 fields populated

---

## Phase 4: HyperRAG Telemetry Depth (4-6 hours)

**Input**: 100-query replay from Phase 2  
**Output**: Per-query timing for BM25, Qdrant, Redis, Neo4j, fusion, rerank, total  
**Dependency**: Phase 3

### 4.1 Create Telemetry Schema

**File**: `drizzle/manual/0049_atlas_retrieval_telemetry.sql`

```sql
CREATE TABLE IF NOT EXISTS atlas_retrieval_telemetry (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id text NOT NULL,
  query_hash text NOT NULL,
  
  bm25_latency_ms real,
  qdrant_latency_ms real,
  redis_latency_ms real,
  neo4j_latency_ms real,
  fusion_latency_ms real,
  rerank_latency_ms real,
  total_latency_ms real,
  
  bm25_hit_count int,
  qdrant_hit_count int,
  redis_hit_count int,
  final_result_count int,
  
  redis_cache_hit boolean,
  bifrost_cache_hit boolean,
  
  recorded_at timestamp DEFAULT now(),
  UNIQUE(trace_id, query_hash)
);

CREATE INDEX idx_atlas_telemetry_trace ON atlas_retrieval_telemetry(trace_id);
CREATE INDEX idx_atlas_telemetry_total_latency ON atlas_retrieval_telemetry(total_latency_ms);
```

### 4.2 Instrument Retrieval Pipeline

Edit `src/lib/server/retrieval/orchestrator.ts` to emit timing events for each stage.

### 4.3 Re-run Replay with Telemetry

```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < drizzle/manual/0049_atlas_retrieval_telemetry.sql

npx tsx scripts/atlas/run-replay-harness.mjs \
  --queries=docs/reports/replay-100-query-proof.json \
  --output=docs/reports/retrieval-telemetry-report.json \
  --record-stage-timings

npx tsx scripts/atlas/analyze-telemetry.mjs \
  --input=docs/reports/retrieval-telemetry-report.json \
  --output=docs/reports/hyperrag-telemetry-analysis.md
```

**Exit Criterion**: Telemetry for all 100 queries with all 6 stages + 3 cache stages

---

## Phase 5: Feature_id Coverage Expansion (2-3 hours)

**Input**: Current feature_id placement coverage gap  
**Output**: Coverage rises by backfilling missing feature_id values  
**Dependency**: Phase 1

### 5.1 Audit Current Coverage

```bash
psql -U legal_admin -d legal_ai_db -c "
  SELECT 
    COUNT(*) as total_packets,
    COUNT(feature_id) as with_feature_id,
    ROUND(100.0 * COUNT(feature_id) / COUNT(*), 1) as coverage_pct
  FROM parent_atlas_documents;
"
```

### 5.2 Backfill Missing feature_id

```bash
npx tsx scripts/atlas/infer-feature-id-from-path.mjs \
  --input=docs/reports/parent-atlas-production-readiness-report.json \
  --output=.tmp/feature-id-backfill.ndjson

npx tsx scripts/atlas/apply-feature-id-backfill.mjs \
  --input=.tmp/feature-id-backfill.ndjson \
  --dry-run

npx tsx scripts/atlas/apply-feature-id-backfill.mjs \
  --input=.tmp/feature-id-backfill.ndjson \
  --apply
```

### 5.3 Verify Coverage Increase

```bash
psql -U legal_admin -d legal_ai_db -c "
  SELECT 
    COUNT(*) as total_packets,
    COUNT(feature_id) as with_feature_id,
    ROUND(100.0 * COUNT(feature_id) / COUNT(*), 1) as coverage_pct
  FROM parent_atlas_documents;
"
```

Target: coverage_pct > 90%

**Exit Criterion**: feature_id coverage rises to >90%, backfill audit report created

---

## Execution Sequence (Copy-Paste Ready)

```bash
# PHASE 1: Schema Bridges
echo "=== PHASE 1: SCHEMA BRIDGES ===" 
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < drizzle/manual/0047_atlas_schema_bridges.sql

# PHASE 2: Replay Breadth  
echo "=== PHASE 2: REPLAY BREADTH ===" 
node scripts/atlas/generate-replay-queries.mjs --seed=42 --count=50 --output=.tmp/replay-queries-batch-2.jsonl
npx tsx scripts/atlas/run-replay-harness.mjs --queries=docs/reports/replay-trace-summary.json,.tmp/replay-queries-batch-2.jsonl --output=docs/reports/replay-100-query-proof.json --record-cold-warm-repeat

# PHASE 3: Provenance Breadth
echo "=== PHASE 3: PROVENANCE BREADTH ===" 
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < drizzle/manual/0048_atlas_provenance_tree.sql
npx tsx scripts/atlas/materialize-provenance-from-replay.mjs --replay=docs/reports/replay-100-query-proof.json --output=.tmp/provenance-backfill.ndjson
npx tsx scripts/atlas/ingest-provenance-tree.mjs --input=.tmp/provenance-backfill.ndjson --apply

# PHASE 4: Telemetry Depth
echo "=== PHASE 4: TELEMETRY DEPTH ===" 
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < drizzle/manual/0049_atlas_retrieval_telemetry.sql
npx tsx scripts/atlas/run-replay-harness.mjs --queries=docs/reports/replay-100-query-proof.json --output=docs/reports/retrieval-telemetry-report.json --record-stage-timings
npx tsx scripts/atlas/analyze-telemetry.mjs --input=docs/reports/retrieval-telemetry-report.json --output=docs/reports/hyperrag-telemetry-analysis.md

# PHASE 5: Feature_id Coverage
echo "=== PHASE 5: FEATURE_ID COVERAGE ===" 
npx tsx scripts/atlas/infer-feature-id-from-path.mjs --input=docs/reports/parent-atlas-production-readiness-report.json --output=.tmp/feature-id-backfill.ndjson
npx tsx scripts/atlas/apply-feature-id-backfill.mjs --input=.tmp/feature-id-backfill.ndjson --dry-run
npx tsx scripts/atlas/apply-feature-id-backfill.mjs --input=.tmp/feature-id-backfill.ndjson --apply

# Final Verification
echo "=== FINAL VERIFICATION ===" 
npm run atlas:validate
npm run audit:contracts
npm run atlas:production-readiness

echo "✅ PARENT ATLAS OPERATIONAL/PROOF COMPLETE"
```

---

## Success Criteria (All Must Pass)

| Phase | Criterion | Verification |
|-------|-----------|---------------|
| 1 | Schema bridges exist | `\d atlas_tree_nodes` shows parent_node_id |
| 2 | 100/100 replay queries pass | `jq '.passed' docs/reports/replay-100-query-proof.json` = 100 |
| 2 | Cold/warm/repeat coverage | `jq '.query_types' docs/reports/replay-100-query-proof.json` has all 3 |
| 3 | 100+ provenance rows | `SELECT COUNT(*) FROM atlas_provenance_tree;` >= 100 |
| 3 | All 8 fields populated | Cache_hit_source, trace_id, packet_key all NOT NULL |
| 4 | Telemetry for 100 queries | `jq '.query_count' docs/reports/retrieval-telemetry-report.json` = 100 |
| 4 | All 6 stages recorded | Telemetry report has bm25/qdrant/redis/neo4j/fusion/rerank |
| 5 | feature_id coverage > 90% | `SELECT COUNT(feature_id)::float / COUNT(*) FROM parent_atlas_documents;` > 0.90 |

---

## Timeline Summary

- Phase 1: 4-6 hours (Schema bridges)
- Phase 2: 4-6 hours (Replay breadth)
- Phase 3: 4-6 hours (Provenance breadth)
- Phase 4: 4-6 hours (Telemetry depth)
- Phase 5: 2-3 hours (Feature_id coverage)

**Total: ~20 hours over 2.5 days**  
**All phases sequential (dependency chain)**

---

## Blockers to Resolve Before Starting

1. ⚠️ Tables `atlas_tree_nodes`, `atlas_summary_layers`, `atlas_topology_index` may not exist
   - Verify: `psql ... SELECT * FROM information_schema.tables WHERE table_name LIKE 'atlas_%';`

2. ⚠️ `parent_atlas_documents` may be empty (0 rows)
   - Verify: `psql ... SELECT COUNT(*) FROM parent_atlas_documents;`

3. ⚠️ Replay harness scripts may need to be created
   - Check: `ls scripts/atlas/run-replay-harness.mjs`
   - Check: `ls scripts/atlas/generate-replay-queries.mjs`

**Recommended Pre-Flight Checklist (1 hour)**:
- [ ] Verify schema tables exist
- [ ] Seed parent_atlas_documents if empty
- [ ] Verify replay harness scripts exist (or create them)
- [ ] Verify all drizzle/manual/0047-0049 migrations don't already exist

---

## After Completion

Once all 5 phases pass and exit criteria met:

1. **Create final completion report** at `docs/PARENT-ATLAS-OPERATIONAL-COMPLETION-SUMMARY.md`
2. **Update memory** with "Parent Atlas: 100% operational and proof gates PASS"
3. **Proceed to codebase pruning** (next phase, ~3-5 hours)
