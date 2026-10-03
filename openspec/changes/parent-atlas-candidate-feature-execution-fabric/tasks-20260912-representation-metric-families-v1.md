# Temporal addendum — Representation metric families and revision-safe bindings (2026-09-12)

This addendum is append-only. It does not rewrite prior Candidate Feature Execution Fabric evidence.

## Scope

This tranche does **not** advance the live RichChunk authority gate. It wires representation geometry and metric-family contracts so later live CandidateFeatureMatrix work cannot conflate incompatible spaces.

## Implemented

- [x] Added `CandidateRepresentationBindingV2` under the existing candidate-feature owner.
  - `semantic_768` remains canonical dense semantic representation.
  - `semantic_mrl_512`, `semantic_mrl_256`, `semantic_mrl_128` require `MRL_PREFIX_L2_RENORMALIZE` from the same admitted `semantic_768` representation revision.
  - `latent_256` requires the learned autoencoder projection from `semantic_768`.
  - `latent_128` derives from `latent_256` by `NESTED_PREFIX_L2_RENORMALIZE`.
  - `latent_64` derives from `latent_128` by `NESTED_PREFIX_L2_RENORMALIZE`.
  - Derived bindings require both source-representation revision and projection revision; they cannot fabricate lineage.
  - V1 remains historical compatibility evidence and is not rewritten.

- [x] Added `RetrievalMetricFamilyV1`.
  - `DENSE_CONTINUOUS` → COSINE / DOT / EUCLIDEAN_L2.
  - `BINARY_FINGERPRINT` → HAMMING.
  - `SPARSE_SET` → JACCARD.
  - `SPARSE_WEIGHTED` → WEIGHTED_JACCARD / SPARSE_COSINE.
  - `GRAPH_TOPOLOGY` → GRAPH_DISTANCE / PPR / SOM_GRID_DISTANCE.
  - Dense evidence requires explicit normalized=true.
  - Hamming/Jaccard cannot be silently applied to semantic_768.
  - Distance-valued metrics are not silently converted to feature similarities without an explicit calibration revision.

- [x] Added `CandidateMetricEvidenceV1` as an ephemeral CandidateOrdinal-keyed envelope.
  - Carries canonicalId + workspace/source revisions + representation revision + evidence refs.
  - Raw metric values remain typed by family/metric.
  - Optional calibrated similarity must carry a calibration revision.
  - This is evidence input only; it does not create a new CandidateFeatureMatrix owner and does not alter RRF voting.

## Existing owners reused

- MRL implementation: `sveltekit-frontend/src/lib/server/embedding/embedding-contract-768.ts`.
- Representation registry: `packages/semantic-contracts/src/vector-manifest.ts`.
- Candidate feature matrix owner: `sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.ts`.
- Candidate ordinal identity owner: existing CanonicalCandidate/CandidateOrdinalMap contract.

## Explicit non-goals / stop boundaries

- No RichChunk materialization.
- No semantic vector generation.
- No Postgres, Qdrant, Neo4j, Valkey, or Graphify writes.
- No new ANN collection/index.
- No CandidateFeatureMatrix column expansion yet.
- No Hamming/Jaccard signal is admitted into ranking until a bounded calibration/evaluation receipt binds it to the same current CandidateOrdinalMap and revision cohort.
- No change to `combineViaRRF()` or the one-semantic-logical-vote invariant.

## Validation pending workstation execution

Run focused tests before claiming proof:

```powershell
npx vitest run --config vitest.lane-contracts.config.ts `
  src/lib/server/atlas/features/candidate-representation-binding-v2.spec.ts `
  src/lib/server/atlas/features/retrieval-metric-family-v1.spec.ts `
  src/lib/server/atlas/features/candidate-metric-evidence-v1.spec.ts `
  src/lib/server/embedding/embedding-contract-768.spec.ts
```

Then strict-validate the existing owner:

```powershell
npx openspec validate parent-atlas-candidate-feature-execution-fabric --type change --strict --json
```

## Next gate

Do not add these metric families to live ranking yet. First close the current authority spine (`PROMOTION-RECEIPT-COHORT-01` + `SEMANTIC-768-PHYSICAL-OWNER-01`). After that, RichChunk/semantic corpus work can expose the admitted `representationBindings`, and this metric envelope can feed the existing CandidateFeatureMatrix only through an explicitly revision-qualified calibration/evaluation step.
