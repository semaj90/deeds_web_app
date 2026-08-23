# Parent Atlas Sample/Query Matrix — Ewin–Tang-Inspired Measurement Lane

Date: 2026-08-22

## Scope

This tranche introduces a measurement-only sample/query matrix aligned by `CandidateOrdinal`.
It does **not** create a new retrieval lane, identity authority, production sampler, or promotion path.

## Contracts

- `SampleQueryMatrixV1`
- `SamplingDecisionV1`
- `SamplingEvaluationV1`
- `SamplingTargetSetV1`
- `SamplingPolicyAggregateV1`
- `SamplingCorpusEvaluationV1`
- `SamplingMatrixComparisonV1`

Matrix roles:

- `CANDIDATE_FEATURE`
- `SEMANTIC_RESIDUAL`
- `LATENT_ROUTING`

The current schema calls the row-L2 semantic control matrix `SEMANTIC_RESIDUAL`; in this tranche it is used only as a measurement view over the frozen semantic artifact. It does not mint a new semantic representation or replace the canonical `semantic_768` matrix. A future schema revision may rename this role to `SEMANTIC_REFERENCE` if the measurement lane is retained.

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

The bounded fixture runner performs no Postgres, Qdrant, Neo4j, or Valkey reads or writes.
The real-corpus evaluator also performs no store reads: it accepts only explicitly supplied local immutable artifacts and writes one local measurement receipt.

## Real-corpus admission boundary

The real evaluator requires four explicit inputs:

1. `CandidateOrdinalMapV1` JSON;
2. frozen `semantic_768` parquet;
3. `CandidateFeatureColumnarV1` JSON;
4. exact `CandidateOrdinalSetV1` JSON for the query target.

The repository currently has a known semantic snapshot producer:

```text
scripts/atlas/duckdb/freeze-vector-snapshot-5k-768.mts
  -> .tmp/atlas-vector-snapshots/vector-snapshot-5k-768.parquet
```

That parquet is ordered by `packet_key`. **Its row position is not CandidateOrdinal.**
`adaptSemanticRowsToRowL2SampleQueryMatrixV1()` therefore joins by exact `packetKey` against the supplied `CandidateOrdinalMapV1` and rejects missing, duplicate, degraded/null packet-key bindings.

The candidate-feature adapter consumes the already checksum-qualified `CandidateFeatureColumnarV1` and requires exact candidate snapshot, ordinal-map, canonical-id, packet-key, source-revision, and row-count agreement. For the sampling experiment it appends the presence matrix as explicit columns so missing evidence is not silently conflated with a real numeric zero.

The target-set adapter accepts only a verified `CandidateOrdinalSetV1` with:

```text
approximate = false
candidateSnapshotRevision = exact candidate world
ordinalMapChecksum = exact candidate world
```

An ANN-local ordinal receipt that lacks the frozen ordinal-map checksum is **not** exact target truth and cannot be auto-adapted.

## Multi-seed metrics

For each policy and matrix the real evaluator records:

- Recall against the exact/frozen target set: mean, standard deviation, min, max;
- pairwise selection Jaccard across seeds;
- sampling latency p50, p95, max;
- estimated FP32 matrix bytes;
- decision-set checksum;
- length-squared delta versus uniform;
- length-squared delta versus deterministic top-row-norm.

The comparison runs the same `sampleSize` and seed list over both matrices:

```text
A. semantic_768 measurement view
   packetKey -> CandidateOrdinal
   explicit row-L2 normalization

B. candidate features
   present-cell column standardization
   + explicit presence bits
```

## Current artifact readiness

Known repository producer:

```text
semantic parquet
  YES
  scripts/atlas/duckdb/freeze-vector-snapshot-5k-768.mts
```

No canonical persisted producer was found in the repository for these real-corpus files yet:

```text
CandidateOrdinalMapV1 JSON
CandidateFeatureColumnarV1 corpus JSON
exact CandidateOrdinalSetV1 JSON
```

The contracts/builders exist, but fixture construction is not a real corpus artifact producer. The readiness audit therefore reports these as missing unless explicit paths are supplied.

