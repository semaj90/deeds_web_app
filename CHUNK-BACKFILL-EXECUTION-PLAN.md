# Chunk Registration & Domain Classification Backfill Plan

**Date**: July 19, 2026  
**Status**: Ready to Execute  
**Estimated Time**: 1.5 hours total

---

## Overview

This plan registers orphaned codebase chunks (40K+ rows in Qdrant with no Postgres identity) and backfills domain classification. After execution:

- ✅ All 40K+ orphaned chunks will have `atlas_packets` rows (canonical Postgres identity)
- ✅ All packets will be assigned `domain_class` (15-category taxonomy)
- ✅ Qdrant payloads will be enriched with domain metadata
- ✅ Redis cache will be populated for fast MCP tool selection

---

## Script Status

### ✅ Created This Session
1. **`register-orphaned-chunks.mjs`** (420 lines)
   - Finds orphaned chunks (in Qdrant, not in Postgres)
   - Generates stable packet_key, extracts directory_path and feature_id
   - Inserts into atlas_packets table
   - Supports: dry-run, --apply, --limit, --verbose

2. **`audit-qdrant-payload-coverage.mjs`** (380 lines)
   - Verifies payload completeness after backfill
   - Checks for collisions, null fields, orphans
   - Reports 7 coverage gates (must all pass)
   - Outputs JSON audit report

### ✅ Already Implemented
3. **`classify-domain-ontology.mjs`** (550 lines)
   - Classifies packets into 15-domain taxonomy
   - 4-signal scoring: source_ref path, feature_id, concept_ids, summary keywords
   - Writes domain_class + ontology_tags + confidence to Postgres + Redis
   - Optional Qdrant payload patching

---

## Execution Plan (5 Phases)

### Phase 1: Pre-Flight Audit (2 min — no writes)

**Goal**: Confirm Postgres/Qdrant accessibility and determine orphan scope.

```bash
# 1. Quick sanity check
node scripts/atlas/audit-atlas-packet-join-gaps.mjs

# 2. Check current classification state
node scripts/atlas/classify-domain-ontology.mjs
```

**Expected output**:
- Orphan count (should be ~40K based on prior assessment)
- Current domain distribution (baseline for Step 5 comparison)
- Any Redis/Qdrant connection issues flagged early

---

### Phase 2: Registration Dry-Run (3 min — no writes)

**Goal**: Inspect sample registrations before committing.

```bash
node scripts/atlas/register-orphaned-chunks.mjs --verbose
```

**Expected output**:
```
═══ Chunk Registration (DRY_RUN) ═══

Finding orphaned chunks...
Found 40,382 orphaned source_refs

(Dry-run) Would register 40,382 chunks:
  Sample: src/lib/server/auth.ts → auth (auth_login_register)
  Sample: src/routes/api/cases/+server.ts → cases (case_management)
  ... 40,380 more
```

**What to check**:
- ✅ Orphan count is reasonable (>30K expected)
- ✅ Feature_id extraction looks sensible
- ✅ Default domain_class inference is plausible

If anything looks wrong, investigate before proceeding.

---

### Phase 3: Registration Apply (10–15 min — writes Postgres)

**Goal**: Insert 40K+ rows into atlas_packets.

```bash
# Full apply (all orphans)
node scripts/atlas/register-orphaned-chunks.mjs --apply --verbose

# OR batch apply (if worried about locks)
node scripts/atlas/register-orphaned-chunks.mjs --apply --limit=5000
node scripts/atlas/register-orphaned-chunks.mjs --apply --limit=5000  # Run again, next batch
# Repeat until no more orphans
```

**Expected output**:
```
═══ Chunk Registration (APPLY) ═══

Finding orphaned chunks...
Found 40,382 orphaned source_refs

Applying registration...
  Registered: 40,382/40,382   

✅ Registration complete:
  Registered: 40,382
  Skipped:    0

Database state:
  Total atlas_packets (codebase_chunk): 99,687

✨ Next: run classify-domain-ontology.mjs to assign domain_class
```

**What to watch**:
- Registered count increases steadily (>100/sec = normal)
- No SQL errors in logs
- Duration is reasonable (40K rows in 10–15 min on modern DB)

---

### Phase 4: Classification & Enrichment (15–20 min — writes Postgres/Redis/Qdrant)

**Goal**: Assign domain_class to all packets (old + new) and patch Qdrant payloads.

```bash
# Dry-run classification on newly-registered packets
node scripts/atlas/classify-domain-ontology.mjs

# Apply classification
node scripts/atlas/classify-domain-ontology.mjs --apply --verbose

# Also patch Qdrant (slow but important)
node scripts/atlas/classify-domain-ontology.mjs --apply --qdrant --verbose
```

