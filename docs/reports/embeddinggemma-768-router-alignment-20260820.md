# Parent Atlas EmbeddingGemma 768 + router alignment — 2026-08-20

Status: **IMPLEMENTED_UNPROVEN**

## Authority reconciliation

Merged `main` currently contains two incompatible semantic-owner declarations:

1. Older `embedding-contract-768.ts` declares `semantic_768` / `codebase_chunks_768` canonical and says 512 is retired.
2. Newer `qdrant-semantic-projection.ts`, `semantic-512.ts`, and the `parent-atlas-semantic-512-canonicalization` OpenSpec freeze model-native 768 separately from persisted `semantic_512` / `codebase_chunks_512`.

This tranche does not silently resolve that collision. The newer persistence proof remains the active storage-reconciliation work, while the new task-representation layer treats native 768 as model/executor output and persistence as a separate authority.

## Added alignment

- `embeddinggemma-task-representation-v1.ts`
  - task-qualified prompts for retrieval query/document, code retrieval, classification, clustering, sentence similarity, and summarization
  - native output contract = 768
  - MRL 512/256/128 = prefix + L2 re-normalization
  - task-qualified IDs such as `classification_768`, `classification_mrl_128`, `retrieval_query_mrl_512`, `code_query_768`
  - cache identity includes model, artifact, executor, task/prompt, text digest, representation revision, and dimension
  - persistence authority explicitly separate
- `embeddinggemma-task-runtime-v1.ts`
  - injected native-768 executor
  - task formatting before execution
  - deterministic client-side MRL projection
  - no persistence
- `embeddinggemma-executor-receipt-v1.ts`
  - artifact/executor/backend/quantization/native-contract/repeatability/prompt/parity/recall receipt
  - persistence authority separately recorded as `semantic_512`, `semantic_768`, or `UNRESOLVED`
- classification MRL receipt IDs corrected from misleading `semantic_*` names to `classification_*`
- `QueryClassificationV2` and `RetrievalPlanV1`
  - domain/operation/structural intent/retrieval need/budgets/confidence
  - bounded lexical/semantic/AST/graph plan
  - exact promotion and ContextManifest always required
- `RetrievalRouterTensorManifestV1`
  - frozen width 224
  - classification MRL 128 + ontology/query-shape/operation/runtime/graph-tool sections
- `XgboostQueryRouterV2Contract`
  - challenger control-plane router
  - `multi:softprob` probability output
  - abstention required
- `query-router-control-plane-v2.ts`
  - composes the retrieval plan with existing candidate classification, HMM/model-analysis, CrossEncoder, and exact-promotion owners

## Explicit non-actions

- no Qdrant writes
- no PostgreSQL writes
- no Valkey writes
- no Neo4j writes
- no production XGBoost model replacement
- no MiniLM CrossEncoder removal
- no semantic_768 persistence promotion
- no semantic_512 deletion
- no launcher default changes

## Local proof sequence

From `sveltekit-frontend`:

```powershell
npx vitest run --config vitest.lane-contracts.config.ts `
  src/lib/server/atlas/embedding/embeddinggemma-task-representation-v1.spec.ts `
  src/lib/server/atlas/classification/query-classification-v2.spec.ts `
  src/lib/server/atlas/classification/classification-control-plane-v1.spec.ts
```

For the local Q8_0 artifact:

```powershell
Get-FileHash C:\Users\james\Videos\deeds-web-app\models\embeddinggemma-300m-q8_0.gguf -Algorithm SHA256
```

Then run the dedicated embed server explicitly against Q8_0 and a <=2048-token proof configuration. Do not globally reorder launcher model priority until the executor receipt is proven.

## Promotion rule

```text
EmbeddingGemma model-native task vector = 768
       |
       +--> classification_128/256/512/768 (control plane, ephemeral unless separately admitted)
       +--> retrieval query/document/code-query task representations
       |
       +--> persisted semantic representation ONLY through the reconciled persistence owner
```

`WRITTEN != WIRED != PROVEN`; model-native dimension does not choose persistent canonical storage.
