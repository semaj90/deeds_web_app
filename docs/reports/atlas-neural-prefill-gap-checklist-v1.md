# Atlas Neural Prefill Gap Checklist

Status: read-only audit checklist, 2026-08-24.

## Current State

- CREATED/WIRED: EmbeddingGemma semantic_768 and MRL contract.
- PROVEN bounded: Graphify source resolution, AST-grep dry extraction,
  identity enrichment, OKF classification, packet aggregation.
- PROVEN contract-only: parameter/artifact lookup, QLoRA write boundary,
  low-rank nomination policy.
- BLOCKED: canonical symbol promotion, live CandidateFeatureMatrix ranking,
  MRL Recall/NDCG tournament, feature-row migration ownership, and complete
  graph/SOM/PageRank alignment.

## What To Look Up

1. **Service health**: Postgres 18/pgvector, Qdrant REST and gRPC, Valkey,
   and the local EmbeddingGemma endpoint. Include versions and failure causes.
2. **Identity**: declaration-like AST nomination counts versus active symbol
   registry matches. Variables and unresolved names must remain candidates.
3. **Feature rows**: the one active observation-feature schema, its primary
   key, vector dimensions, and any superseded migration names.
4. **Dense coverage**: canonical Postgres `semantic_768` count, Qdrant
   collection count, and source-reference overlap on one frozen sample.
5. **Graph features**: file PageRank, PPR/Leiden revision, SOM revision,
   and CandidateOrdinal checksum.
6. **Runtime budget**: free VRAM, host RAM, CPU worker cap, and explicit CUDA
   versus CPU fallback state.

## Safe Commands

Run from `C:\Users\james\Videos\deeds-web-app\sveltekit-frontend`:

```text
npm run atlas:graphify:neural-prefill:preflight
npm run atlas:features:ast-symbols:review:dry
npm run atlas:features:ast-symbols:resolve:dry
npm run atlas:neural:prefill:validate
```

The preflight writes only rebuildable `.tmp` artifacts and reports. It does
not invoke the daily Graphify chain, write Postgres/Qdrant/Valkey, promote
symbols, or start training.

## Next Promotion Gates

1. Resolve the active feature-row migration owner.
2. Review declaration-like symbol nominations; keep identity promotion
   behind an explicit bounded apply approval.
3. Freeze a CandidateOrdinal snapshot and run the 768 versus MRL benchmark.
4. Add graph/SOM/PageRank features only when their revisions and checksums
   join to that snapshot.
5. Produce a replayable ranking receipt before any ACE or QLoRA export.
