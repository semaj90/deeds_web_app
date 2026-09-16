## Why

Added 2026-09-16 — this change previously had no `proposal.md` (flagged by the
`parent-atlas-openspec-tasks-audit-fabric` audit). This file summarizes intent from `tasks.md`'s
own frozen-boundaries section without changing any task or status recorded there.

This is an **additive, non-authoritative** change (its own words) — it does not alter canonical
EmbeddingGemma ownership, Qdrant data, retrieval scoring, Graphify APPLY, or canonical identity. It
builds a query-routing classifier that predicts *stable logical retrieval needs* (never
infrastructure product names), using deterministic query/POS-like features as cheap planner inputs
(never linguistic evidence authority) and an EmbeddingGemma `classification_768` →
`classification_mrl_128` truncate+L2 representation for the classification task specifically. The
`LANE != EXECUTOR` boundary is central: Qdrant HNSW, pgvector, cuVS, CAGRA, Vamana, DiskANN, BM25,
miniCOIL, SPLADE, and rerankers are selected by deterministic capability policy *after*
classification — sparse executors (BM25/miniCOIL/SPLADE) feed one logical sparse contribution, never
independent vote inflation, and cross-encoders remain a separate joint task that dense MRL does not
replace without measured parity.

## What Changes

See `tasks.md` for the full NLP-0..N task sequence (inventorying existing classifier owners,
building the router). This proposal introduces no new task. `WRITTEN != WIRED != PROVEN` — per
`tasks.md`'s own status discipline, a checked box records what stage was reached, not a promotion
claim.

## Capabilities

No new capability — this documents the existing additive query-routing classifier work already
specified in `tasks.md`.
