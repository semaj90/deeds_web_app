## Why

Added 2026-09-16 — this change previously had no `proposal.md` (flagged by the
`parent-atlas-openspec-tasks-audit-fabric` audit). This file summarizes intent without changing
any status recorded in `tasks.md`.

This change executes a bounded, read-only live-graph + GPU-execution proof: build a frozen
candidate graph from admitted semantic reconciliation output, run cuVS exact semantic top-K,
PageRank, spectral balanced-cut, spectral modularity, Leiden, and Louvain over it, and profile the
exact same fixture with Nsight Systems/Compute for GPU execution evidence (Tensor Core usage
claims must be backed by non-zero Nsight Compute metrics, never by API-call presence or hardware
specs alone). No graph/clustering/profiler receipt in this proof authorizes source mutation — see
`tasks.md`'s "Authority rules" section for the full list of what each layer (PostgreSQL, derived
relationship views, `SEMANTIC_KNN` edges, spectral/Leiden/PageRank/KMeans/SOM outputs) is and is
not allowed to claim.

## ⚠️ Premise correction (2026-09-16) — read tasks.md's own banner before resuming

`tasks.md` carries a top-of-file correction banner (added 2026-09-16): this entire proof tranche
was built and iterated on `semantic_512` as "the current persisted exact semantic representation,"
a premise that was operator-reversed on 2026-08-23 (one day before this tranche's own last edit) in
favor of `semantic_768` as canonical, and never re-pointed. The graph-algorithm diagnostic findings
recorded in `tasks.md` (disconnected-graph root cause, near-degenerate-eigenspace mechanism,
Leiden resolution-collapse characterization) are likely algorithm-general but are **not proven to
transfer** to a 768-dim candidate set. Do not resume the `Operator sequence` in `tasks.md` as
literally written without first deciding whether to rebuild against `semantic_768` or explicitly
re-justify `semantic_512` as a deliberate derived lane for this specific proof.

## What Changes

See `tasks.md` for the full `LVG-0` through `LVG-15` task/finding sequence. This proposal
introduces no new task and does not resolve the semantic_512-vs-768 decision above.

## Capabilities

No new capability — this documents the existing bounded graph/GPU proof tranche already specified
in `tasks.md`.
