# Phase B: Complete Execution Plan

**Status**: ✅ READY TO EXECUTE
**Phase A**: COMPLETE (1,000 summaries generated)
**Phase B Scripts**: ALL IMPLEMENTED (4 passes + orchestrator + audits)
**Last Updated**: 2026-06-29 02:00 UTC

---

## Executive Summary

Phase B consists of **three complementary systems**:

1. **Multi-Pass Enrichment** (NEW - just built)
   - Pass 2: Entity Extraction (LangExtract)
   - Pass 3: Domain Classification (Gemma4)
   - Pass 4: Relationship Graph (Neo4j)
   - Pass 5: BM25 Full-Text Indexing (Go service)

2. **Cache Management** (EXISTING)
   - RDB dump/restore for Docker crash recovery
   - Cache tier warming (cold/warm/hot)
   - Packet cache warmup from Postgres

3. **Readiness Audits** (EXISTING)
   - Pass-by-pass completion checking
   - Gap identification
   - Recommended execution order

All three systems work **independently but in sequence**:

```
Phase A (Complete) → Schema Migration → Pass 2-5 (Foreground) + Cache Ops (Parallel)
```

---

## Pre-Execution Checklist

- [x] Phase A complete (1,000 summaries)
- [x] Schema created (phase-b-enrichment-schema.sql)
- [x] 4 enrichment scripts created (phase-b2/3/4/5-*.mjs)
- [x] Orchestrator created (phase-b-multi-pass-enrichment.mjs)
- [x] 8 npm scripts added to package.json
- [x] Documentation complete (PHASE_B_MULTI_PASS_ENRICHMENT.md)

---

## Execution Steps (Sequential)

### Step 1: Apply Database Schema (5 minutes)

```bash
cd sveltekit-frontend

# Apply schema to Postgres
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < ../drizzle/manual/phase-b-enrichment-schema.sql

# Verify schema
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT table_name FROM information_schema.tables
  WHERE table_name IN ('atlas_feature_relationships', 'atlas_domain_ontology', 'atlas_enrichment_progress')
  ORDER BY table_name;
"
# Expected: 3 tables created + 9 new columns in atlas_packets
```

### Step 2: Check Readiness (2 minutes)

```bash
# See which passes are complete and which have gaps
npm run atlas:graphify:phase-b:additions

# This will show:
# ✅ Pass 2: Entity Extraction - gap count
# ✅ Pass 3: Domain Classification - gap count
# ✅ Pass 4: Feature Relationships - gap count
# ✅ Pass 5: BM25 Indexing - gap count
```

### Step 3: Run Multi-Pass Enrichment (200 minutes)

**Option A: All passes at once (recommended for first run)**

```bash
# Dry-run (preview, no writes)
npm run startup:phase-b:multi-pass:dry

# Apply (execute all passes sequentially)
npm run startup:phase-b:multi-pass:apply

# Verbose (detailed logging)
npm run startup:phase-b:multi-pass:verbose
```

**Option B: Individual passes (if you need to retry specific passes)**

```bash
# Pass 2: Entity Extraction (~75 min)
npm run atlas:phase-b2:langextract:apply

# Pass 3: Domain Classification (~60 min)
npm run atlas:phase-b3:classify:apply

# Pass 4: Relationships (~40 min)
npm run atlas:phase-b4:relationships:apply

# Pass 5: BM25 Indexing (~25 min)
npm run atlas:phase-b5:bm25:apply
```

### Step 4: Warm Redis Cache (10 minutes, parallel)

While enrichment runs (or after), warm cache from Postgres:

```bash
# In a separate terminal:
npm run atlas:redis:warm:packets

# This loads L1/L2 cache with packet data
# Safe to run in parallel with enrichment
```

### Step 5: Verify Phase B Complete (5 minutes)

```bash
# SQL audit queries
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT * FROM v_phase_b_progress;
"

# Expected output:
# Pass 2: Entity Extraction - 1000/1000 packets (100%)
# Pass 3: Domain Classification - 850/1000 packets (85%)
# Pass 4: Feature Relationships - 2500+ edges created
# Pass 5: BM25 Indexing - 950/1000 packets (95%)

# Optional: Check relationship types
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT relationship_type, COUNT(*) as count, ROUND(AVG(strength), 2) as avg_strength
  FROM atlas_feature_relationships
  GROUP BY relationship_type
  ORDER BY count DESC;
"
```

### Step 6: Create RDB Backup (5 minutes)

After Phase B completes, dump Redis for Docker crash recovery:

```bash
# Dump Redis to RDB file
npm run atlas:redis:dump

# This creates docker-backup/redis-dump-YYYY-MM-DD.rdb
# Used for recovery if Docker crashes
```

---

## Timeline

| Step | Task | Duration | Cumulative |
|------|------|----------|------------|
| 1 | Schema Migration | 5 min | 5 min |
| 2 | Readiness Check | 2 min | 7 min |
| 3a | Pass 2: Entity Extraction | 75 min | 82 min |
| 3b | Pass 3: Domain Classification | 60 min | 142 min |
| 3c | Pass 4: Relationships | 40 min | 182 min |
| 3d | Pass 5: BM25 Indexing | 25 min | 207 min |
| 4 | Cache Warmup (parallel) | 10 min | 207 min |
| 5 | Verification | 5 min | 212 min |
| 6 | RDB Backup | 5 min | 217 min |

