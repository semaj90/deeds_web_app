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

## 2026-08-27 gate update

Script-level proof is still required before copying the decoder contracts into
`packages/parent-atlas`:

- Preflight: `PASS` read-only, readiness `70%`.
- Shortlist: `EXECUTED_UNPROVEN`, Recall@24 `0.333`, labeled evaluation absent.
- Replay admission: `PROVEN` for the comparable corpus; 10,135 rows admitted
  by both policies, with zero mismatches.
- Cache namespace proof: `FAIL`, 2/5 required namespaces ready.
- Semantic cache audit: `PASS` structurally, but no live BitFrost/centroid/SOM
  keys observed.
- Canonical packet/source content-hash lineage: `BLOCKED`.
- Latest read-only census: 1 `IDENTITY_UNRESOLVED`, 60,998
  `MISSING_GRAPHIFY_SOURCE`, and 4,148 ambiguous packet/chunk joins; source
  integrity is proven for 768 observed Graphify rows, but canonical packet
  lineage remains blocked.
- Reference samples indicate a source-grain/scope mismatch: historical packet
  artifact names and `$lib` aliases are not equivalent to current Graphify
  workspace paths. A canonical resolver/bridge is required; fuzzy joins and
  mass revision stamping remain prohibited.
- The read-only resolver census reports 405 raw exact matches, 621
  basename-only diagnostic candidates, 2,665 ambiguous basename matches, and
  57,968 unresolved references. Only exact or independently content-proven
  mappings may enter a lineage-qualified candidate snapshot.
- Neural decoder training: `BLOCKED` until lineage and held-out ranking gates
  pass.

Promotion boundary:

`scripts/atlas` proof lanes → revision-qualified CandidateOrdinal → held-out
ranking → Valkey MISS/HIT replay → deterministic DAG-template replay →
`packages/parent-atlas` integration → decoder challenger.

The first DAG incubation fixture is now proven read-only through
`scripts/atlas/prove-frozen-dag-v1.mjs`: deterministic topology, reversed-input
checksum invariance, cycle rejection, topological generations, ready-set
derivation, execution replay, and mutation transitions through rollback. The
generation definition is `longest_dependency_distance_from_source`; the
current fixture checksum is
`2a74d304f27f0f98cc4e84548f645658bdf89d337faa6a5c2cf17a442d520584`. Temporal
ledger integration, live bounded replay, and neural DAG evaluation remain
unproven.

The existing Parent Atlas temporal ledger, runtime, and PostgreSQL repository
fixture suites passed 16/16 tests. This closes the fixture-level event replay
substrate gate while leaving live bounded replay, source lineage, ranking
quality, cache MISS/HIT, and decoder evaluation open.

The replay admission refresh is now `PROVEN` for the comparable corpus, with
10,135 rows admitted by both policies and zero manifest-only or scanner-only
rows. This closes admission-policy parity only; it is not evidence that the
neural decoder is ready for promotion.
