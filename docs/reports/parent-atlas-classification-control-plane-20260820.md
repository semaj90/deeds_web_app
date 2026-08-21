# Parent Atlas classification control-plane integration — 2026-08-20

Status: **IMPLEMENTED_UNPROVEN**

## Scope

This tranche integrates classification into existing Parent Atlas owners without creating a new retrieval lane, changing canonical identity, or replacing the current CrossEncoder/HMM implementations.

### Added

- `atlas.classification-observation.v1`
- EmbeddingGemma MRL classifier policy (`768 -> 512/256/128` derived in memory; no new Qdrant lane)
- deterministic structural code-role classifier
- classifier-to-existing-candidate-feature compiler
- classifier-to-existing-HMM sequence bridge
- ambiguity-gated CrossEncoder escalation using the existing `rerankWithMarco()` endpoint
- `atlas.classification-control-plane.v1` orchestrator
- EmbeddingGemma intent/domain challenger manifest; current MiniLM default remains unchanged
- focused contract tests

## Authority rules

- classification observations are evidence only
- `canonicalWritesAllowed=false`
- `retrievalVoteAdded=false`
- structural classifier cannot mint canonical IDs
- MRL prefixes are ephemeral classifier features in this tranche
- semantic_768 remains the canonical dense retrieval representation
- CrossEncoder remains a pairwise second-stage scorer
- HMM/Viterbi remains the existing sequence-model owner

## Existing owners reused

- candidate matrix: `retrieval-candidate-feature-matrix-v1.ts` (fixed 25 columns)
- CrossEncoder transport: `search/marco-reranker.ts`
- HMM/Viterbi: `analysis/hmm-error-classifier.ts`, `analysis/sequence-model-contract.ts`, `analysis/model-analysis-service.ts`
- canonical semantic representation: `embedding/embedding-contract-768.ts`

Detailed classification distributions are *not* appended as dozens of new matrix columns. The compiler maps bounded signals into the existing fields:

- `domain_fit_query`
- `process_fit`
- `feature_label_confidence`

Entropy, abstention, labels, model revision and evidence references remain in `ClassificationObservationV1` receipts.

## MRL policy

`semantic_768` remains canonical for retrieval. For classification only, a proven 768 vector may be truncated and re-normalized in memory at 128, 256, 512, then 768 according to confidence/margin thresholds. These derived vectors are not persisted or indexed by this tranche.

## CrossEncoder policy

Only candidates whose classifier evidence is ambiguous/abstained/high-entropy are escalated. Reranker failure is fail-open and preserves base ordering/scores. The reranker does not create another RRF vote.

## HMM policy

Classifier labels become weighted sequence observations, e.g. `error_type:stale_cache`. The bridge does not alter HMM transition/emission matrices and does not train the HMM. Baum-Welch/model promotion remains a separate proof.

## Proof state

- contracts: WRITTEN
- app integration modules: WIRED_AS_CALLABLE_CONTROL_PLANE
- unit tests: WRITTEN_NOT_EXECUTED_BY_CONNECTOR
- live EmbeddingGemma classifier head/prototypes: NOT_PROVEN
- CrossEncoder live escalation: NOT_PROVEN
- HMM end-to-end classifier observation consumption: NOT_PROVEN
- canonical owner changes: NONE
- Postgres/Qdrant/Valkey/Neo4j writes: NONE

## Workstation proof

From `sveltekit-frontend`:

```powershell
npx vitest run --config vitest.lane-contracts.config.ts `
  src/lib/server/atlas/classification/classification-control-plane-v1.spec.ts `
  src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.spec.ts
```

Then run the existing HMM smoke separately:

```powershell
node ..\scripts\atlas\smoke-hmm-error.mjs
```

A later classifier fixture should compare MiniLM intent baseline against EmbeddingGemma MRL 128/256/512/768 on the same frozen labels before changing `DEFAULT_INTENT_ENCODER_MANIFEST`.
