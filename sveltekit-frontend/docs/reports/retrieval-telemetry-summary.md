# Phase 3D Retrieval Telemetry Summary

Generated: 2026-06-19T22:22:33.134Z

## Status

- classification: COLLECTING
- tableExists: true
- rows: 306
- realRows: 305
- smokeRows: 1
- targetRows: 1000
- missingColumns: none

## Retrieval Surfaces

- runtime/legal retrieval collection: legal_documents
- codebase/Atlas topology collection: codebase_chunks_768
- Phase 3D records behavior from retrieval calls; it does not patch Qdrant payloads or topology.
- Production readiness topology checks continue to use the codebase/Atlas collection.

## Metrics

- queryCount: 306
- realQueryCount: 305
- smokeQueryCount: 1
- uniqueQueries: 227
- meanLatencyMs: 1776.17
- p50LatencyMs: 215
- p95LatencyMs: 4244.5
- p99LatencyMs: 31612.65
- cacheHitRatio: 0.0948

## Next Actions

- continue collecting real retrieval records until realRows >= 1000
- smoke rows only prove insertion and do not count toward behavioral temperature
- do not automate cache policy from structural temperature alone
