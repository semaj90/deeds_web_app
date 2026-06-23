# P3g Execution Plan — Ready to Launch (2026-06-23)

**Status**: ✅ READY — Classification complete, scripts ready, all health checks PASS

---

## P3g Scope (15,507 Missing Packets)

| Packets | Action | Tool | Time | Status |
|---------|--------|------|------|--------|
| **13,545** | **EMBED** | `npm run atlas:backfill:qdrant:embeddings:apply` | 78 min | ✅ READY |
| **154** | **JOIN REPAIR** | `npm run atlas:repair:qdrant-postgres-match` | 5 min | ✅ READY (script created) |
| **1,512** | **SKIP** | (non-vector, docs, empty) | — | ✅ EXPECTED |
| **296** | **REVIEW** | Manual inspection | — | ⏳ DEFERRED |

---

## Pre-Execution Checklist

### ✅ Services Verified
- Postgres: **OK**
- Qdrant: **OK** (768-dim, codebase_chunks_768)
- Ollama: **OK** (embeddinggemma found)
- Recommended batch size: **100**

### ✅ Scripts Ready
1. **Embedding backfill**: `npm run atlas:backfill:qdrant:embeddings:apply`
2. **Join repair**: `scripts/atlas/repair-qdrant-postgres-join.mjs` (created today)
3. **Verify**: `npm run atlas:verify:p3-readiness`

### ✅ Classification Complete
- Generated: `docs/reports/qdrant-p3g-missing-classification.md`
- JSON export: `docs/reports/qdrant-p3g-missing-classification.json`
- No ambiguities blocking main work (296 ambiguous deferred)

---

## Execution Sequence

### Phase A: Join Repair (5 min) — FIRST
**Purpose**: Sync 154 packets that already exist in Qdrant but lack Postgres qdrant_point_id

```bash
# Dry-run first
node scripts/atlas/repair-qdrant-postgres-join.mjs 2>&1 | tee /tmp/join-repair-dry.log

# Review output, then apply
# (script auto-updates Postgres if dry-run succeeds)

# Report generated: docs/reports/p3g-join-repair-results.json
```

**Expected Output**:
```
RESULTS:
  ✅ Repaired: ~150-154
  ❌ Failed: 0-2 (ambiguous payloads)
  ⏭️  Skipped: 0-2 (not found in Qdrant)
```

### Phase B: Embedding Backfill (78 min) — SECOND
**Purpose**: Generate embeddings for 13,545 packets via Ollama

```bash
# Option 1: Standard (single worker, 78 min)
npm run atlas:backfill:qdrant:embeddings:apply --batch-size=100

# Option 2: Faster (4 workers in parallel, ~20-30 min if GPU/network permits)
npm run atlas:backfill:qdrant:embeddings:apply --batch-size=100 --workers=4

# Real-time progress:
tail -f /tmp/backfill-embedding.log
```

**Expected Outputs**:
- New rows in Postgres `atlas_packets.qdrant_point_id`
- New points in Qdrant `codebase_chunks_768`
- Report: `docs/reports/backfill-embeddings-results.json`

### Phase C: Verification (5 min) — THIRD
**Purpose**: Confirm all 15,507 packets now have qdrant_point_id set

```bash
npm run atlas:verify:p3-readiness
```

**Expected Result**:
```
✅ P3 Readiness:
  Total packets: 17,995
  With qdrant_point_id: 17,995 (100%)
  Qdrant collection verified: 58 collections
  Status: READY FOR P4 TOPOLOGY REFRESH
```

---

## Parallel Work (Can Run During Embedding)

While Phase B embedding runs (~78 min), launch in background:

1. **G17 Refactoring** (26+ files, hardcoded localhost → ENV vars)
2. **P4 Planning** (topology refresh, Neo4j SIMILAR_TOPOLOGY edges)
3. **P3 Ambiguity Review** (296 packets that need manual classification)

---

## Post-P3g Actions (P4 & Beyond)

### P4: Graph Refresh & Topology
Once P3g complete (all 17,995 packets in Qdrant):
1. Neo4j SIMILAR_TOPOLOGY edges based on Qdrant adjacency
2. SOM coordinates migrated to Neo4j nodes
3. Karpathy Authority Blend recalculation
4. Directory summaries refreshed

```bash
npm run graphify:topology:refresh
npm run graphify:authority:recalc
npm run graphify:directory:summarize
```

### P5: Verification & Health
```bash
npm run atlas:verify:p4-complete
npm run atlas:audit:full-pipeline
```

---

## Risk Mitigation

### Monitoring
- **Embedding backfill**: Monitor Ollama latency + Qdrant point creation
- **Join repair**: Check Postgres update counts match expected
- **Verification**: Ensure 100% coverage (17,995/17,995)

### Rollback Plan
If embedding fails partway:
1. Report shows last successful batch
2. Resume with `--resume-batch N` flag
3. No data loss (idempotent upsert on point ID)

### Disk Space
- Qdrant growing by ~1.2 GB (13,545 packets × 768-dim × 4 bytes)
- Check: `docker exec legal-ai-qdrant du -sh /var/lib/qdrant`

---

## Commit Strategy

After each phase, commit results:

```bash
# Phase A (join repair)
git add docs/reports/p3g-join-repair-results.json
git commit -m "fix(atlas): P3g join repair — sync 154 Qdrant packets to Postgres

- Synced 154 packets with existing Qdrant payload
- Updated Postgres qdrant_point_id and qdrant_collection fields
- Report: docs/reports/p3g-join-repair-results.json"

# Phase B (embedding backfill)
git add docs/reports/backfill-embeddings-results.json sveltekit-frontend/docs/reports/
git commit -m "feat(atlas): P3g embedding backfill — 13,545 packets to Qdrant

- Embedded 13,545 packets via Ollama embeddinggemma
- Synced to Qdrant codebase_chunks_768 collection
- Updated Postgres qdrant_point_id for all 13,545
- Report: docs/reports/backfill-embeddings-results.json
- Coverage: 17,995/17,995 (100%)"

# Phase C (verification)
git add docs/audit/p3-complete-verification.md
git commit -m "audit(atlas): P3g completion verified — 100% Qdrant coverage

- All 17,995 packets now have qdrant_point_id
- All 58 Qdrant collections operational
- Join repair: 154 packets synced
- Embedding backfill: 13,545 packets embedded
- Status: READY FOR P4 TOPOLOGY REFRESH"
```

---

## Timeline

| Phase | Duration | Start | End | Status |
|-------|----------|-------|-----|--------|
| **Join Repair** | 5 min | Now | Now + 5 min | ✅ READY |
| **Embedding** | 78 min | Now + 5 min | Now + 83 min | ✅ READY |
| **Verify** | 5 min | Now + 83 min | Now + 88 min | ✅ READY |

**Total Wall-Clock Time**: ~88 min (can parallelize other work during embedding)

---

## Success Criteria

- ✅ P3g join repair: 154 packets synced (0 failures)
- ✅ P3g embedding: 13,545 packets embedded (0 data loss)
- ✅ P3g verify: 17,995/17,995 packets have qdrant_point_id (100%)
- ✅ All commits pushed to origin/main
- ✅ Ready to proceed to P4 (topology refresh)

---

**Decision**: Ready to execute? Run Phase A now: `node scripts/atlas/repair-qdrant-postgres-join.mjs`

Then proceed to Phase B embedding: `npm run atlas:backfill:qdrant:embeddings:apply --batch-size=100`
