# Parent Atlas OKF feature/recommendation spine — proof tasks

Status date: 2026-08-21

This change freezes the semantic-evidence -> feature -> recommendation/training
contract before adding or promoting another reranker. It is additive and
non-authoritative. It does not change SearchRuntime ranking, canonical identity,
PostgreSQL/Qdrant/Valkey contents, GPU scheduling, reranker selection, or model
weights. `WRITTEN != WIRED != PROVEN`.

## Ownership boundaries

- PostgreSQL remains canonical truth for promoted packet/source facts.
- Tree-sitter/GIS remain structural/canonical-identity owners.
- `DomainClassificationV1` remains the existing domain classification signal owner.
- `CANDIDATE_FEATURE_NAMES` remains the existing canonical 25-column query-candidate feature order.
- `AtlasRecommendationV1` remains the existing recommendation owner.
- Qdrant/pgvector/cuVS/CAGRA are retrieval/vector executors, not evidence owners.
- PyTorch/LibTorch/XGBoost/cross encoders are model/tensor executors, not identity owners.
- ACE decides residency policy; Valkey/BitFrost is ephemeral hot-state execution only.

## OKF-07 — independent revision model

- [x] Add `OkfRevisionSetV1` with separate `schemaRevision`, `taxonomyRevision`,
  `classifierRevision`, and `featureMappingRevision`.
- [x] Do not collapse independent changes into one opaque `okfRevision`.
- [ ] Run focused tests.

## OKF-08 — evidence-kind separation

- [x] Freeze `AST`, `LANGEXTRACT`, `CLASSIFIER`, `EXECUTION`, `HUMAN` as distinct
  evidence kinds.
- [x] Add `SemanticObservationV1` with producer/revision/evidence lineage.
- [x] Add binary `OntologyLinkedTupleV1`.
- [x] Add multi-member event/process `OntologyHyperedgeV1`.
- [ ] Prove runtime producers preserve these evidence kinds without coercion.

## OKF-FE-01 — candidate feature registry

- [x] Reuse the existing 25-column `CANDIDATE_FEATURE_NAMES` order.
- [x] Add one revisioned definition/compiler/evidence policy for every column.
- [x] Keep routing-only SOM/KMeans/Hilbert fields explicitly noncanonical.
- [x] Keep `execution_utility` sourced only from execution/human evidence.
- [ ] Bind each registry compiler ID to its actual runtime owner receipt.

## OKF-FE-02 — provenance-complete feature rows

- [x] Add `CanonicalFeatureRowV1` for reusable entity-level facts.
- [x] Add `RetrievalFeatureRowV1` for query-candidate facts.
- [x] Add deterministic compiler from existing candidate objects into all 25 cells.
- [x] Missing feature = value `0`, `present=false`, explicit absence evidence.
- [x] Present `NaN/+Inf/-Inf` = hard failure.
- [x] Present values must use an evidence kind allowed by the feature registry.
- [x] Add `SearchRuntimeShadowCaptureV1` + replay compiler that maps only
  evidence-backed SearchRuntime lane/revision signals and explicitly rejects
  degraded identity or representation-revision drift.
- [x] Do not reinterpret PageRank as `authority_norm`; leave unproven signals
  absent rather than double-count graph authority.
- [ ] Wire a live SearchRuntime observer only after replay fixtures pass; live
  ranking/order must remain unchanged.

## OKF-FE-03 — derived feature matrix

- [x] Add `DerivedFeatureMatrixV1` as an analytical/tensor view, not canonical truth.
- [x] Freeze `[C,25]`, row-major `Float32Array` + `Uint8Array` presence mask.
- [x] Preserve row canonical IDs, packet keys and deterministic ordinals.
- [x] Record per-cell evidence refs and matrix checksum.
- [x] Reject duplicate canonical IDs/packet keys and mixed feature/representation/mapping revisions.
- [x] Add offline/replayable SearchRuntime shadow corpus builder that emits
  Float32-LE matrix bytes, masks, row identities, evidence refs and checksums.
- [ ] Prove byte parity against the existing TORCH feature tensor artifact.
- [ ] Prove NumPy/PyTorch/LibTorch CPU/CUDA numerical parity over the same bytes.

## RERANK-TRAIN-01 — pair judgment training envelope

- [x] Add `AtlasPairJudgmentV1`.
- [x] Bind query/candidate canonical identity and revisions.
- [x] Capture lexical/dense/AST/graph/domain retrieval evidence.
- [x] Capture teacher reranker model/revision/score/rank when available.
- [x] Capture exact-promotion receipt and downstream execution/test/repair outcomes.
- [x] Allow reviewed human relevance grade and independent label revision.
- [x] Keep `trainingEligible` explicit and fail on contradictory block reasons.
- [x] Add SearchRuntime shadow pair-judgment seed generation; all replay seeds are
  forcibly `trainingEligible=false` until outcome enrichment.
