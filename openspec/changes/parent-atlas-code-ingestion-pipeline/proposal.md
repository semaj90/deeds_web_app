## Why

Added 2026-09-16 — this change previously had no `proposal.md` (flagged by the
`parent-atlas-openspec-tasks-audit-fabric` audit). This file summarizes intent from `tasks.md`'s
own frozen-architecture and hard-rules sections without changing any task or status recorded there.

This change freezes (2026-08-12) the code ingestion pipeline: source code → Tree-sitter (structural
truth) + chunker → `StructuralChunkV1` (chunk boundary, not identity) → GIS enrichment
(`parse_node_id`/`symbol_id`/`symbol_version_id`/`chunk_id`/`packet_key`) → semantic card compiler
(EmbeddingGemma → canonical `semantic_768`; Jina `embeddings-v2-base-code` → experimental
`jina_code_768` second dense lane; BM25 → sparse `lexical_bm25`) → AST graph facts → Qdrant → the
one canonical Parent Atlas RRF fusion owner (never Qdrant's internal RRF, never a second fusion
owner) → Mixedbread reranker (top-50 → top-10, fail-open) → `FeatureRow` → bounded ACE packet →
Ornith 9B (synthesis/enrichment only — never scans the corpus directly). A parallel docs/logs/
research lane reuses the same downstream machinery via LangExtract instead of Tree-sitter.

Hard rules established here (do not violate elsewhere): EmbeddingGemma is the sole canonical
`semantic_768` owner; Jina's `jina_code_768` is a separate learned space, never directly
cosine-compared against EmbeddingGemma vectors; MiniLM-L6-v2 (384d) is demoted to an optional cheap
prefilter, never reinterpreted as `semantic_768`; sparse models (SPLADE/miniCOIL/BM25/BM42) need
their own contract and remain audit/benchmark-only until a real implementation exists; FastEmbed is
an optional ONNX toolbox, not a canonical runtime or store replacement.

## What Changes

See `tasks.md` for the full GPH-01 through GPH-22 task sequence and current per-task proof status.
This proposal introduces no new task.

## Capabilities

No new capability — this documents the existing chunking→embedding→rerank→synthesis pipeline
already specified in `tasks.md`.
