# Session 71: P3g Execution Ready

**Date**: June 23, 2026 (Session 70 End → Session 71 Start)  
**Status**: 🚀 **STAGED AND READY FOR EXECUTION**  
**Duration Estimate**: 60–90 minutes (worker pool)

---

## P3 Completion Summary

**All structural gates PASS** (verified via `npm run atlas:verify:p3-readiness`):

| Gate | Status | Details |
|------|--------|---------|
| P1h Schema | ✅ | `retrieval_strategy` + `retrieval_path` columns added |
| P2 Provenance | ✅ | 250/250 rows populated (100% with sensible defaults) |
| P3 Join Repair | ✅ | 2,488/17,995 packets linked via atlas_higher_hop_index |
| P3g Work Queue | ✅ | 15,507 packets (86.2%) need Qdrant embeddings |
| Authority Chain | ✅ | Postgres → Qdrant → Neo4j hierarchy intact |

---

## P3g Backfill Infrastructure

### Staged Components

**Backfill Script**: `scripts/atlas/backfill-packets-embeddings-pool.mjs`
- Workers: 4 concurrent
- Batch size: 100 packets per batch
- Checkpoint interval: 500 packets (progress reporting)
- Flow: Fetch metadata → Embed via Ollama → Upsert to Qdrant → Update Postgres

**Verification Script**: `scripts/atlas/verify-p3-readiness.mjs`
- 5 gates, all PASS
- Detects blockers before execution
- Provides next steps guidance

**npm Commands**:
```bash
# Dry run with 100-packet sample
npm run atlas:backfill:qdrant:embeddings:dry

# Full backfill (LIVE, executes immediately)
npm run atlas:backfill:qdrant:embeddings:apply

# Verification gate
npm run atlas:verify:p3-readiness
```

### Execution Profile

**Recommended**: Option B (Worker Pool)
- Rationale: 4–8× faster than sequential, built-in checkpointing, balanced complexity
- Expected throughput: 150–200 packets/minute (depends on GPU VRAM utilization)
- Total time: 15,507 packets ÷ 175 packets/min ≈ 89 minutes

**Alternative if performance degrades**:
- Reduce workers to 2 (if VRAM limited)
- Reduce batch size to 50 (if Qdrant upsert timeouts)
- Switch to sequential (Option A) if worker coordination issues

### Service Dependencies

**Required Online**:
- PostgreSQL 18 (read atlas_packets, write qdrant_point_id updates)
- Qdrant 0.12+ (upsert to codebase_chunks_768, port 6333)
- Ollama embeddinggemma:latest (embedding generation, port 11434)

**Verification**:
```bash
# Postgres
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets"

# Qdrant
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768 | jq '.result.points_count'

# Ollama
curl -s http://127.0.0.1:11434/api/tags | jq '.models[] | select(.name | contains("embedding"))'
```

---

## Execution Checklist

**Before Starting**:
- [ ] Verify P3 readiness gates pass: `npm run atlas:verify:p3-readiness`
- [ ] Postgres online and accessible
- [ ] Qdrant online and accepting upserts
- [ ] Ollama embeddinggemma:latest ready
- [ ] GPU VRAM available (2–4 GB for concurrent embeddings)

**During Execution**:
- Monitor progress via checkpoint output (~every 500 packets)
- If errors occur, review backfill script stderr and Ollama logs
- Expected rate: 150–200 packets/min (allows interruption/resume)

**After Completion**:
- [ ] Run verification: `npm run atlas:verify:p3-readiness` (should show 100% coverage)
- [ ] Spot-check Qdrant: `curl http://127.0.0.1:6333/collections/codebase_chunks_768`
- [ ] Sample Postgres: `SELECT COUNT(*) FROM atlas_packets WHERE qdrant_point_id IS NOT NULL`

---

## Expected Output (Success Case)

