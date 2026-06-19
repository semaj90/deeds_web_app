# HyperRAG Timing Coverage Audit

- Generated: 2026-06-19T22:27:59.739Z
- Status: READY
- Rows: 524
- Distinct query hashes: 15
- Cache-hit rows: 405
- p50 total: 2 ms
- p95 total: 41 ms

## Field Coverage

- qdrant: 524/524 (100%)
- bm25: 524/524 (100%)
- redis: 524/524 (100%)
- neo4j: 524/524 (100%)
- rerank: 524/524 (100%)
- total: 524/524 (100%)
- route: 1/524 (0.19%)
- result_count: 1/524 (0.19%)

The packet RPC owns one detailed eval row per query. The generic recorder still
owns behavioral telemetry in `retrieval_telemetry`.