Run:

```powershell
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

npx tsx scripts/atlas/audit-sample-query-corpus-readiness.mts `
  --ordinal-map=<candidate-ordinal-map.json> `
  --feature-columnar=<candidate-feature-columnar.json> `
  --exact-candidate-set=<exact-candidate-ordinal-set.json>
```

The semantic parquet defaults to:

```text
../.tmp/atlas-vector-snapshots/vector-snapshot-5k-768.parquet
```

## Real-corpus command

Once all four artifacts exist and share one frozen candidate world:

```powershell
npx tsx scripts/atlas/evaluate-sample-query-corpus-v1.mts `
  --ordinal-map=<candidate-ordinal-map.json> `
  --semantic-parquet=../.tmp/atlas-vector-snapshots/vector-snapshot-5k-768.parquet `
  --feature-columnar=<candidate-feature-columnar.json> `
  --exact-candidate-set=<exact-candidate-ordinal-set.json> `
  --sample-size=64 `
  --target-k=10 `
  --seeds=1,7,42,99,2026,65537,104729 `
  --output=../docs/reports/sample-query-real-corpus-v1.json
```

A successful run emits:

```text
SAMPLE_QUERY_REAL_CORPUS_MEASURED_NOT_PROMOTED
```

and still sets:

```text
lowRankPromotionAuthorized = false
rtxAccelerationAuthorized = false
retrievalVoteProduced = false
canonicalWritesAttempted = false
```

## Existing low-rank implementation

The repository already contains:

```text
python/atlas_compute/low_rank.py
```

with a bounded full-SVD reference, seeded `torch.svd_lowrank` challenger, and a Tang-inspired length-square nomination helper. It explicitly does not claim Tang's full sublinear recommendation algorithm. Do **not** create another low-rank owner. If the real-corpus sampling experiment justifies EWINTANG-04, extend/reuse that module and its existing `python/test_atlas_compute.py` coverage.

## Proof sequence

```text
EWINTANG-00 MATRIX ASSUMPTIONS RECORDED          IMPLEMENTED_UNPROVEN
EWINTANG-01 SAMPLE/QUERY ACCESS DEFINED          IMPLEMENTED_UNPROVEN
EWINTANG-02 NORMALIZATION EFFECT PROVEN          WRITTEN_UNRUN
EWINTANG-03 DETERMINISTIC PRNG RECEIPT           IMPLEMENTED_UNPROVEN
EWINTANG-04 LOW-RANK FIXTURE PARITY              EXISTING PYTHON SURFACE / NOT YET BOUND TO THIS CORPUS
EWINTANG-05 CANDIDATE RECALL MEASURED            MULTI-SEED CORPUS SURFACE IMPLEMENTED_UNPROVEN
EWINTANG-06 NO NEW RETRIEVAL VOTE                CONTRACTUALLY GUARDED
EWINTANG-07 NO CANONICAL IDENTITY                CONTRACTUALLY GUARDED
EWINTANG-08 RTX GEMM ACCELERATION                NOT IMPLEMENTED
```

## Workstation fixture commands

From `sveltekit-frontend`:

```powershell
npx vitest run `
  src/lib/server/atlas/sampling/sample-query-matrix-v1.spec.ts `
  src/lib/server/atlas/sampling/sample-query-corpus-evaluation-v1.spec.ts
```

Then:

```powershell
npx tsx scripts/atlas/prove-sample-query-matrix-v1.mts `
  --output=../docs/reports/sample-query-matrix-proof-v1.json
```

A passing fixture receipt proves only deterministic CandidateOrdinal-aligned sampling behavior and the L2-normalization degeneracy check. It does not prove low-rank utility on the real corpus.

## Promotion rule

Only if the real candidate-feature measurement shows a repeatable positive lift such as:

```text
lengthSquared.recallMean > uniform.recallMean
```

under the same target set, sample size, candidate world, and fixed seed suite should the next low-rank approximation tranche be opened. Even then, it remains a challenger until full low-rank error/recall/parity receipts exist. RTX acceleration is a later executor optimization, not a prerequisite for proving sampling utility.
