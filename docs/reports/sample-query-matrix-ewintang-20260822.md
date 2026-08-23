# Parent Atlas Sample/Query Matrix — Ewin–Tang-Inspired Measurement Lane

Date: 2026-08-22

## Scope

This tranche introduces a measurement-only sample/query matrix aligned by `CandidateOrdinal`.
It does **not** create a new retrieval lane, identity authority, production sampler, or promotion path.

## Contracts

- `SampleQueryMatrixV1`
- `SamplingDecisionV1`
- `SamplingEvaluationV1`

Matrix roles:

- `CANDIDATE_FEATURE`
- `SEMANTIC_RESIDUAL`
- `LATENT_ROUTING`

Normalization is explicit and checksum-bearing:

- `NONE`
- `COLUMN_STANDARDIZED`
- `ROW_L2`

Sampling policies:

- `LENGTH_SQUARED`
- `UNIFORM`
- `TOP_K_ROW_NORM`

## Critical proof question

If all rows are L2-normalized, row norms are equal and row-level length-squared sampling degenerates toward uniform sampling. The contract records row squared norms and their coefficient of variation and exposes `lengthSquaredDegeneratesTowardUniform` rather than assuming the sampling policy remains informative.

## Safety invariants

Every receipt records:

- `identityAuthority=false`
- `retrievalVoteProduced=false`
- `canonicalWritesAttempted=false`
- `promotionAuthorized=false`

The bounded proof runner uses fixture-only data and performs no Postgres, Qdrant, Neo4j, or Valkey reads or writes.

## Proof sequence

```text
EWINTANG-00 MATRIX ASSUMPTIONS RECORDED          IMPLEMENTED_UNPROVEN
EWINTANG-01 SAMPLE/QUERY ACCESS DEFINED          IMPLEMENTED_UNPROVEN
EWINTANG-02 NORMALIZATION EFFECT PROVEN          WRITTEN_UNRUN
EWINTANG-03 DETERMINISTIC PRNG RECEIPT           IMPLEMENTED_UNPROVEN
EWINTANG-04 LOW-RANK FIXTURE PARITY              NOT IMPLEMENTED
EWINTANG-05 CANDIDATE RECALL MEASURED            FIXTURE SURFACE WRITTEN_UNRUN
EWINTANG-06 NO NEW RETRIEVAL VOTE                CONTRACTUALLY GUARDED
EWINTANG-07 NO CANONICAL IDENTITY                CONTRACTUALLY GUARDED
EWINTANG-08 RTX GEMM ACCELERATION                NOT IMPLEMENTED
```

## Workstation commands

From `sveltekit-frontend`:

```powershell
npx vitest run `
  src/lib/server/atlas/sampling/sample-query-matrix-v1.spec.ts
```

Then:

```powershell
npx tsx scripts/atlas/prove-sample-query-matrix-v1.mts `
  --output=../docs/reports/sample-query-matrix-proof-v1.json
```

A passing fixture receipt proves only deterministic CandidateOrdinal-aligned sampling behavior and the L2-normalization degeneracy check. It does not prove low-rank utility on the real corpus.

## Next real experiment

Materialize the same `CandidateOrdinal` candidate world into two derived matrices:

1. row-L2-normalized semantic rows;
2. an explicitly defined unnormalized or column-standardized candidate-feature / residual matrix.

Run fixed seeds over the same target ordinals and compare:

- Recall@sample-size
- overlap with exact/top-k target candidates
- variance across seeds
- sampling time
- matrix bytes

Only if the length-squared policy improves bounded coverage over uniform should a low-rank approximation or RTX acceleration tranche be opened.
