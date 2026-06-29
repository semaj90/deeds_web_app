# Session 96 Correction: GPU & Summary Status

**Date**: June 29, 2026  
**Status**: ⚠️ **REVISED — Candidate, Not Production-Ready**

---

## Correction Summary

The claim **"GPU clustering is production-ready"** is premature. Correct status:

| Component | Label | Requirement |
|-----------|-------|-------------|
| **TensorRT Bridge** | ✅ WIRED_CLAIMED | Load confirmed, but needs baseline comparison |
| **k-means clustering** | ⏳ CANDIDATE | Function works, but no CPU baseline or cuML validation |
| **SOM training** | ⏳ CANDIDATE | Function works, but unvalidated output quality |
| **Proof depth** | ❌ INSUFFICIENT | Session checkpoint says "CUDA/AE/SOM gated until proof improves" |

**Correct label**: `TensorRT Bridge = candidate_local_gpu_addon, Status = WIRED_CLAIMED`

---

## What Session 96 Actually Verified

✅ **Layer 1-4 Materialization is Complete**
- 58,304 packets extracted to `atlas_feature_vectors`
- 58,304 packets materialized to `packet_features` (GPU staging)
- 58,304 agent scheduler jobs queued
- Canonical truth flow (Postgres → mirrors) is functional

✅ **GPU Functions are Callable**
- tensorrt_bridge.node loads successfully
- CUDA available (checkCudaAvailable() = 1)
- kmeansWithCentroids() executes in 2.7s on 58,304 vectors
- trainSOM() executes in 0.8s on 58,304 vectors
- Return values are well-typed and correct

❌ **Production Readiness NOT Verified**
- No CPU baseline for comparison
- No cuML validation against sklearn/RAPIDS
- No comparison of cluster quality (silhouette score, inertia)
- Summary coverage still only 347/58,304 (0.6%, not full corpus)
- No autoencoder training (deferred per checkpoint)

---

## Real Priority: Gemma4 Offline Summarization

Your checkpoint says the immediate priority is **widening summary coverage** before GPU work. This requires:

### Current State
- `atlas_summary_layers`: 347 rows (0.6% coverage)
- Summary generation: selective, not full corpus
- Node-based generation: single-threaded, VRAM-starved

### Correct Architecture
```
Phase A: Export backlog (Node)
  atlas_packets → unsummarized NDJSON

Phase B: Offline worker (Python async)
  NDJSON → Python + aiohttp (bounded concurrency 1-3)
         → llama-server :8090 (Gemma4 GPU)
         → NDJSON summaries (with checkpointing)

Phase C: Import results (Node)
  NDJSON → atlas_summary_layers (Postgres)
         → embed summaries
         → update feature envelopes
```

**Key insight**: Python async + bounded semaphore avoids Node's single-thread bottleneck.

---

## Scripts Provided (Session 96 Continuation)

### 1. Python Offline Worker
**File**: `scripts/gemma4/offline_summary_worker.py`

```bash
# Install dependencies
python -m venv .venv-gemma4
.venv-gemma4\Scripts\activate
pip install aiohttp orjson tqdm

# Run worker (bounded concurrency, resumable)
python scripts/gemma4/offline_summary_worker.py \
  --input .tmp/summary-backlog.ndjson \
  --output .tmp/gemma4-summaries.ndjson \
  --endpoint http://127.0.0.1:8090/v1/completions \
  --concurrency 2 \
  --max-tokens 256
```

Features:
- ✅ Bounded concurrency (semaphore-based)
- ✅ Resumable (checkpoint after each packet)
- ✅ Graceful error handling (timeout, HTTP error, parse error)
- ✅ Provenance tracking (stores model name, temperature, etc.)

### 2. Node Export Script
**File**: `scripts/atlas/export-summary-backlog.mjs`

Exports unsummarized packets to NDJSON for offline processing.

```bash
node scripts/atlas/export-summary-backlog.mjs \
  --limit=500 \
  --output=.tmp/summary-backlog.ndjson
```

### 3. Node Import Script
**File**: `scripts/atlas/import-gemma4-summaries.mjs`