- [x] Add `finalizeAtlasPairJudgmentV1`; teacher + exact-promotion + execution
  evidence must all be durable/receipt-backed before training eligibility.
- [x] Receipt-backed failed exact promotion/execution remains valid negative
  training evidence; success is not required for a labeled example.
- [x] Add `build-search-runtime-shadow-corpus.mts` to emit seed JSONL and matrix
  manifests without touching runtime ranking or canonical stores.
- [ ] Add enrichment loader joining actual Mixedbread teacher receipts, exact
  promotion receipts and execution/test/repair receipts to the seed corpus.
- [ ] Produce a non-toy revision-qualified corpus before training AtlasCrossEncoderV1.

## REC-01 — evidence-backed recommendation chain

- [x] Add `RelatedFileScoreV1` with typed reasons (`CALL_RELATED`,
  `PROCESS_RELATED`, `SEMANTIC_NEIGHBOR`, `IMPLEMENTS_FEATURE`, `TESTS_FEATURE`,
  `OBSERVED_SUCCESS`, `GRAPH_NEIGHBOR`).
- [x] Add `RecommendationEvidenceV1` with durable receipt/evidence refs.
- [x] Keep recommendation evidence non-authoritative and mutation-disabled.
- [x] Add adapter into the existing `AtlasRecommendationV1` owner.
- [x] Require validation and rollback plans before creating the recommendation signal.
- [ ] Add `KanbanTaskProjectionV1` only after durable recommendation receipt linkage is proven.

## ACE-01 — residency decision contract

- [x] Add `ACEPacketResidencyV1` with frequency/breadth/recency/reuse/cost/utility.
- [x] Keep stable `candidateOrdinal` separate from canonical packet identity.
- [x] Require revision-qualified BitFrost bucket keys.
- [x] Require bounded TTL for HOT residency.
- [x] Keep `streamEventAuthorized=false`, `valkeyWritesAllowed=false` by default.
- [ ] Implement shadow-only compiler from existing ACE/telemetry receipts.
- [ ] Prove bitmap ordinal snapshot identity before any Valkey bitmap warming.
- [ ] Add Valkey Stream warm/demote producer only after reviewed shadow receipts.

## GPU-LEASE-01 — shared admission contract

- [x] Add `GpuWorkLeaseV1` for `CUVS_SEARCH`, `CUVS_KMEANS`, `CUGRAPH_RANK`,
  and `CROSS_ENCODER`.
- [x] Lease records estimated VRAM, priority/deadline and revision lineage.
- [x] `computationOwnerChanged=false`; the lease never merges executor ownership.
- [ ] Bind to real VRAM telemetry after the current zero-memory instrumentation defect is resolved.
- [ ] Shadow-test contention between cuVS and cross-encoder work before enforcing leases.

## Explicitly deferred

- [ ] Live SearchRuntime shadow observer side effects; replay compiler comes first.
- [ ] Training/promoting an Atlas-owned cross encoder.
- [ ] Changing Mixedbread/MiniLM runtime ownership.
- [ ] Valkey bitmap writes or Stream events.
- [ ] PostgreSQL schema/index changes.
- [ ] Qdrant payload/index changes.
- [ ] CAGRA activation.
- [ ] Tang sampling influence on SearchRuntime.

## Validation commands

```bash
cd sveltekit-frontend
npx vitest run \
  src/lib/server/atlas/okf/okf-evidence-feature-v1.spec.ts \
  src/lib/server/atlas/okf/candidate-feature-registry-v1.spec.ts \
  src/lib/server/atlas/okf/retrieval-feature-row-compiler-v1.spec.ts \
  src/lib/server/atlas/okf/atlas-learning-recommendation-v1.spec.ts \
  src/lib/server/atlas/okf/recommendation-evidence-adapter-v1.spec.ts \
  src/lib/server/atlas/okf/search-runtime-shadow-v1.spec.ts \
  src/lib/server/atlas/okf/pair-judgment-finalizer-v1.spec.ts

npx tsx scripts/atlas/build-search-runtime-shadow-corpus.mts \
  --input=docs/reports/search-runtime-shadow-captures.jsonl \
  --output-dir=docs/reports/search-runtime-shadow-corpus
```

No canonical, PostgreSQL, Qdrant, Valkey, Graphify, model-weight, vector-index,
SearchRuntime ranking or GPU scheduler mutation is authorized by this change.
