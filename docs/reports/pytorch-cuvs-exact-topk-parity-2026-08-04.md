# PyTorch ↔ cuVS Exact Top-K Parity — PASS
**Status**: GATE PASS | **Date**: 2026-08-04 | **Session**: 188F | **JSON**: [pytorch-cuvs-exact-topk-parity-2026-08-04.json](pytorch-cuvs-exact-topk-parity-2026-08-04.json)

---

## TL;DR

First real GPU compute proof in this project's native-acceleration audit: `torch.mm`+`torch.topk` (CUDA, PyTorch 2.13+cu130) and `cuvs.neighbors.brute_force` (cuVS 26.06.00) agree **exactly** on 20 real 768-dim query vectors against a 2,000-vector real corpus pulled from `codebase_chunks_768_v2`. This is the "exact oracle" both lanes needed before any ANN benchmark (Qdrant HNSW recall, CAGRA) can be trusted.

## Fixture

Real vectors, not synthetic — 2,000 corpus + 20 query vectors, `content` named vector, 768-dim, exported read-only from live Qdrant via `scripts/atlas/export-vector-fixture.mjs`.

## Result

| Metric | Value | Gate |
|---|---|---|
| Mean top-10 overlap | **1.0** | ≥0.95 ✅ |
| Min top-10 overlap (worst query) | **1.0** | — |
| Rank-1 index match rate | **1.0** | ≥0.95 ✅ |
| Identity match via `qdrant_point_id` | **1.0** | — |
| Max top-1 score delta | **0.0** | <1e-3 ✅ |
| NaN/Inf queries | **0** | =0 ✅ |
| **RESULT** | **PASS** | |

Every one of the 20 queries returned identical top-10 index sets from both backends. Zero exceptions.

## Performance (informational, not the point of this proof)

| Backend | Elapsed |
|---|---|
| PyTorch (CUDA) | 1,290.83 ms |
| cuVS brute_force | 377.14 ms |

Not a fair apples-to-apples benchmark — PyTorch includes CUDA context/tensor-transfer warmup on first call in this script; cuVS build+search was measured after PyTorch had already warmed the GPU. Not re-measured with proper warmup since correctness, not speed, was the gate here.

## Environment

- WSL conda env `atlas-rapids-cu13`: PyTorch `2.13.0+cu130`, cuVS `26.06.00`, CuPy
- Conda resolved via absolute path `/home/james/miniforge3/bin/conda` (the non-interactive-shell probe that previously failed to find conda — fixed this session)
- 1 CUDA device visible (RTX 3060 Ti)

## What this unblocks

Per the ordered execution list: exact-oracle parity was the prerequisite for Qdrant ANN recall benchmarking and CAGRA benchmarking against the same ground truth. Both are now unblocked.

## What this does NOT prove

- Does not validate `atlas_knn_exact` (the C ABI wrapper spec'd in `parent-atlas-native-acceleration-cabi`) — this proof used cuVS's Python API directly, not the not-yet-built C ABI core.
- Does not benchmark at full corpus scale (52,380 rows) — bounded to 2,000 per the fixture-first proof discipline this session has followed throughout.
- Score delta of exactly 0.0 reflects both backends computing the same cosine formula on the same FP32 inputs — not a claim that cuVS and PyTorch are numerically identical on all hardware/precision combinations.