```
P3g: Backfill Qdrant Embeddings
  Mode: APPLY
  Workers: 4
  Batch size: 100
  Checkpoint interval: 500

📊 Before Backfill:
  atlas_packets: 2488/17995 with qdrant_point_id

📦 Fetching packets needing embeddings...
  Found 15507 packets needing embeddings

⚙️  Processing embeddings...
  ✓ Processed 500/15507 (29.3 packets/sec)
  ✓ Processed 1000/15507 (28.9 packets/sec)
  ✓ Processed 1500/15507 (29.1 packets/sec)
  ...
  ✓ Processed 15507/15507 (28.7 packets/sec)

✅ Completed 15507 packets (15507 succeeded)

📊 After Backfill:
  atlas_packets: 17995/17995 with qdrant_point_id
  Coverage improved: +15507 (100.0%)

🎉 All packets have qdrant_point_id!
```

---

## Parallel Work While P3g Runs

**No blocking dependencies** — these can start immediately:

- **P4**: Higher-hop enrichment validation (20 min, independent)
- **P5**: GPU acceleration health audit (15 min, independent)

---

## Failure Recovery

**If backfill script fails**:

1. **Log inspection**:
   ```bash
   # Check Ollama availability
   curl -s http://127.0.0.1:11434/api/tags

   # Check Qdrant availability
   curl -s http://127.0.0.1:6333/health

   # Check Postgres connection
   psql $DATABASE_URL -c "SELECT 1"
   ```

2. **Resume from checkpoint**:
   - Backfill script writes progress incrementally
   - Re-run `npm run atlas:backfill:qdrant:embeddings:apply` to resume

3. **If Qdrant upsert times out**:
   - Reduce batch size: `--batch-size=50`
   - Reduce workers: `--workers=2`

---

## Files Delivered (Session 70)

**Scripts**:
- `scripts/atlas/backfill-packets-embeddings-pool.mjs` — P3g backfill (Option B)
- `scripts/atlas/verify-p3-readiness.mjs` — P3g readiness gate

**Schema & Migrations**:
- `drizzle/manual/0049_retrieval_provenance_p2_fields.sql` — P1h (already applied)

**Documentation**:
- `docs/P3G-BACKFILL-ROADMAP.md` — Architecture and implementation options
- `docs/P1-P2-P3-COMPLETION-JUNE-23.md` — Full three-phase journey
- `memory/p1-p3-authority-chain.md` — Authority chain narrative
- `memory/p3-completion-checkpoint.md` — Session 70 checkpoint
- `docs/SESSION-71-P3G-EXECUTION-READY.md` — This file

**npm Scripts Added**:
```json
"atlas:backfill:qdrant:embeddings": "...",
"atlas:backfill:qdrant:embeddings:dry": "...",
"atlas:backfill:qdrant:embeddings:apply": "...",
"atlas:verify:p3-readiness": "..."
```

---

## Success Criteria (Session 71)

✅ **Objective**: 17,995/17,995 packets have valid `qdrant_point_id` in Postgres  
✅ **Outcome**: Qdrant `codebase_chunks_768` fully populated  
✅ **Authority Chain**: 100% synchronized (Postgres → Qdrant)  
✅ **Next Gate**: P4 enrichment validation (ready to run in parallel)

---

## Next Actions (Session 71)

**Immediate**:
1. Verify readiness: `npm run atlas:verify:p3-readiness`
2. Start backfill: `npm run atlas:backfill:qdrant:embeddings:apply`
3. Monitor progress (60–90 min)

**After Completion**:
1. Re-run verification: confirm 100% coverage
2. Start P4 enrichment validation (parallel lane)
3. Prepare P6–P7 deferred work (depends on P3g complete)

---

**Status**: 🚀 STAGED, TESTED, READY TO EXECUTE

**Estimated Total Session 71 Duration**: 60–90 minutes + 15 min verification

**Blockers**: None

---

Generated: June 23, 2026 (Session 70 end)  
Ready for: Session 71 (P3g backfill execution)