**Expected output**:
```
═══ Domain Ontology Classifier (APPLY) ═══

Redis: connected
Packets to classify: 99,687
Already classified (conf ≥0.70): 4,600
To classify: 95,087

Domain coverage: 95,087/95,087 (100.0%)
Unknown:         0

Applying DB updates…
  DB updated: 200/95,087
  DB updated: 2,200/95,087
  ...
  DB updated: 95,000/95,087   

DB updated:     95,087
Qdrant updated: 95,087
Redis domain:packet:class: 95,087 entries

✅ GATE PASS
  ✅ domain_coverage              100.0% known (gate ≥95%)
  ✅ db_write_success             95,087 rows updated
  ✅ unknown_below_5              0.0% unknown

Report: docs/reports/domain-ontology-classification.json
```

**Key metrics to verify**:
- ✅ Domain coverage ≥95% (should be 100%)
- ✅ All 15 domains present in distribution
- ✅ Qdrant updated count matches DB count

---

### Phase 5: Validation Audit (2 min — read-only)

**Goal**: Verify backfill completeness and payload consistency.

```bash
node scripts/atlas/audit-qdrant-payload-coverage.mjs --verbose
```

**Expected output**:
```
═══ Qdrant Payload Coverage Audit ═══

Fetching Qdrant collection info...
  Points: 95,087
  Vector dim: 768

Auditing Qdrant payloads...
  Total scanned: 95,087
  With packet_key: 95,087 (100.0%)
  With source_ref: 95,087 (100.0%)
  With feature_id: 95,087 (100.0%)
  With domain_class: 95,087 (100.0%)
  Null payloads: 0

══ Coverage Gates ════════════════════
  ✅ qdrant_point_count
  ✅ postgres_packet_count
  ✅ packet_key_coverage_90pct
  ✅ source_ref_coverage_95pct
  ✅ no_collisions
  ✅ minimal_null_payloads

✅ GATE PASS

Report: docs/reports/qdrant-payload-coverage-audit.json
```

**If any gate fails**:
- ❌ `packet_key_coverage_90pct` → Some Qdrant points have NULL packet_key
  - Likely: registration script skipped some rows
  - Fix: Re-run registration for missing source_refs

- ❌ `no_collisions` → Duplicate packet_keys in Qdrant
  - Likely: same source_ref indexed twice
  - Fix: Requires manual Qdrant dedup (contact ops)

- ❌ `null_payloads` → More than 1% of points have empty payloads
  - Likely: registration completed but Qdrant sync incomplete
  - Fix: Re-run classify-domain-ontology --apply --qdrant

---

## Troubleshooting

### Problem: "Cannot connect to Postgres"
```
Error: connect ECONNREFUSED 127.0.0.1:5434
```
**Solution**:
1. Verify DATABASE_URL: `echo $DATABASE_URL`
2. Check Postgres running: `docker ps | grep postgres`
3. If needed, update `.env`: `DATABASE_URL=postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db`
4. Retry script

### Problem: "Qdrant collection not found"
```
Error: Qdrant: 404 Not Found
```
**Solution**:
1. Verify QDRANT_URL: `echo $QDRANT_URL`
2. Check collection exists: `curl -s http://127.0.0.1:6333/collections | jq .result.collections | grep codebase_chunks_768`
3. If missing, create: `curl -X PUT http://127.0.0.1:6333/collections/codebase_chunks_768 -H "Content-Type: application/json" -d '{...}'`
4. Retry script (with `--apply` not needed for audit-only scripts)

### Problem: "Slow registration (< 10 rows/sec)"
**Cause**: Postgres under load or table lock contention  
**Solution**:
1. Batch size: Re-run with `--limit=1000` (smaller batches)
2. Index check: `REINDEX TABLE atlas_packets` (optional, careful)
3. Connection pool: Verify `max: 3` not too low in pool config (line 67)

### Problem: "Redis timeout"
**Cause**: Valkey service down or password mismatch  
**Solution**:
1. Test Redis: `redis-cli -h 127.0.0.1 -p 6379 -a redis PING`
2. Check password in `.env`: `REDIS_PASSWORD=redis`
3. If Valkey down: `docker-compose up -d legal-ai-redis` (or valkey container name)
4. Scripts continue safely without Redis (just no cache)

---

## Expected Metrics

After backfill completion:

| Metric | Before | After | Gate |
|--------|--------|-------|------|
| atlas_packets total | ~58K | ~99K | N/A |
| atlas_packets with domain_class | ~54K | ~99K | ✅ 99%+ |
| Qdrant points with packet_key | 0 | ~95K | ✅ >90% |
| Qdrant points with domain_class | 0 | ~95K | ✅ >90% |
| Redis domain:packet:class entries | 0 | ~99K | ✅ present |
| Payload collisions | 0 | 0 | ✅ none |

---

## Next Steps After Backfill

Once backfill is complete and gates pass:

