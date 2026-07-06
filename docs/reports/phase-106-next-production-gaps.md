# Phase 106 Next Production Gaps

Generated: 2026-07-05

## Executive Summary

The Phase 106 semantic compiler and arbitration lanes are now wired and runnable on bounded slices.
Live validation shows:

- Go retrieval sidecar is reachable over HTTP and gRPC.
- TurboVec ANN pipeline is operational end-to-end.
- Rust parser and N-API exports are present and the msgpack chunker works on a bounded archive.
- TurboVec standalone sidecar smoke now passes on the same 8791 endpoint as the live pipeline validator.
- Fuse.js should remain lexical/UI fallback only; deep semantic ranking should stay on Qdrant + TurboVec + RRF + reranker.
- The summary-ranking retrieval pipeline successfully wrote 10 pgvector rows on a bounded stage-2 apply slice; Qdrant tagging remains gated by the bridge layer.
- The direct Qdrant payload bridge now succeeds on bounded apply slices (20/20 and 200/200 points updated from the chunk-index path).
- Semantic training export, Naive Bayes training, NB prediction, HMM routing, and topology-gap auditing all run on live schema slices.
- Shared semantic tuple extraction is now wired into lexical feature extraction, so title/domain/lexical tuple derivation uses one helper path.
- Bounded lexical apply slice updated 200 packets and pushed lexical coverage upward.

The remaining blockers are data coverage and bridge propagation, not core lane existence.

LOD / streaming contract:

- LOD is a progressive routing view over the packet spine, not a new identity layer.
- Use Postgres + topology labels for coarse zoom, then Qdrant/TurboVec for narrow candidate streams.
- The derived zoom levels are `domain_class -> feature_id -> community_id -> SOM cell -> packet neighborhood`.
- Streaming should emit bounded packet batches, not raw corpus dumps.

## Current State

### Created

- Semantic training exporter
- JSON Naive Bayes training model
- Naive Bayes prediction writer
- HMM-to-kanban routing bridge
- Topology completion audit

### Wired

- Qdrant + TurboVec + Postgres retrieval path
- Go retrieval HTTP + gRPC sidecar
- HMM validation against packet evidence
- Spec-driven kanban board contract

### Proven

- `go-retrieval-smoke.mjs` PASS
- `turbovec-pipeline-validation.mjs` PASS
- `turbovec-sidecar-smoke.mjs` PASS on 8791 after aligning the smoke endpoint with the live validator
- `verify-rust-napi-exports.mjs` PASS
- `test-rust-parser.mjs` PASS
- `Fuse.js` bypass recommendation: lexical-only fallback, not deep semantic routing
- `Fuse.js` bypass recommendation: lexical-only fallback, not deep semantic routing
- `export-semantic-training-rows.mjs --dry-run --limit=20` PASS
- `train-naive-bayes-packet-features.mjs --dry-run --limit=20` PASS
- `apply-naive-bayes-predictions.mjs --dry-run --limit=20` PASS
- `route-hmm-output-to-kanban.mjs --dry-run --limit=20` PASS
- `audit-topology-completion-gaps.mjs --dry-run --limit=20` PASS
- `validate-hmm-agentic-error.mjs` shows the error ontology is complete but coverage is weak
- `validate-som-20x20-topology.mjs` shows the live SOM contract is partial: 267/400 occupied cells and 2,674/58,365 assigned packets

## 0-100% Audit

### 1. Retrieval / Sidecar Layer: 97%

What is complete:

- Go retrieval smoke passes.
- Qdrant named-vector search passes.
- TurboVec ANN passes.
- Postgres truth join passes.

What is missing:

- More stable point-id bridging for durable payload mutation.
- Better join coverage in the sampled results.
- Make the router/smoke endpoint contract explicit so future probes do not drift again.
- Do not route deep semantic queries through Fuse.js; keep it for UI search fallback.
- The pgvector embed/write lane is proven on a bounded slice, but Qdrant tagging still needs the point-id bridge before it can keep up.
- The point-id bridge now works on a bounded slice; what remains is widening it and keeping the join deterministic at scale.

Fuse.js boundary:

- Use it for approximate string matching in UI and lexical fallback flows.
- Do not use it for deep semantic packet routing, ANN shortlist generation, or ACP repair selection.
- Keep semantic ranking on Qdrant, TurboVec, RRF, rerankers, HMM, and ACP.

### 2. Semantic Extraction Layer: 55%

What is complete:

- Lexical extraction lane exists.
- LangExtract lane exists.
- Semantic training export exists.
- Shared tuple helper now drives lexical token classes and ontology tuple derivation.

What is missing:

- `used_concepts` / semantic concept coverage is still sparse in live packets.
- Mixed accepted/rejected training archive is not yet fully populated in this checkout.

### 3. HMM / ACP Routing Layer: 65%

What is complete:

- HMM router script exists and runs.
- HMM state separation is now explicit.
- Naive Bayes is soft evidence only.

What is missing:

- Feature coverage is too low for strong HMM discrimination.
- The router still mostly falls back to generic repair lanes because semantic gaps dominate.

### 4. Topology / SOM Layer: 40%

What is complete:

- SOM validator exists.
- SOM assignments exist for a subset of packets.

What is missing:

- 20x20 population is not the real final shape yet.
- Adjacency edges are missing.
- Latent coverage is low relative to target.

### 5. Identity / Bridge Layer: 45%

What is complete:

- `packet_key`, `source_ref`, `feature_id`, `title_id` are present in the core compiler model.
- The board contract is explicit.

What is missing:

- `qdrant_point_id` bridge coverage is still incomplete.
- `tree_node_id` propagation is still incomplete.
- The identity-to-topology bridge is not fully universal.

## Live Validation Evidence

- Go retrieval: PASS
- TurboVec pipeline: PASS
- TurboVec sidecar smoke: PASS on 8791
- Rust parser / N-API exports: PASS
- Rust msgpack chunker: PASS on bounded archive
- Semantic export: PASS on 20-row slice
- NB training: PASS on 20-row slice
- NB application: PASS on 20-row slice
- HMM routing: PASS on 20-row slice
- Topology audit: PASS on 20-row slice, but exposes `qdrant_point_id` as the dominant gap

## Top Gaps

1. `qdrant_point_id` bridge coverage
2. `tree_node_id` propagation
3. `used_concepts` / semantic concept coverage
4. SOM adjacency and topology density
5. Rejected-envelope archive coverage for mixed training
6. Keep the TurboVec smoke host aligned with the live pipeline validator
7. Keep Fuse.js out of the deep semantic/routing path
8. Promote the Qdrant bridge after the pgvector path is stable on larger slices
9. Add the LOD/progressive-zoom view as a derived routing layer on top of the existing topology fields

## Next Safe Actions

1. Backfill `qdrant_point_id` deterministically and verify payload mutation by real point ID.
2. Promote `tree_node_id` through the envelope path.
3. Expand concept extraction coverage before relying on HMM for routing.
4. Add SOM adjacency / topology materialization.
5. Add rejected-envelope archive ingestion for classifier training.

## Status Conclusion

The implementation is no longer blocked by missing scripts. It is blocked by incomplete propagation across the canonical packet spine.