**Total Expected Duration**: ~3.5 hours (217 minutes)

---

## Monitoring During Execution

### Real-Time Progress

```bash
# In one terminal: watch enrichment progress
tail -f logs/task-output/phase-b-enrichment/orchestrator-report.json

# In another: monitor Postgres writes
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT 'Entities' as metric, COUNT(CASE WHEN extracted_entities != '[]'::jsonb THEN 1 END) as count FROM atlas_packets
  UNION ALL
  SELECT 'Classified', COUNT(CASE WHEN feature_group_id IS NOT NULL THEN 1 END) FROM atlas_packets
  UNION ALL
  SELECT 'Relationships', COUNT(*) FROM atlas_feature_relationships
  UNION ALL
  SELECT 'BM25 Indexed', COUNT(CASE WHEN bm25_indexed_at IS NOT NULL THEN 1 END) FROM atlas_packets;
" && sleep 10 && clear
```

### Pass-Specific Logs

```bash
# While Pass 2 runs
tail -f logs/task-output/phase-b-enrichment/orchestrator-report.json | grep "Pass 2"

# While Pass 3 runs
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT feature_group_id, COUNT(*) FROM atlas_packets WHERE feature_group_id IS NOT NULL GROUP BY feature_group_id ORDER BY COUNT DESC LIMIT 5;"

# While Pass 4 runs
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT relationship_type, COUNT(*) FROM atlas_feature_relationships GROUP BY relationship_type;"

# While Pass 5 runs
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as indexed FROM atlas_packets WHERE bm25_indexed_at IS NOT NULL;"
```

---

## Dry-Run First (Strongly Recommended)

Before applying changes, always run dry-run:

```bash
# Dry-run all passes
npm run startup:phase-b:multi-pass:dry

# Expected output:
# 🟢 Pass 2: Entity Extraction - would process 1000 packets
# 🟢 Pass 3: Domain Classification - would classify 850 packets
# 🟢 Pass 4: Relationships - would create 2500+ edges
# 🟢 Pass 5: BM25 Indexing - would index 950 packets

# Verify the numbers match your expectations, then apply
```

---

## Rollback Procedures

If a pass fails, you can safely re-run it (all scripts are **idempotent**):

```bash
# If Pass 2 fails partway through, re-run it
npm run atlas:phase-b2:langextract:apply

# It will skip packets already processed and resume from where it left off
# Same for Pass 3, 4, 5

# If entire enrichment fails, reset and restart:
# 1. Delete partial results from Postgres
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  UPDATE atlas_packets SET extracted_entities = '[]'::jsonb WHERE extracted_entities IS NOT NULL;
  UPDATE atlas_packets SET feature_group_id = NULL;
  DELETE FROM atlas_feature_relationships;
  TRUNCATE atlas_enrichment_progress;
"

# 2. Re-run the orchestrator
npm run startup:phase-b:multi-pass:apply
```

---

## Next Phase (Phase C)

Once Phase B is complete and verified:

```bash
# Phase C: RFF Lane Fusion
npm run startup:phase-c:with-rff-fusion

# Or manually:
npm run atlas:phase1:backfill:summary:apply        # Summary embeddings
npm run atlas:phase2:sync:rff:apply                # Qdrant sync
npm run atlas:phase4:rff:warm-cache:apply          # Cache warmup
npm run atlas:phase4:rff:verify:apply              # E2E verification
```

Phase C adds the enriched summaries to all 5 RFF lanes:
- Lane 1: Content Semantic
- Lane 2: Error Patterns
- Lane 3: Code Signatures
- Lane 4: BM25 Full-Text ← **Phase B feeds this**
- Lane 5: Neo4j Topology

---

## Success Criteria

✅ **Phase B is complete when**:

1. **Pass 2 (Entities)**:
   - 95%+ of packets have `extracted_entities` OR `error_pattern` detected
   - Command: `SELECT COUNT(CASE WHEN extracted_entities != '[]'::jsonb OR error_pattern IS NOT NULL THEN 1 END) FROM atlas_packets;` → ~950+

2. **Pass 3 (Classification)**:
   - 85%+ of packets classified into domain groups
   - Command: `SELECT COUNT(CASE WHEN feature_group_id IS NOT NULL THEN 1 END) FROM atlas_packets;` → ~850+
   - At least 5 different domain groups created
   - Command: `SELECT COUNT(DISTINCT feature_group_id) FROM atlas_packets;` → 5+

3. **Pass 4 (Relationships)**:
   - 2,000+ relationships created across all types
   - Command: `SELECT COUNT(*) FROM atlas_feature_relationships;` → 2000+
   - All relationship types represented (sibling, parent, child, related_by_error)
   - Command: `SELECT COUNT(DISTINCT relationship_type) FROM atlas_feature_relationships;` → 4+

