# Parent Atlas Pass Fabric

**Date**: 2026-08-11  
**Status**: APPROVED  
**Owner**: james  
**Priority**: P0  

## Problem

Current worker supervisor polls every 3 seconds and claims **one job per job type**, even when concurrency gates are empty:

```
embed_gate: 0/3 free → claims 1 (2 slot wasted)
entity_gate: 0/2 free → claims 1 (1 slot wasted)
forensics_gate: 0/4 free → claims 1 (3 slot wasted)
```

Result: ~70% concurrency utilization loss, 3 second polling latency.

## Solution

**Pass Fabric**: Durable Postgres queue + CPU worker pool + bounded GPU + Valkey cache + fork-join executor (max 3 tools).

### Core Changes

1. **claimBatch(jobType, freeSlots)** — atomic query claims ALL free slots, not just 1
2. **AnalysisPassResult ledger** — idempotency by (packet_key, source_revision, pass_name, pass_revision, input_hash)
3. **CPU worker pool** — clamp(availableParallelism, 2, 6) for tree-sitter, ast-grep, entropy
4. **pg_notify/LISTEN** — eliminate 3s polling, wake on enqueue + 30s fallback
5. **Valkey MGET/MSET batches** — max 128 keys per call, no 1-key Redis commands
6. **executeToolBatch(maxParallel=3)** — read-only DAG executor for agent tools
7. **Incremental eligibility** — skip packets already processed (source_revision + pass_revision match)

### Architecture Layers

| Layer | Component | Concurrency |
|-------|-----------|-------------|
| **Queue** | Postgres analysis_jobs + pg_notify | Durable, atomic |
| **CPU** | Worker pool (tree-sitter, ast-grep, entropy) | 2-6 threads |
| **NLP** | spaCy sidecar (linguistic_v1) | 2 concurrent |
| **GPU** | Embedding batch + Ornith synthesis | Batch first, 1 concurrent |
| **Cache** | Valkey MGET/MSET (128 key batches) | Hot metadata only |
| **Executor** | executeToolBatch(calls, maxParallel=3) | Read-only fork-join |

## Tasks (PF1-14)

**CORRECTION (2026-08-11, post-audit)**: PF0-PF3 are already implemented in
`sveltekit-frontend/src/lib/server/analysis/worker.ts` +
`sveltekit-frontend/src/lib/server/analysis/analysis-jobs.ts`. Verified live:
`claimBatch(jobType, limit)` uses `FOR UPDATE SKIP LOCKED` atomic claim,
`pollOnce()` computes `freeSlots = concurrency - activeCount - pendingCount`
per job type and claims the full batch (not 1-at-a-time), `pg_notify`/`LISTEN`
wake is wired (`ANALYSIS_JOBS_NOTIFY_CHANNEL`), `POLL_MS = 30_000` fallback
(not the assumed 3s), crash recovery (`resetStaleJobs(10)`) runs on startup,
and exponential backoff (2s→32s) handles DB errors. This is **more complete**
than the original spec assumed — do not re-implement.

**Real next gate is PF4** (durable pass-result ledger / idempotency). No
`AnalysisPassResult`-equivalent table exists; `analysis_jobs` only tracks
job lifecycle (queued/running/completed/failed), not per-pass output hashes
keyed by (packet_key, source_revision, pass_name, pass_revision, input_hash).
Without that ledger, PF9 (incremental eligibility) has nothing to join against.

Also note: `stageConfig` in worker.ts only wires 4 job types today
(`entity_extraction`, `code_feature_registry`, `forensics`, `summarization`) —
no `structural_v1`/`ast_grep_v1`/`linguistic_v1`/`semantic_768_v1`/`ornith_pattern_v1`
pass names exist yet. PF6/PF7/PF10/PF11 are greenfield, not refactors.

| # | Task | Depends | Est | Status |
|---|------|---------|-----|--------|
| PF0 | Audit current worker behavior | — | 30m | ✅ DONE (this audit) |
| PF1 | Implement claimBatch(jobType, freeSlots) | PF0 | 1h | ✅ DONE (pre-existing) |
| PF2 | Fill all free concurrency slots | PF1 | 30m | ✅ DONE (pre-existing) |
| PF3 | Add pg_notify/LISTEN wake | PF1 | 1h | ✅ DONE (pre-existing) |
| **PF4** | **Add AnalysisPassResult ledger** | PF3 | 1h | ⬜ NEXT — real work starts here |
| PF5 | Enforce idempotency uniqueness | PF4 | 30m |
| PF6 | CPU worker pool (2-6 threads) | PF5 | 1.5h |
| PF7 | Move structural passes to workers | PF6 | 1h |
| PF8 | Valkey batch cache contract | PF5 | 1h |
| PF9 | Incremental eligibility query | PF4 | 1h |
| PF10 | NLP pass DAG ordering | PF9 | 1h |
| PF11 | Bounded Ornith enrichment | PF10 | 1h |
| PF12 | executeToolBatch(maxParallel=3) | PF11 | 1.5h |
| PF13 | Real multi-hop graph expansion | PF12 | 1h |
| PF14 | Quarantine fake tricubic | PF13 | 30m |

**Total**: ~14h  
**Start**: PF1 (highest ROI)

## Validation Gates

- [ ] G1: claimBatch fills all 4 slots in one transaction
- [ ] G2: pollOnce latency drops from 3s to <100ms (pg_notify wakeup)
- [ ] G3: Corpus re-run skips 99%+ already-processed packets
- [ ] G4: CPU worker pool parallelizes tree-sitter (2-3 cores active)
- [ ] G5: Valkey no single-key GET/SET (all MGET/MSET, max 128 keys)
- [ ] G6: executeToolBatch respects 3-call parallel limit + DAG dependencies
- [ ] G7: End-to-end corpus throughput increases 2-4×

## Reference

- Session 197 spec: `memory/SESSION-197-PARENT-ATLAS-PASS-FABRIC-SPEC.md`
- Current worker: `src/lib/server/atlas/analysis-worker.ts`
- Analysis jobs table: `atlas_packets` + `analysis_jobs` schema
