# Parent Atlas TORCH Feature Tensor — Tasks

## Scope

PyTorch/LibTorch own tensor/model computation only. They do not own canonical identity, graph truth, retrieval fusion, recommendation truth, or Kanban state.

The existing canonical query-time feature order remains `CANDIDATE_FEATURE_NAMES` from `feature-extraction-v1.ts`. TORCH-01 wraps that existing projection; it does not introduce a second feature schema.

## TORCH-01 — Feature tensor construction

* [x] Reuse the existing 25-column candidate feature order.
* [x] Preserve candidate packet keys as row identity.
* [x] Preserve explicit presence mask separately from numeric values.
* [x] Distinguish missing evidence (`null`/`undefined`) from invalid numeric evidence (`NaN`/`+Inf`/`-Inf`).
* [x] Reject non-finite values before PyTorch/LibTorch execution.
* [x] Freeze row-major contiguous Float32 + Uint8 mask layout.
* [x] Carry workspace, representation and feature revisions.
* [x] Checksum feature bytes, mask bytes and ordered row keys independently.
* [x] Mark tensor artifacts `evidenceAuthority=false` and `canonicalOwnerChanged=false`.
* [ ] Run focused Vitest proof on the workstation.
* [ ] Prove Python PyTorch and JS/LibTorch consume the same frozen bytes and row order.

Gate: `TORCH01_FEATURE_TENSOR_CONTRACT_PROVEN`

TORCH-01 MUST NOT silently replace invalid numeric values with zero. Zero is permitted as a storage value for a missing field only when the corresponding presence-mask entry is `0`.

## TORCH-02 — Batched classifier / reranker execution

Blocked on TORCH-01 proof.

* [ ] Define one execution manifest for PyTorch CPU, PyTorch CUDA, and LibTorch CUDA challengers.
* [ ] Require the same tensor artifact checksum and row-key checksum for parity comparisons.
* [ ] Keep model revision and executor revision separate.
* [ ] Compare outputs numerically within explicit tolerance; do not require cross-runtime bit identity.

## TORCH-03 — JS / Python / LibTorch parity

* [ ] Fixed fixture `[C,25]` tensor.
* [ ] Same feature-byte checksum in TS and Python before tensor construction.
* [ ] PyTorch `torch.from_numpy` / equivalent input shape and dtype proof.
* [ ] LibTorch bridge input shape and dtype proof.
* [ ] CPU ↔ CUDA numeric parity report.

## TORCH-04 — Pinned transfer benchmark

Performance-only. Does not alter correctness or representation identity.

* [ ] Benchmark ordinary CPU→CUDA transfer.
* [ ] Benchmark pinned-memory + non-blocking transfer only where the runtime supports it safely.
* [ ] Record p50/p95 latency and bytes transferred.
* [ ] Promote only if measured benefit is material.

## TORCH-05 — CUDA memory ownership

* [ ] Inventory PyTorch CUDA, LibTorch CUDA, cuVS/CAGRA and RAPIDS ownership.
* [ ] Require one resource/admission policy for the workstation GPU budget.
* [ ] Prevent tensor runtime selection from creating an additional retrieval lane vote.

## Explicit invariants

```text
Feature schema owner   = Parent Atlas contracts
Tensor artifact owner = Parent Atlas TORCH contract
PyTorch / LibTorch    = compute executors
Qdrant / pgvector     = vector stores/search executors
cuVS / CAGRA          = vector-search executors
Graphify / GIS        = structural/canonical owners
SearchRuntime         = fusion/rerank owner
```

Do not create a second FeatureEnvelope, second candidate feature ordering, second RRF vote, or new canonical identity from a tensor row number.
