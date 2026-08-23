# Parent Atlas Sample/Query Matrix — Ewin–Tang-Inspired Measurement Lane

Date: 2026-08-22

## Scope

This lane is measurement-only and aligned by `CandidateOrdinal`. It does **not** create a new retrieval vote, identity authority, production sampler, or promotion path.

Current upstream behavior still supports the original experiment design:

- PyTorch row-L2 normalization divides each vector by its p-norm with an epsilon floor.
- Row-level length-squared sampling is therefore expected to become uninformative when all row norms are equal.
- pgvector supports exact search, subvector indexing with full-vector reranking, half-precision indexing, and binary quantization; these remain executor/index experiments rather than semantic identity changes.

## Current-main repair

A merge on `main` had interleaved the original probability-only `SampleQueryMatrixV1` implementation with the newer CandidateOrdinal-bound implementation. The same corruption existed in `sample-query-matrix-v1.spec.ts`.

On `agent/sample-query-corpus-current-main-20260822` both files are replaced with the clean CandidateOrdinal-bound contract/spec before any corpus evaluation is layered on top.

The retained contract requires:

- a complete `CandidateOrdinalMapV1` row world;
- dense ordinals `0..N-1`;
- explicit source-matrix revision/checksum;
- explicit normalization;
- deterministic fixture PRNG seed;
- no identity authority;
- no retrieval vote;
- no canonical writes;
- no promotion authorization.

## Corpus evaluation additions

Added:

- `sample-query-corpus-evaluation-v1.ts`
- `sample-query-corpus-evaluation-v1.spec.ts`
- `sample-query-artifact-adapters-v1.ts`
- `scripts/atlas/evaluate-sample-query-corpus-v1.mts`
- `scripts/atlas/audit-sample-query-corpus-readiness.mts`

### SamplingTargetSetV1

Target truth is revision/checksum bound to the same candidate world. `EXACT_TOP_K` is accepted only from `CandidateOrdinalSetV1` with `approximate=false` and a verified result checksum.

### Candidate feature matrix

`CandidateFeatureColumnarV1` is projected as:

```text
[12 feature values | 12 presence bits]
```

so:

```text
missing evidence = value 0, presence 0
measured zero    = value 0, presence 1
```

The default corpus experiment column-standardizes only present feature values and leaves presence bits unchanged.

### Semantic matrix

The semantic sampling view is joined to CandidateOrdinal by `packetKey`, never by Parquet/NDJSON row number. It explicitly row-L2 normalizes the 768-dimensional values before measuring row-norm sampling.

The preferred source on current main is now:

```text
sveltekit-frontend/scripts/atlas/export-frozen-semantic-v2-source.mts
```

rather than the older packet-key-only 5K Parquet freeze. That exporter already requires revision-qualified Graphify source/workspace lineage and emits:

- canonical/packet key;
- canonical source revision;
- source ref;
- `semantic_768` representation ID;
- representation revision;
- workspace revision;
- 768-dimensional embedding;
- NDJSON checksum receipt;
- read-only database transaction / no writes.

The real corpus evaluator verifies those fields against the supplied `CandidateOrdinalMapV1` before sampling.

## Multi-seed measurement

For each matrix and each fixed seed, the evaluator records:

- length-squared recall;
- uniform recall;
- top-k-row-norm recall;
- recall mean/std/min/max;
- pairwise selection Jaccard across seeds;
- p50/p95/max sampling latency;
- deterministic decision-set checksum;
- approximate dense value bytes.

The comparison receipt remains:

```text
measurementOnly = true
identityAuthority = false
retrievalVoteProduced = false
canonicalWritesAttempted = false
promotionAuthorized = false
```

## Current real-corpus blockers

The repository can now name the missing artifacts precisely instead of guessing:

1. **CandidateOrdinalMapV1 file** — the contract/materializer exists, but a durable real-corpus JSON export owner has not yet been identified.
2. **CandidateFeatureColumnarV1 real corpus** — materializer and deterministic Arrow writer/readback exist, but current repo usage is proof/spec scoped; a corpus-wide producer in the same candidate world is not yet proven.
3. **Exact CandidateOrdinalSetV1** — the contract exists, but the sampling target must come from an exact executor result already bound to the same candidate snapshot and `ordinalMapChecksum`; ANN-local ordinals are not accepted.

The evaluator does not reconstruct any of these from row position, executor-local IDs, or partial identity fields.

## Workstation commands

### 1. Focused fixture proofs

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

### 2. Check real corpus artifact readiness

```powershell
npx tsx scripts/atlas/audit-sample-query-corpus-readiness.mts `
  --ordinal-map=<candidate-ordinal-map.json> `
  --semantic-source=<semantic-768-v2-source.ndjson> `
  --semantic-receipt=<semantic-768-v2-source-receipt.json> `
  --feature-columnar=<candidate-feature-columnar.json> `
  --exact-candidate-set=<exact-candidate-ordinal-set.json>
```

### 3. Real measurement after all inputs are present

```powershell
npx tsx scripts/atlas/evaluate-sample-query-corpus-v1.mts `
  --ordinal-map=<candidate-ordinal-map.json> `
  --semantic-source=<semantic-768-v2-source.ndjson> `
  --semantic-receipt=<semantic-768-v2-source-receipt.json> `
  --feature-columnar=<candidate-feature-columnar.json> `
  --exact-candidate-set=<exact-candidate-ordinal-set.json> `
  --sample-size=64 `
  --target-k=10 `
  --seeds=1,7,42,99,2026,65537,104729 `
  --output=../docs/reports/sample-query-real-corpus-v1.json
```

## Proof state

```text
EWINTANG-00 MATRIX ASSUMPTIONS RECORDED          IMPLEMENTED_UNPROVEN
EWINTANG-01 SAMPLE/QUERY ACCESS DEFINED          IMPLEMENTED_UNPROVEN
EWINTANG-02 NORMALIZATION EFFECT                 FIXTURE WRITTEN_UNRUN
EWINTANG-03 DETERMINISTIC PRNG RECEIPT           IMPLEMENTED_UNPROVEN
EWINTANG-04 LOW-RANK FIXTURE PARITY              EXISTING PYTHON CHALLENGER / NOT CANDIDATE-WORLD PROMOTED
EWINTANG-05 MULTI-SEED CANDIDATE RECALL          IMPLEMENTED_UNPROVEN
EWINTANG-06 NO NEW RETRIEVAL VOTE                CONTRACTUALLY GUARDED
EWINTANG-07 NO CANONICAL IDENTITY                CONTRACTUALLY GUARDED
EWINTANG-08 RTX GEMM ACCELERATION                NOT IMPLEMENTED

SAMPLE QUERY MAIN MERGE CORRUPTION               REPAIRED_ON_BRANCH
REAL SEMANTIC V2 INPUT ADAPTER                   IMPLEMENTED_UNPROVEN
REAL FEATURE COLUMNAR ADAPTER                    IMPLEMENTED_UNPROVEN
EXACT TARGET ADMISSION                           IMPLEMENTED_UNPROVEN
REAL CORPUS EVALUATOR                            IMPLEMENTED_UNPROVEN
REAL CORPUS RECEIPT                              NOT YET PRODUCED
LOW-RANK PROMOTION                               NOT AUTHORIZED
```

Only if the real feature/residual matrix's length-squared policy improves bounded target coverage over uniform should a low-rank approximation promotion experiment be opened. RTX acceleration is a later performance gate, not a prerequisite for establishing sampling utility.
