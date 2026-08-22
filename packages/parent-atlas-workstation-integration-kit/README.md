# Parent Atlas Workstation Integration Kit

This kit converts the current PageRank + summaries + indexed-table state into explicit runtime contracts.

## What each helper does

- `packet-projection.ts`: selects a narrow packet projection instead of serializing the full `atlas_packets` row. Uses `packet_id` keyset pagination.
- `keyset-pager.ts`: page-at-a-time processing, monotonic cursor validation, durable checkpoints, and AbortSignal support.
- `representation-lineage.ts`: validates embedding identity, dimensions, runtime/fallback status, and computes a deterministic vector hash.
- `projection-parity.ts`: compares Postgres authority against Qdrant, Neo4j, Valkey, and ACE readbacks.
- `completeness-score.ts`: produces a weighted 0–100 Parent Atlas workstation score.
- `reranker-evaluation.ts`: evaluates NDCG@5 improvement and latency gates.
- `recommendation-trace.ts`: validates evidence-backed file/symbol recommendations and ranks affected files.
- `001_parent_atlas_integration_contract.sql`: adds typed lineage fields and separate representation/projection/graph-run ledgers.
- `002_parent_atlas_completeness_queries.sql`: identity, projection-coverage, row-size, and keyset-plan checks.

## Suggested integration order

1. Run the identity/duplicate audit before enforcing packet-key uniqueness.
2. Keep `packet_id` as the materializer cursor.
3. Replace whole-row `to_jsonb(t)` reads with `PACKET_PROJECTION_COLUMNS`.
4. Persist one page, then atomically persist its checkpoint.
5. Create one representation record for every accepted embedding.
6. Upsert projections, read them back, and compare parity against Postgres.
7. Store PageRank/community results with `graph_run_id` and `graph_revision`.
8. Run retrieval evaluation, then reranker evaluation.
9. Emit recommendations only when evidence and validation commands pass the recommendation contract.
10. After edits, re-index changed symbols and record supersession lineage.

## Score interpretation

- 0–44: Foundation
- 45–69: Integration
- 70–89: Operational beta
- 90–100: Production ready

The example assessment is approximately **55/100**, meaning the system has substantial components but still lacks a single proven production loop across embedding, projection parity, reranking, recommendation, editing, validation, and re-indexing.

## First completion milestone

Prove one vertical slice over 10 representative files:

- structural facts and summaries
- production EmbeddingGemma `semantic_768` embedding with representation identity
- Postgres representation record
- Qdrant upsert and readback
- Neo4j node/edge and PageRank revision
- Valkey cache readback
- hybrid retrieval and reranking
- one evidence-backed file/symbol recommendation
- validation commands and results
- changed-symbol re-index and supersession record
