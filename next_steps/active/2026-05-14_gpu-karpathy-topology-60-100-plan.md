# GPU Karpathy Topology Plan (60% → 100%)

> Captured 2026-05-14 from the current GPU / topology / Karpathy notes.

## Current State

- Docs/index plumbing is complete.
- The GPU Karpathy lane is still the part that needs real work.
- Current practical status: about 60%.

## What is missing

### Data prerequisites
- `npm run graphify:semantic`
- A fresh `codebase_chunks_768` population
- Stable dense + sparse vectors for Karpathy scoring

### Model quality
- `npm run ae:train`
- Better 768→64 autoencoder weights
- Post-train persistence in Redis and reuse in the Karpathy scoring pass

### Scoring + routing
- `npm run karpathy:gpu`
- `npm run karpathy:ace:hits`
- Router integration for `extractSignal()` + `router.route()`
- `QueryRouter4x4` persistence and adaptation

### Validation
- `npm run smoke:hyperrag`
- `npm run graphify:full`
- A clean pass on the existing GPU/topology smoke gates

## Fix ideas

- Make semantic indexing the hard gate before any GPU lane tuning.
- Treat autoencoder quality as a real model problem, not just a script problem.
- Persist routing weights so the lane learns from hits instead of staying static.
- Audit "ghost" files that score high but are never retrieved.
- Keep `web_search` as a first-class lane so GPU retrieval can compare against it.
- Re-run the full graphify pipeline only after the lower layers are green.

## Plan

### 60% → 75%
- Rebuild semantic data.
- Train the autoencoder.
- Confirm Karpathy score generation is using trained weights.

### 75% → 90%
- Wire the router into context assembly.
- Add adaptation from retrieval hits.
- Persist the 4x4 matrix in Redis.

### 90% → 100%
- Run `karpathy:ace:hits` and fix ghosts.
- Re-run `smoke:hyperrag`.
- Finish with `graphify:full` and verify topology output stays stable.

## Notes

Postgres remains truth, Qdrant remains dense retrieval, and Neo4j remains graph topology. This plan is only about finishing the GPU/Karpathy lane that sits on top of those stores.