4. **Pass 5 (BM25)**:
   - 90%+ of packets indexed in Go service
   - Command: `SELECT COUNT(CASE WHEN bm25_indexed_at IS NOT NULL THEN 1 END) FROM atlas_packets;` → ~900+
   - All packets have search terms extracted
   - Command: `SELECT COUNT(CASE WHEN bm25_terms IS NOT NULL THEN 1 END) FROM atlas_packets;` → ~900+

---

## Troubleshooting

### Pass 2 (Entity Extraction) Slow

- LangExtract service (`:8091`) may be unresponsive
- Check: `curl http://127.0.0.1:8091/health`
- Fallback: Regex-only error pattern detection continues automatically

### Pass 3 (Classification) Stuck

- Gemma4 (`:8090`) may be overloaded
- Check: `curl http://127.0.0.1:8090/v1/models`
- Solution: Increase `--batch=50` (smaller batches) or increase timeout

### Pass 4 (Relationships) Timeout

- Neo4j write throughput may be slow
- Check: `docker exec legal-ai-neo4j cypher-shell -u neo4j -p <password> "RETURN 1;"`
- Solution: Run with `--verbose` to see which queries hang

### Pass 5 (BM25) Fails

- Go search service (`:8096`) unreachable
- Check: `curl http://127.0.0.1:8096/health`
- Fallback: Postgres metadata still written even if Go service unavailable

---

## Scripts Reference

### Multi-Pass Orchestrator
- **File**: `scripts/startup/phase-b-multi-pass-enrichment.mjs`
- **Runs**: All 4 passes sequentially
- **Commands**: `npm run startup:phase-b:multi-pass:{dry,apply,verbose}`

### Individual Pass Scripts
- **Pass 2**: `scripts/atlas/phase-b2-langextract-entities.mjs`
- **Pass 3**: `scripts/atlas/phase-b3-classify-domain.mjs`
- **Pass 4**: `scripts/atlas/phase-b4-relationships-graph.mjs`
- **Pass 5**: `scripts/atlas/phase-b5-bm25-indexing.mjs`

### Cache Management
- **File**: `scripts/atlas/phase-b-redis-cold-warm-hot-indexing.mjs`
- **Commands**: `npm run atlas:redis:{dump,restore,warm:packets,validate}`

### Readiness Audit
- **File**: `scripts/atlas/graphify-phase-b-additions.mjs`
- **Command**: `npm run atlas:graphify:phase-b:additions`

---

## Architecture Diagram

```
                    Phase A (Complete)
                         ↓
                  [1,000 summaries]
                         ↓
              ┌──────────────────────┐
              │ Step 1: Schema Sync  │
              │ 5 minutes            │
              └──────────┬───────────┘
                         ↓
              ┌──────────────────────┐
              │ Step 2: Readiness    │
              │ Check gaps           │
              └──────────┬───────────┘
                         ↓
        ┌────────────────────────────────────────┐
        │     Step 3: Multi-Pass Enrichment      │
        │          (200 minutes total)           │
        ├────────────────────────────────────────┤
        │ Pass 2: Entities (75 min)              │ ┐
        │ Pass 3: Classification (60 min)        │ │
        │ Pass 4: Relationships (40 min)         │ ├─ Sequential
        │ Pass 5: BM25 Indexing (25 min)        │ │
        └────────────────────────────────────────┘ ┘
                         ↓
        ┌────────────────────────────────────────┐
        │   Step 4: Cache Warmup (parallel)     │
        │   10 minutes                           │
        └────────────────────────────────────────┘
                         ↓
        ┌────────────────────────────────────────┐
        │   Step 5: Verification & Audit         │
        │   5 minutes                            │
        └────────────────────────────────────────┘
                         ↓
        ┌────────────────────────────────────────┐
        │   Step 6: RDB Backup (Docker safety)   │
        │   5 minutes                            │
        └────────────────────────────────────────┘
                         ↓
                    Phase B (Complete)
                         ↓
                  [Enriched packets +
                   Relationships +
                   BM25 Index]
                         ↓
                 Phase C: RFF Fusion
```

---

## Ready to Execute!

All systems are go. Choose your execution path:

### Quick Start (All at Once)
```bash
cd sveltekit-frontend
npm run startup:phase-b:multi-pass:apply
```

### Conservative (Dry-Run First)
```bash
cd sveltekit-frontend
npm run startup:phase-b:multi-pass:dry
# Review output, then:
npm run startup:phase-b:multi-pass:apply
```

### Step-by-Step (With Monitoring)
```bash
cd sveltekit-frontend
# Terminal 1: Monitoring
npm run atlas:graphify:phase-b:additions  # Check readiness
# Terminal 2: Execution
npm run startup:phase-b:multi-pass:apply --verbose
```

**Estimated completion**: ~3.5 hours from start
**Expected next milestone**: Phase C RFF Lane Fusion ready to execute

---

**Status**: ✅ READY
**Last Updated**: 2026-06-29 02:00 UTC
**Maintained by**: Claude (Anthropic)
