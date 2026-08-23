# Parent Atlas Sample/Query Matrix — Ewin–Tang-Inspired Measurement Lane

Date: 2026-08-22

## Scope

This is a measurement-only sampling lane aligned by `CandidateOrdinal`. It does not create a retrieval vote, identity authority, canonical writer, or promotion path.

## Contracts

Existing:

- `SampleQueryMatrixV1`
- `SamplingDecisionV1`
- `SamplingEvaluationV1`

Added for real-corpus measurement:

- `SamplingTargetSetV1`
- `SamplingPolicyAggregateV1`
- `SamplingCorpusEvaluationV1`
- `SamplingMatrixComparisonV1`

All receipts keep:

```text
identityAuthority=false
retrievalVoteProduced=false
canonicalWritesAttempted=false
promotionAuthorized=false
```

## Mathematical gate

If every semantic row is row-L2 normalized, row norms are equal and row-level length-squared sampling degenerates toward uniform sampling. The semantic control therefore exists to measure this effect, not to introduce another semantic representation.

The feature experiment uses `CandidateFeatureColumnarV1`. Present feature values are optionally column-standardized and the presence matrix is appended explicitly, so missing evidence is not silently conflated with a real numeric zero when row norms are measured.

## CandidateOrdinal admission

Real-corpus measurement requires one frozen candidate world. Four explicit artifacts are required:

1. `CandidateOrdinalMapV1` JSON;
2. frozen `semantic_768` parquet;
3. `CandidateFeatureColumnarV1` JSON;
4. exact `CandidateOrdinalSetV1` JSON defining the target top-k.

The known semantic producer is:

```text
scripts/atlas/duckdb/freeze-vector-snapshot-5k-768.mts
  -> .tmp/atlas-vector-snapshots/vector-snapshot-5k-768.parquet
```

That parquet is ordered by `packet_key`, not CandidateOrdinal. The semantic adapter therefore joins by exact `packetKey` and rejects missing, duplicate, or null/degraded packet-key bindings.

Only a verified `CandidateOrdinalSetV1` with `approximate=false` may become `EXACT_TOP_K` target truth. ANN-local ordinals that do not carry the same `candidateSnapshotRevision` and `ordinalMapChecksum` are rejected.

## Metrics

Across one fixed seed suite, each policy records:

- target recall mean/std/min/max;
- pairwise selection Jaccard across seeds;
- sampling latency p50/p95/max;
- estimated FP32 matrix bytes;
- deterministic decision-set checksum.

Policies:

- `LENGTH_SQUARED`
- `UNIFORM`
- `TOP_K_ROW_NORM`

The same sample size, seeds, target set, and CandidateOrdinal world are used for both semantic and feature matrices.

## Readiness audit

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

Repository discovery found the semantic parquet producer, but no canonical persisted corpus producer yet for:

```text
CandidateOrdinalMapV1 JSON
CandidateFeatureColumnarV1 corpus JSON
exact CandidateOrdinalSetV1 JSON
```

Contract builders and fixtures exist; fixture generation is not real-corpus evidence.

## Real-corpus run

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

Successful execution is still classified:

```text
SAMPLE_QUERY_REAL_CORPUS_MEASURED_NOT_PROMOTED
```

## Existing low-rank owner

Do not create a duplicate low-rank implementation. The repository already has:

```text
python/atlas_compute/low_rank.py
```

It contains a bounded full-SVD reference, seeded `torch.svd_lowrank` challenger, and Tang-inspired length-square nomination helper, while explicitly disclaiming Tang's full sublinear recommendation algorithm. Its existing tests live in `python/test_atlas_compute.py`.

If real feature-matrix length-squared sampling produces repeatable recall lift over uniform, EWINTANG-04 should reuse that module. RTX GEMM acceleration is a later executor optimization.

## Proof state

```text
EWINTANG-00 MATRIX ASSUMPTIONS                 IMPLEMENTED_UNPROVEN
EWINTANG-01 SAMPLE/QUERY ACCESS                IMPLEMENTED_UNPROVEN
EWINTANG-02 NORMALIZATION EFFECT               WRITTEN_UNRUN
EWINTANG-03 DETERMINISTIC PRNG                 IMPLEMENTED_UNPROVEN
EWINTANG-04 LOW-RANK                           EXISTING PYTHON SURFACE / CORPUS BINDING OPEN
EWINTANG-05 MULTI-SEED CANDIDATE RECALL        IMPLEMENTED_UNPROVEN
EWINTANG-06 NO NEW RETRIEVAL VOTE              CONTRACTUALLY GUARDED
EWINTANG-07 NO CANONICAL IDENTITY              CONTRACTUALLY GUARDED
EWINTANG-08 RTX GEMM ACCELERATION              NOT IMPLEMENTED
```

## Fixture tests

```powershell
npx vitest run `
  src/lib/server/atlas/sampling/sample-query-matrix-v1.spec.ts `
  src/lib/server/atlas/sampling/sample-query-corpus-evaluation-v1.spec.ts
```

Promotion rule: only open the low-rank corpus tranche if the feature matrix shows repeatable positive `lengthSquared.recallMean - uniform.recallMean` on the same exact target set, sample size, CandidateOrdinal map, and seed suite.
