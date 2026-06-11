# Phase 3D Retrieval Telemetry Summary

Generated: 2026-06-11T15:21:16.520Z

## Status

- classification: COLLECTING
- tableExists: true
- rows: 4
- realRows: 2
- smokeRows: 2
- targetRows: 1000
- missingColumns: none

## Retrieval Surfaces

- runtime/legal retrieval collection: legal_documents
- codebase/Atlas topology collection: codebase_chunks_768
- Phase 3D records behavior from retrieval calls; it does not patch Qdrant payloads or topology.
- Production readiness topology checks continue to use the codebase/Atlas collection.

## Metrics

- queryCount: 4
- realQueryCount: 2
- smokeQueryCount: 2
- uniqueQueries: 4
- meanLatencyMs: 13.75
- p50LatencyMs: 8
- p95LatencyMs: 33.65
- p99LatencyMs: 37.13
- cacheHitRatio: 0

## Next Actions

- continue collecting real retrieval records until realRows >= 1000
- smoke rows only prove insertion and do not count toward behavioral temperature
- do not automate cache policy from structural temperature alone
