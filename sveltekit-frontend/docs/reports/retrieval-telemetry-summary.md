# Phase 3D Retrieval Telemetry Summary

Generated: 2026-06-12T02:32:27.107Z

## Status

- classification: COLLECTING
- tableExists: true
- rows: 151
- realRows: 150
- smokeRows: 1
- targetRows: 1000
- missingColumns: none

## Retrieval Surfaces

- runtime/legal retrieval collection: legal_documents
- codebase/Atlas topology collection: codebase_chunks_768
- Phase 3D records behavior from retrieval calls; it does not patch Qdrant payloads or topology.
- Production readiness topology checks continue to use the codebase/Atlas collection.

## Metrics

- queryCount: 151
- realQueryCount: 150
- smokeQueryCount: 1
- uniqueQueries: 151
- meanLatencyMs: 151.48
- p50LatencyMs: 150
- p95LatencyMs: 243.5
- p99LatencyMs: 248.5
- cacheHitRatio: 0.1921

## Next Actions

- continue collecting real retrieval records until realRows >= 1000
- smoke rows only prove insertion and do not count toward behavioral temperature
- do not automate cache policy from structural temperature alone