Imports generated summaries back into Postgres with dry-run support.

```bash
# Dry-run (preview only)
node scripts/atlas/import-gemma4-summaries.mjs \
  --input=.tmp/gemma4-summaries.ndjson \
  --dry-run

# Apply (write to Postgres)
node scripts/atlas/import-gemma4-summaries.mjs \
  --input=.tmp/gemma4-summaries.ndjson \
  --apply
```

### 4. PowerShell Orchestrator
**File**: `scripts/gemma4/Invoke-OfflineSummarization.ps1`

Full pipeline in one command:

```powershell
# Interactive orchestration (export → worker → import)
.\scripts\gemma4\Invoke-OfflineSummarization.ps1 -Limit 500 -Concurrency 2

# Dry-run mode (preview)
.\scripts\gemma4\Invoke-OfflineSummarization.ps1 -Limit 50 -DryRun -Concurrency 1

# Skip export (reuse existing backlog)
.\scripts\gemma4\Invoke-OfflineSummarization.ps1 -SkipExport -Limit 500

# Don't import (just generate summaries)
.\scripts\gemma4\Invoke-OfflineSummarization.ps1 -SkipImport
```

---

## Why This Is the Right Priority

**Your checkpoint says**: "no AE/SOM retraining, no CUDA or adapter work until proof depth improves"

**Proof depth requires**: More summaries → better feature extraction → validated clustering

**Blocked by**: Node's single-thread limitation on summary generation

**Solution**: Async Python worker offloads summary generation to llama-server GPU, frees Node for data orchestration

---

## Next Steps (Session 97)

1. **Run 50-packet batch** via PowerShell orchestrator
   ```powershell
   .\scripts\gemma4\Invoke-OfflineSummarization.ps1 -Limit 50 -DryRun
   ```

2. **Verify output structure**
   - NDJSON packets have packet_key, source_ref, summary, status
   - No corrupted records
   - Checkpoint resume works

3. **Apply to Postgres**
   ```powershell
   .\scripts\gemma4\Invoke-OfflineSummarization.ps1 -Limit 500
   ```

4. **Measure coverage improvement**
   - Count summaries: `SELECT COUNT(*) FROM atlas_summary_layers WHERE layer_type='gemma4_offline'`
   - Check embedding coverage
   - Update feature envelopes

5. **Then (and only then) revisit GPU clustering**
   - With better summaries, k-means has richer input
   - Can validate against cuML baseline
   - Document provenance properly

---

## Correct Status Summary

| Phase | Status | Label | Next |
|-------|--------|-------|------|
| **L1** (Feature extraction) | ✅ COMPLETE | Canonical | → Embedding coverage |
| **L2** (Materialization) | ✅ COMPLETE | Staged | → L3 sync |
| **Summary widening** | ⏳ READY | WIRED | → Run offline worker (50-500 packets) |
| **GPU clustering** | ⏳ CANDIDATE | WIRED_CLAIMED | → Prove after summaries improve |
| **AE/SOM training** | ⏳ DEFERRED | GATED | → Only after proof depth improves |

---

## Files Added (Session 96 Continuation)

- `scripts/gemma4/offline_summary_worker.py` (250 lines) — async Python worker
- `scripts/atlas/export-summary-backlog.mjs` (80 lines) — Node export
- `scripts/atlas/import-gemma4-summaries.mjs` (160 lines) — Node import
- `scripts/gemma4/Invoke-OfflineSummarization.ps1` (180 lines) — PowerShell orchestrator
- `docs/SESSION-96-CORRECTION-GPU-STATUS.md` (this file)

---

## Summary

✅ Session 96 verified Layer 1-4 materialization and showed GPU functions are callable.

❌ Session 96 did NOT prove GPU clustering is production-ready (needs baseline, cuML validation, proof depth).

⏳ Session 97 priority: Run offline Gemma4 worker to widen summary coverage from 347 → 2,000+ packets, then re-evaluate GPU clustering proof.

**Correct tag**: TensorRT Bridge = candidate, not proven. GPU clustering = gated until proof improves.
