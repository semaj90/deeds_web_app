# Tasks — Parent Atlas Repair Candidate Feature Matrix

## RF-01 Contract

- [x] Reuse `RetrievalCandidateFeatureMatrixV1` as the only query-time base-matrix owner.
- [x] Add `RepairCandidateFeatureMatrixV1` as a tournament-only overlay; first 25 columns preserve the base plane.
- [x] Bind rows to `CandidateOrdinal + candidateSnapshotRevision + ordinalMapChecksum`.
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
- [x] Add `scripts/atlas/prove-current-repair-candidate-feature-matrix-v1.mts` against the existing frozen CandidateOrdinal/base-matrix artifacts.
- [ ] Run focused Vitest on the workstation.
- [ ] Run the current-cohort proof harness on the workstation and commit the resulting report only if the checked-in base manifest still matches.

## RF-04 Tournament producer admission

- [ ] Choose one already-revisioned repair feature producer and join it to the same frozen candidate snapshot.
- [ ] Require exact identity/revision coverage and feature-state receipt before changing that feature from `UNAVAILABLE`.
- [ ] Run a held-out baseline-vs-feature tournament with identical candidate universe.
- [ ] Only after measured lift decide whether broad materialization/backfill is justified.

### Recommended first producer order

1. Existing revision-bound lexical/BM25 scalar, if an exact same-snapshot producer is available.
2. Existing graph/PPR scalar once graph revision ownership matches the candidate snapshot.
3. EmbeddingGemma MRL query similarities (derived from semantic_768 with exact revision + L2 renormalization).
4. Nested latent query similarity only after the query encoder is proven for the exact candidate checkpoint.
5. AST/compiler/SOM/topology features only after their producer coverage/revision gates close.

The ordering deliberately avoids using a broad backfill to manufacture tournament density. Missingness is part of the measurement surface.
