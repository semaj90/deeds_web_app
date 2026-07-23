# Native GEMM / pybind11 Deferral

Date: 2026-06-12

## Decision

Native `torch::mm()` / pybind11 / custom CUDA extension is deferred.

The current bottleneck is retrieval signal quality, not matrix multiply speed.

## Why it is deferred

- BM25 signal still needs to stay strong
- Concept lane still needs to stay stable
- XGBoost reranker still needs formal activation

## Revisit only after

1. BM25 + concept lane is stable
2. XGBoost reranker is active
3. Retrieval quality is still bottlenecked after the above

## Scope

This note is only a deferral boundary.
It is not a hardware optimization plan and not a replacement for the retrieval roadmap.
