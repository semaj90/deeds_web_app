# Semantic TopK Rerank Storage Contract

This note pins the storage split for semantic topK analysis and rerank evidence.

## Canonical split

- `atlas_packets`
  - canonical packet identity
  - stable provenance and join keys
  - no derived rerank history

- `atlas_packet_features`
  - extracted evidence
  - AST facts, lexical facts, LangExtract concepts, entities
  - candidate-facing metadata only

- `atlas_packet_metrics`
  - derived math
  - latent vectors, clustering, topology, graph metrics
  - rerank-adjacent scores when they are computed from model/math layers

- `chunk_hit_log.rerank_breakdown`
  - per-query rerank evidence
  - current sink for topK candidate analysis, scoring traces, and observability

## Rules

1. Keep identity in Postgres.
2. Keep rerank evidence append-only.
3. Keep candidate ranking separate from canonical packet identity.
4. Promote a derived field into the envelope only when a validator and a backfill path exist.

## Wired path

The repo now has a durable feature-level projection for semantic topK analysis:

- `scripts/atlas/refresh-semantic-fanout-topk.mjs`
  - reads the top-k fanout report
  - persists the durable projection into `atlas_packet_metrics.semantic_topk_*`
  - keeps per-query evidence available in `chunk_hit_log.rerank_breakdown` and the search analytics tables

The contract remains:

1. Keep identity in `atlas_packets`.
2. Keep per-query evidence append-only in observability tables.
3. Keep durable topK projections in `atlas_packet_metrics.semantic_topk_*`.
4. Promote a field into identity only if there is a backfill path and validator.
