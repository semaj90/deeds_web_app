# Agent 4: Lane 4 — Execution Checklist

**Agent**: Claude Code (Agent 4)  
**Lane**: 4 — GPU Karpathy + NES Chrom (50% → 100%)  
**Target Time**: 2–3h  
**Status**: ✅ Scripts ready, awaiting execution

---

## Pre-Execution Checklist

- [x] Read Lane 4 quick-reference (LANE-QUICK-REFERENCE.md)
- [x] Created audit-gpu-enrichment.mjs (Producer)
- [x] Created standardize-karpathy-gpu-packets.mjs (Consumer)
- [x] Created standardize-nes-chrom-packets.mjs (Consumer)
- [x] Created merge-gpu-enrichment.mjs (Consumer)
- [x] Created verify-gpu-merge.mjs (Verifier)
- [x] Created orchestrate-gpu-lane.mjs (Orchestrator)
- [x] Registered 8 npm scripts in package.json
- [x] Verified syntax: `node --check` all 6 scripts ✅
- [x] Created AGENT-4-LANE-4-EXECUTION-GUIDE.md
- [x] Created this checklist

---

## Execution Sequence (Copy-Paste Ready)

### Phase 1: Audit (Prerequisite Check)
```bash
npm run atlas:gpu:audit:enrichment
```
**Expected**: 
- ✅ docs/reports/gpu-enrichment-audit.json created
- ✅ karpathy_scores_cached = 7753
- ✅ nes_chrom_latent_cached ≥ 7753
- ✅ merge_ready = true

**If FAIL**: Stop and investigate Redis/Postgres connectivity

---

### Phase 2: Standardization (Dry-Run Both)
```bash
npm run atlas:gpu:standardize-karpathy:dry
npm run atlas:gpu:standardize-nes-chrom:dry
```
**Expected**:
- ✅ docs/reports/gpu-karpathy-packets.jsonl (7753 lines)
- ✅ docs/reports/gpu-karpathy-standardization-report.json
- ✅ docs/reports/nes-chrom-packets.jsonl (≥7753 lines)
- ✅ docs/reports/nes-chrom-standardization-report.json
- ✅ Zero collisions in both reports

**If FAIL**: Check packet_key uniqueness in atlas_packets

---

### Phase 3: Merge Dry-Run
```bash
npm run atlas:gpu:merge-all:dry
```
**Expected**:
- ✅ docs/reports/gpu-enrichment-merge-dry-run.json
- ✅ packets_to_merge = 7753
- ✅ collisions = 0
- ✅ coverage.both = 7753

**If FAIL**: Stop before apply, investigate JSONL file integrity

---

### Phase 4: Merge Apply (Execute After Phase 3 Review)
```bash
npm run atlas:gpu:merge-all
```
**Expected**:
- ✅ docs/reports/gpu-enrichment-merge-apply-report.json
- ✅ postgres_updated = 7753
- ✅ postgres_success = true
- ✅ transaction = COMMITTED

**If FAIL**: Postgres transaction rolled back, no data mutated. Safe to retry after fixing issue.

---

### Phase 5: Verification
```bash
npm run atlas:gpu:verify-merge
```
**Expected**:
- ✅ docs/reports/gpu-merge-verification.json
- ✅ with_karpathy = 7753
- ✅ with_nes_chrom ≥ 7753
- ✅ with_both = 7753
- ✅ gates.final_verify = PASS
- ✅ ann_latency_ms < 1000

**If FAIL**: Check Postgres for update success, Qdrant for health (optional)

---

## One-Command Execution (Recommended)

```bash
npm run atlas:gpu:lane:orchestrate:dry    # Dry-run all steps
# Review outputs in docs/reports/gpu-*

npm run atlas:gpu:lane:orchestrate        # Apply all steps
# Final verification happens automatically
```

---

## Success Criteria Verification

### Audit Gate
- [ ] `merge_ready` = true
- [ ] karpathy_scores_cached = 7753
- [ ] nes_chrom_latent_cached ≥ 7753

### Standardization Gates
- [ ] gpu-karpathy-packets.jsonl: 7753 packets
- [ ] nes-chrom-packets.jsonl: ≥7753 packets
- [ ] Zero collisions in both files

### Merge Gates
- [ ] Dry-run: packets_to_merge = 7753, collisions = 0
- [ ] Apply: postgres_updated = 7753, transaction COMMITTED

### Verification Gates
- [ ] with_karpathy = 7753
- [ ] with_nes_chrom ≥ 7753
- [ ] with_both = 7753
- [ ] final_verify = PASS