### Immediate (enable features)
1. **MCP Tool Selection** — now uses domain_class for tool overlap scoring
   - No code change needed; runtime picks this up from Redis hash
   - Verify: `redis-cli HGETALL domain:packet:class | head -20`

2. **XGBoost Reranking** — domain_class is now a feature
   - Can use for Phase 7 reranker training
   - See `docs/PHASE-7-ARCHITECTURE.md`

3. **BM25 Scoping** — can scope FTS queries by domain
   - Optional: update search routes to accept `?domain=auth` param

### Medium-term (5–10 days)
1. **Retrieval Layer 2** — hybrid multi-vector search
   - Backfill enables Qdrant payload filtering
   - Implement `/api/codebase/search/multi-vector` endpoint

2. **RRF Fusion** — combine 3–4 lanes with Reciprocal Rank Fusion
   - Backfill enables confidence-based weighting per lane

3. **Enrichment** — LangExtract entity extraction async
   - Wire Mastra durable workflow for non-blocking pipeline

### Long-term (2–3 weeks)
- Full Phase 5 retrieval orchestrator (if justified by retrieval metrics)
- Replace Go service with unified TypeScript pipeline (optional, low priority)

---

## Safety & Rollback

### Idempotency
All scripts are **idempotent**:
- `register-orphaned-chunks.mjs` uses `ON CONFLICT (packet_key) DO NOTHING`
- `classify-domain-ontology.mjs` skips rows with confidence ≥0.70
- `audit-qdrant-payload-coverage.mjs` is read-only

**Safe to re-run** without data loss.

### Rollback (if needed)
If something goes wrong, rollback in reverse order:

```sql
-- 1. Delete newly-registered packets (if absolutely required)
-- ⚠️ DANGER: only if gates fail catastrophically
-- DELETE FROM atlas_packets WHERE source_kind = 'codebase_chunk' AND created_at > '2026-07-19 12:00:00';

-- 2. Revert domain_class assignments
-- UPDATE atlas_packets SET payload = payload - 'domain_class', payload = payload - 'domain_confidence';

-- 3. Clear Redis cache
-- redis-cli DEL domain:packet:class

-- All above are safe; use if needed.
```

---

## Execution Checklist

Before running Phase 2–4, verify:

- [ ] `.env` has DATABASE_URL pointing to correct Postgres instance
- [ ] `.env` has REDIS_PASSWORD (or defaults to 'redis')
- [ ] QDRANT_URL resolves (test: `curl http://127.0.0.1:6333/health`)
- [ ] Postgres is running and `legal_ai_db` database exists
- [ ] `atlas_packets` table exists (verify: `psql -c "\\dt atlas_packets"`)
- [ ] `codebase_chunk_index` table exists (verify: `psql -c "\\dt codebase_chunk_index"`)
- [ ] Qdrant collection `codebase_chunks_768` exists
- [ ] No active long-running queries blocking table access
- [ ] Disk space adequate (>1 GB free)

---

## Commands Quick Reference

```bash
# Phase 1: Audit
node scripts/atlas/audit-atlas-packet-join-gaps.mjs
node scripts/atlas/classify-domain-ontology.mjs

# Phase 2: Dry-run
node scripts/atlas/register-orphaned-chunks.mjs --verbose

# Phase 3: Register (full)
node scripts/atlas/register-orphaned-chunks.mjs --apply --verbose

# Phase 3: Register (batched, if slow)
node scripts/atlas/register-orphaned-chunks.mjs --apply --limit=5000

# Phase 4: Classify (dry-run)
node scripts/atlas/classify-domain-ontology.mjs

# Phase 4: Classify & apply (Postgres + Redis)
node scripts/atlas/classify-domain-ontology.mjs --apply --verbose

# Phase 4: Classify & apply & sync Qdrant
node scripts/atlas/classify-domain-ontology.mjs --apply --qdrant --verbose

# Phase 5: Validate
node scripts/atlas/audit-qdrant-payload-coverage.mjs --verbose

# All reports
ls -lh docs/reports/
cat docs/reports/chunk-registration-report.json
cat docs/reports/domain-ontology-classification.json
cat docs/reports/qdrant-payload-coverage-audit.json
```

---

## Success Criteria

Backfill is **COMPLETE** when:

1. ✅ Phase 3 registration reports ~40K newly-registered rows
2. ✅ Phase 4 classification reports 100% domain coverage (0 unknown)
3. ✅ Phase 5 audit gates all pass (GATE PASS message)
4. ✅ JSON reports written to `docs/reports/`

All gates typically pass within 1.5 hours total runtime.

---

**Status**: READY TO EXECUTE  
**Created**: 2026-07-19  
**Scripts**: register-orphaned-chunks.mjs, audit-qdrant-payload-coverage.mjs  
**Companion**: classify-domain-ontology.mjs (already implemented)
