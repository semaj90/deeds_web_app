# Proposal — Parent Atlas Repair Candidate Feature Matrix

## Status

IMPLEMENTED_UNPROVEN / TOURNAMENT_ONLY / NO_PRODUCTION_WIRING

## Problem

Parent Atlas already owns query-time candidate assembly through
`RetrievalCandidateFeatureMatrixV1`, a `[C,25]` float32 matrix plus an explicit
presence mask. The repair/tournament spec, however, names additional diagnostic
and challenger features that do not belong in that production owner until they
have revision-qualified producers and held-out evidence.

Creating a second competing query-time matrix would violate the ownership
boundary. Leaving the repair matrix implicit makes tournament comparisons and
missing-feature semantics ambiguous.

## Decision

Add `RepairCandidateFeatureMatrixV1` as an evaluation-only composition:

```text
CandidateOrdinalMap / frozen candidate snapshot
              +
RetrievalCandidateFeatureMatrixV1 [C,25]   existing owner, unchanged
              +
revision-bound repair/tournament features  additive overlay
              |
              v
RepairCandidateFeatureMatrixV1 [C,49]
              |
              v
offline tournament / ablation only
```

The first 25 columns are copied from the existing owner without reinterpretation.
The 24 appended columns are explicitly repair/tournament-only.

## Identity and lineage

Every row is bound by:

- `candidateOrdinal`
- `candidateSnapshotRevision`
- `ordinalMapChecksum`
- `packetKey`
- `sourceRef`
- available source/workspace/symbol/graph/semantic revisions
- per-row feature checksum

The current v1 proof requires dense ordinal rows `0..N-1`; row-local ordinal
renumbering is forbidden.

## Presence semantics

Every repair overlay feature has one state:

```text
PROVEN       complete scalar coverage from a proven producer
DERIVED      complete scalar coverage from a revisioned derived representation
PARTIAL      some but not all frozen candidates have a value
UNAVAILABLE  no scalar is available; values must not be fabricated
```

Values absent from a row are encoded as `0` only when the corresponding
presence bit is `0`. For an `UNAVAILABLE` feature, every presence bit must be
zero. `PROVEN` and `DERIVED` require complete row coverage. `PARTIAL` must be
genuinely partial rather than a euphemism for absent or complete.

## Representation boundary

`semantic_mrl_512/256/128` query similarity can be `DERIVED` only when query
and candidate vectors share the exact EmbeddingGemma semantic_768 revision and
the MRL prefix is L2-renormalized.

`latent_256/128/64` query similarity stays `UNAVAILABLE` until the query is
encoded through the same nested-autoencoder revision as the candidate.
Candidate-only latent hydration does not make a cross-space similarity valid.

`topology_ae64_v1`, SOM, manifold, PageRank/PPR, and Tang-style nomination
remain derived challenger features. They never create identity, canonical graph
truth, or an extra retrieval vote.

## Non-goals

- no production ranking change
- no Qdrant/Postgres/Valkey/Neo4j writes
- no full latent backfill requirement
- no AE retraining requirement
- no AST/CST expansion requirement
- no second fusion/RRF owner
- no mutation authority

## Promotion boundary

The repair matrix exists to answer whether a feature is worth promoting. A new
producer should be joined to one frozen candidate snapshot, its presence and
revision checks should pass, and a held-out tournament should measure lift over
the same baseline before any production integration or broad backfill is
considered.
