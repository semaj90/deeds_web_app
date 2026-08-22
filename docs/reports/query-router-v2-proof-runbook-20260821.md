# Parent Atlas Query Router V2 — proof runbook

Status: **IMPLEMENTED_UNPROVEN**

This runbook validates the merged Query Router V2 without changing a retrieval owner, canonical database state, Qdrant collections, Valkey state, Neo4j state, or the persisted semantic representation.

## Invariants

- EmbeddingGemma model-native output is 768 dimensions.
- Query routing uses the **classification** task representation, not retrieval-query embeddings.
- `classification_mrl_128` is derived from `classification_768` by prefix truncation + L2 re-normalization.
- Router Tensor V2 is 234 values and is revision-qualified.
- Dataset train/validation/test membership is frozen by the dataset contract.
- PyTorch and XGBoost must consume the exact same dataset checksum and tensor revision before metrics are comparable.
- The router predicts logical needs; deterministic policy chooses executors.
- HNSW, CAGRA, DiskANN/Vamana, BM25, miniCOIL, SPLADE, AST, graph, and CrossEncoder remain replaceable executors/stages.
- A configured package or index is not `PROVEN_AVAILABLE`.
- Synthetic fixture results prove plumbing only and can never authorize promotion.

## 0. Readiness audit

From `sveltekit-frontend`:

```powershell
npx tsx scripts/atlas/audit-query-router-v2-readiness.mts
```

Target:

```text
READY_FOR_FROZEN_CORPUS_EVAL
```

If the result is `BLOCKED_RUNTIME_DEPENDENCY`, fix only the reported Python/runtime dependency. Do not change routing defaults.

Reports:

```text
docs/reports/query-router-v2-readiness-audit.json
docs/reports/query-router-v2-readiness-audit.md
```

## 1. Contract/plumbing proof

```powershell
npx vitest run src/lib/server/atlas/classification/query-router-v2-integration.spec.ts
npx tsx scripts/atlas/prove-query-router-v2-plumbing.mts
```

Expected plumbing state:

```text
SYNTHETIC_PLUMBING_PROVEN
```

This is **not** classifier-quality evidence.

## 2. Prepare revision-qualified labels

Create:

```text
data/atlas-ml/query-router-labels-v2.jsonl
```

Each row must provide:

```text
queryId
query
queryRevision
labelRevision
embeddingModelRevision
representationRevision
ontologyMask32[32]
operationFlags16[16]
runtimeResource16[16]
graphToolStructure16[16]
domainLabel
operationLabel
retrievalNeeds[8]
budgetTargets[3]
evidenceRefs[]
```

Labels must come from reviewed evidence. The materializer does not infer or synthesize labels.

Minimum: 20 rows. A meaningful evaluation should be substantially larger and should cover all important domains/operations.

## 3. Materialize real EmbeddingGemma classification vectors

Start the proven/bounded 8081 EmbeddingGemma executor separately. Then:

```powershell
npx tsx scripts/atlas/materialize-query-router-source-v2.mts `
  --input data/atlas-ml/query-router-labels-v2.jsonl `
  --output data/atlas-ml/query-router-source-v2.jsonl `
  --endpoint http://127.0.0.1:8081/v1/embeddings
```

The command requires exactly 768 finite values and uses the EmbeddingGemma classification prompt authority.

Receipt:

```text
docs/reports/query-router-v2-source-materialization.json
```

## 4. Freeze the dataset

```powershell
npx tsx scripts/atlas/build-query-router-dataset-v2.mts `
  --input data/atlas-ml/query-router-source-v2.jsonl `
  --output data/atlas-ml/query-router-dataset-v2.jsonl
```

Do not modify row split assignments after this step. New labels or query revisions require a new dataset receipt.

## 5. Train both challengers

PyTorch:

```powershell
python scripts/atlas/train-query-router-pytorch-v2.py `
  --dataset data/atlas-ml/query-router-dataset-v2.jsonl
```

XGBoost:

```powershell
python scripts/atlas/train-query-router-xgboost-v2.py `
  --dataset data/atlas-ml/query-router-dataset-v2.jsonl
```

These are offline classifier challengers. Training does not switch the live router.

## 6. Same-corpus admission gate

```powershell
python scripts/atlas/compare-query-router-v2.py `
  --pytorch-receipt classifier-models/query-router-v2-pytorch/training-receipt.json `
  --xgboost-receipt classifier-models/query-router-v2-xgboost/training-receipt.json
```

A comparison is invalid unless dataset checksum and tensor revision match exactly.

Allowed states:

```text
REJECTED_OFFLINE
SHADOW_ELIGIBLE
```

There is no direct `PRODUCTION_OWNER` transition from offline training.

## 7. Shadow evaluation — next gate

Only after `SHADOW_ELIGIBLE`, compare router OFF versus router ON using the same revision-qualified query corpus.

Measure at minimum:

```text
retrieval Recall@K
MRR / NDCG where judgments exist
candidate count
semantic calls
sparse calls
graph expansions
CrossEncoder calls
ContextManifest tokens
p50 / p95 latency
execution success
regression rate
```

The shadow experiment must preserve one vote per logical lane.

## 8. Persistence remains separate

Neither classifier training nor executor-quality proof changes whether the admitted persistent semantic store is `semantic_512` or `semantic_768`.

Model-native 768, task representation, ANN executor, and persisted representation are separate promotion decisions.

## Stop conditions

Stop and report rather than infer when any of the following is missing:

- embedding model revision,
- prompt revision,
- representation revision,
- query revision,
- label revision,
- evidence refs,
- dataset checksum,
- tensor revision,
- all frozen splits,
- required runtime package.

No fallback may synthesize a missing revision or label.