### Artifacts
- [ ] docs/reports/gpu-enrichment-audit.json
- [ ] docs/reports/gpu-karpathy-packets.jsonl
- [ ] docs/reports/gpu-karpathy-standardization-report.json
- [ ] docs/reports/nes-chrom-packets.jsonl
- [ ] docs/reports/nes-chrom-standardization-report.json
- [ ] docs/reports/gpu-enrichment-merge-dry-run.json
- [ ] docs/reports/gpu-enrichment-merge-apply-report.json
- [ ] docs/reports/gpu-merge-verification.json

---

## Environment Validation

Before starting, verify these are set or have defaults:

```bash
# Redis
echo "Redis: $REDIS_HOST:${REDIS_PORT:-6379}"

# Postgres
echo "Database: ${DATABASE_URL:-postgresql://legal_admin:legal_admin@127.0.0.1:5432/legal_ai_db}"

# Qdrant (optional)
echo "Qdrant: ${QDRANT_URL:-http://127.0.0.1:6333}"
```

All have sensible defaults. If connection fails at runtime, check service status.

---

## Estimated Timeline

| Phase | Script | Duration | Status |
|-------|--------|----------|--------|
| Audit | audit-gpu-enrichment | ~5s | TBD |
| Standardize | standardize-karpathy-gpu-packets | ~30s | TBD |
| Standardize | standardize-nes-chrom-packets | ~30s | TBD |
| Merge (dry) | merge-gpu-enrichment | ~10s | TBD |
| Merge (apply) | merge-gpu-enrichment --apply | ~30s | TBD |
| Verify | verify-gpu-merge | ~10s | TBD |
| **Total** | orchestrate-gpu-lane | **~2min** | TBD |

**For multiple trials/retries**: ~5-10 min total (parallel execution possible for audit + standardization)

---

## Rollback Instructions

### If Apply Phase Fails
Postgres transaction automatically rolls back. All updates are inside `BEGIN...COMMIT` block.

**To retry**:
1. Identify error in postgres logs or merge-apply-report.json
2. Fix root cause (e.g., missing column, connection timeout)
3. Run `npm run atlas:gpu:merge-all` again

No manual cleanup needed.

### If Verify Phase Fails
Check Postgres:
```sql
SELECT COUNT(*) as total, 
       COUNT(gpu_scores) as with_karpathy, 
       COUNT(nes_chrom) as with_nes_chrom
FROM atlas_packets;
```

If counts are lower than expected, debug standardization (was data truncated in JSONL?).

---

## Communication Template (Report to Workstation)

After completion, report:

```
✅ Lane 4 (GPU Karpathy + NES Chrom) COMPLETE

Summary:
- Audit: 7753 packets cached (karpathy + nes_chrom)
- Standardize: 0 collisions, 100% coverage
- Merge: Postgres updated 7753 rows, transaction COMMITTED
- Verify: 100% coverage (with_both=7753), ANN latency <1s

ACE/KAG/DAG Hits: 5 emitted (all gates PASS)
Artifacts: 8 reports written to docs/reports/gpu-*
Status: Ready for Phase B cross-lane verification

Blockers: None
Defer reasons: None
```

---

## Parallel Execution Note

Lane 4 can run in **parallel with Lane 5** (both start after Lane 3 completes).
- Lane 4 affects: Postgres atlas_packets, Qdrant codebase_chunks_768
- Lane 5 affects: Redis, Bifrost (separate services)
- No write conflicts expected

Coordinate with Lane 5 agent if both running simultaneously.

---

## Reference Documents

- [LANE-QUICK-REFERENCE.md#lane-4-checklist](LANE-QUICK-REFERENCE.md#lane-4-checklist) — Lane 4 quick ref
- [AGENT-TASK-PACKAGES-2026-06-13.md#-agent-4-lane-4](AGENT-TASK-PACKAGES-2026-06-13.md#-agent-4-lane-4) — Full task package
- [AGENT-4-LANE-4-EXECUTION-GUIDE.md](AGENT-4-LANE-4-EXECUTION-GUIDE.md) — Detailed execution guide
- [HARNESS-STANDARDIZATION-ROLLOUT.md](HARNESS-STANDARDIZATION-ROLLOUT.md) — Harness pattern reference
- [ace-kag-dag-evidence-schema.ts](../../src/lib/server/atlas/ace-kag-dag-evidence-schema.ts) — Schema for hits

---

## Status: READY TO EXECUTE ✅

All dependencies met. No blockers.

**Next action**: Execute `npm run atlas:gpu:lane:orchestrate` or run scripts individually per Phase 1-5 above.
