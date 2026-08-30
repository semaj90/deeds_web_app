# Tasks — Parent Atlas Repair Candidate Feature Matrix

## RF-01 Contract

- [x] Reuse `RetrievalCandidateFeatureMatrixV1` as the only query-time base-matrix owner.
- [x] Add `RepairCandidateFeatureMatrixV1` as a tournament-only overlay; first 25 columns preserve the base plane.
- [x] Bind rows to `CandidateOrdinal + candidateSnapshotRevision + ordinalMapChecksum`.
- [x] Preserve the repository's opaque `candidateSnapshotRevision` token exactly; do not force it into a synthetic digest form.
- [x] Accept existing ordinal-map checksum encodings (`sha256:<64hex>` and bare `<64hex>`) while retaining the original value in receipts.
- [x] Add explicit per-feature states: `PROVEN | DERIVED | PARTIAL | UNAVAILABLE`.
- [x] Fail closed on duplicate/out-of-range ordinals, packet-key drift, non-finite values, invalid presence masks, and illegal state/coverage combinations.
- [x] Keep `canonicalAuthority=false`, `retrievalVote=false`, `rankingPromotion=false`, `mutationAuthority=false`.

## RF-02 Repair feature namespace

- [x] Add MRL query-similarity challenger columns.
- [x] Add nested latent query-similarity columns without implying a live query encoder.
- [x] Add lexical/BM25 repair signals.
- [x] Add AST/compiler/error/test repair signals.
- [x] Add graph/PPR repair signals.
- [x] Add SOM/topology/manifold/Tang-style challenger columns.
- [x] Keep unavailable features absent rather than synthesizing values.

## RF-03 Proofs

- [x] Add focused Vitest coverage for base-plane preservation, deterministic receipts, CandidateOrdinal alignment, presence-state semantics, and non-finite rejection.
- [x] Add tests for the live opaque CandidateSnapshotRevision token and bare ordinal-map checksum encoding.
- [x] Add producer-artifact tamper tests and MRL derivation/representation fail-closed tests.
- [x] Add persisted/untrusted producer tests: missing carried artifacts/rows fail with coded errors rather than generic runtime exceptions.
- [x] Accept existing bare or `sha256:` row-level input checksums while keeping generated artifact/output/set receipts strictly `sha256:` prefixed.
- [x] Add `scripts/atlas/prove-current-repair-candidate-feature-matrix-v1.mts` against the existing frozen CandidateOrdinal/base-matrix artifacts.
- [x] Fix the proof harness to accept the real frozen cohort's snapshot/checksum serialization without rewriting either coordinate.
- [ ] Run focused Vitest on the workstation.
- [ ] Run the current-cohort proof harness on the workstation and commit the resulting report only if the checked-in base manifest still matches.

## RF-04 Tournament producer admission

- [x] Add `RepairFeatureProducerArtifactV1`: one feature, exact candidate snapshot/map, producer + derivation metadata, row/output/artifact checksums, and explicit presence state.
- [x] Add runtime derivation guards: MRL columns require `MRL_PREFIX_L2_RENORMALIZE` over `semantic_768`; latent query-similarity columns require `NESTED_AUTOENCODER_QUERY_PROJECTION` over `semantic_768`.
- [x] Add `RepairFeatureProducerSetV1` and make it carry the full immutable producer artifacts, not summaries alone.
- [x] Rebuild and verify producer summaries, overlay rows, states, and set checksum from the carried artifacts at bundle/presence admission boundaries.
- [x] Add explicit runtime shape guards for persisted producer artifacts/sets before dereferencing arrays or state maps.
- [x] Add `RepairCandidateFeatureBundleV1` binding the verified producer set checksum to the populated repair-matrix manifest checksum.
- [x] Add `RepairMrlFeatureProducerV1` as the first executable derived producer contract: semantic_768 query/candidates -> prefix 512/256/128 -> L2 renormalize -> cosine scalar artifacts. This is fixture/contract capability only until real same-snapshot vector bytes are supplied.
- [ ] Choose one live already-revisioned repair feature producer and join it to the same frozen candidate snapshot.
- [ ] Require exact live identity/revision coverage and feature-state receipt before changing that feature from `UNAVAILABLE` in a workstation proof.
- [ ] Run a held-out baseline-vs-feature tournament with identical candidate universe.
- [ ] Only after measured lift decide whether broad materialization/backfill is justified.

## RF-05 ContextManifest presence bridge

- [x] Add revision-qualified repair presence evidence that can be safely overlaid onto `ContextManifest.feature_presence`.
- [x] Keep representation hydration separate from query-conditioned similarity: latent_256 candidate hydration may prove `latent256`, but never `latent256QuerySimilarity`.
- [x] Map MRL/latent query-similarity availability only from a verified repair producer set.
- [x] Reverify the full producer artifacts before propagating producer-set states into ContextManifest presence evidence.
- [x] Add focused presence-evidence tests for conservative defaults, verified MRL `DERIVED` propagation, snapshot mismatch rejection, and carried-artifact tamper rejection.
- [ ] Run the presence-evidence focused tests/workstation replay with the same candidate snapshot used by the repair matrix.

### Recommended live producer order

1. Existing revision-bound lexical/BM25 scalar, if an exact same-snapshot producer is available.
2. EmbeddingGemma MRL query similarities once exact query + candidate semantic_768 vector bytes for one frozen evaluation query are available; no retraining or broad backfill is required.
3. Existing graph/PPR scalar once graph revision ownership matches the candidate snapshot.
4. Nested latent query similarity only after the query encoder is proven for the exact candidate checkpoint.
5. AST/compiler/SOM/topology features only after their producer coverage/revision gates close.

The ordering deliberately avoids using a broad backfill to manufacture tournament density. Missingness is part of the measurement surface, and an implemented producer contract is not a live producer proof.
