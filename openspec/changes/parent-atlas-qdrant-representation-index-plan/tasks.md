# Parent Atlas Qdrant representation/index plan — proof tasks

Status date: 2026-08-21

This change freezes a read-only target plan for dense/sparse representations and
selective payload indexes in `codebase_chunks_768`. It does not create vector
schemas, payload indexes, sparse vectors, point payloads, or canonical identity.
`WRITTEN != WIRED != PROVEN`.

## Ownership boundaries

- PostgreSQL remains canonical truth.
- Qdrant remains a persistent retrieval projection.
- Qdrant point IDs and payload indexes do not mint canonical identity.
- Logical retrieval lanes remain distinct from executors.
- Dense vectors, BM25, miniCOIL, and SPLADE are independent representations.
- BM25/miniCOIL/SPLADE must never be derived from dense EmbeddingGemma floats.
- Historical 768-dimensional shape does not prove the model that produced the vector.
- Current proven physical dense slots are `content`, `error`, `signature`; do not rename/recreate them in this tranche.
- Workspace/source revision payloads cannot establish revision authority.

## QDR-REP-00 — historical/current schema census

- [x] Reuse existing repository proof that `codebase_chunks_768` has physical dense slots `content`, `error`, and `signature`, each 768d cosine.
- [x] Keep historical model family explicitly `UNPROVEN_HISTORICAL_MODEL`.
- [x] Reuse sparse source audit showing text availability but sparse owner/projection still unproven.
- [ ] Execute fresh live collection audit on workstation and retain receipt.

## QDR-REP-01 — representation intent contract

- [x] Add `QdrantRepresentationIndexPlanV1`.
- [x] Separate physical slot name from logical representation role.
- [x] Keep `content` logical semantic_768 active physical dense representation.
- [x] Keep `error` and `signature` as separate dense physical representations.
- [x] Add optional `semantic_mrl_512` derived challenger without changing historical dense ownership.
- [x] Add BM25 sparse lexical representation with IDF modifier.
- [x] Keep miniCOIL and SPLADE challenger-only until explicit model/eval gates.
- [x] Freeze `modelProvenanceRequiredBeforePromotion=true`.
- [ ] Run focused tests.

## QDR-REP-02 — live read-only drift audit

- [x] Add `audit-qdrant-representation-index-plan.mts`.
- [x] Read collection vector/sparse/payload schema only.
- [x] Sample planned payload field coverage without requesting vectors.
- [x] Emit `READY | MISSING | EXTRA | TYPE_DRIFT | CONFIG_DRIFT`.
- [x] Distinguish required vs optional missing representations/indexes.
- [x] Emit `qdrantWritesAttempted=false` and `canonicalWritesAttempted=false`.
- [ ] Run against live `codebase_chunks_768`.

## QDR-REP-03 — BM25 sparse schema mutation plan

- [x] Add `QdrantRepresentationMutationPlanV1`.
- [x] If BM25 schema is missing, propose an explicit sparse-vector-schema operation only.
- [x] Keep BM25 point population as a separate later task.
- [x] Do not propose miniCOIL/SPLADE schema while challenger contracts are unbound.
- [x] Protect existing `content/error/signature` dense slots from replacement/recreation.
- [x] Block mutation planning on existing vector configuration drift.
- [ ] Review live generated operation plan before any APPLY implementation exists.

## QDR-REP-04 — selective payload index plan

- [x] Plan identity/routing indexes for `canonical_id` and `packet_key`.
- [x] Plan revision-filter indexes for `workspace_revision` and `source_revision` without authorizing revision value backfill.
- [x] Plan optional routing indexes for `domain_class`, `node_kind`, `document_id`, and `evidence_kind`.
- [x] Do not index every numerical feature.
- [x] Forbid score/similarity/PageRank/execution/memory/SOM/KMeans/cross-encoder fields by default.
- [x] Block automatic replacement when an existing payload index has type drift.
- [ ] Measure actual payload coverage/selectivity before applying optional indexes.

## QDR-REP-05 — payload population provenance

- [ ] Prove `canonical_id` and `packet_key` payload values map to real canonical owners before relying on them for filtering.
- [ ] Keep S512/S768 identity reconciliation separate from Qdrant index creation.
- [ ] Prove workspace/source revision authority before writing/backfilling those payload fields.
- [ ] Record representation/model/prompt/producer revision for newly generated sparse rows.

## QDR-REP-06 — BM25 point population dry-run

- [ ] Freeze BM25 tokenizer/model revision and source text contract.
- [ ] Produce deterministic bounded sparse-vector manifest for an immutable point subset.
- [ ] Prove point ID -> canonical candidate roundtrip.
- [ ] Prove no dense vectors or canonical payload identity are modified.
- [ ] Compare sparse manifest checksum across two unchanged runs.

## QDR-REP-07 — bounded APPLY

- [ ] Add an explicit reviewed apply tool only after QDR-REP-02 through QDR-REP-06 are proven.
- [ ] Add missing BM25 schema before BM25 point upserts.
- [ ] Create only reviewed payload indexes whose payload coverage/selectivity is demonstrated.
- [ ] Use read-back verification after each schema/index mutation.
- [ ] No bulk point payload mutation in the same transaction/tranche.

## QDR-REP-08 — retrieval challenger proof

- [ ] Evaluate BM25 sparse retrieval as one logical lexical lane against existing lexical baseline.
- [ ] Enforce one vote per logical lane during fusion.
- [ ] Measure Recall@K/MRR/nDCG/latency and filter correctness.
- [ ] Keep miniCOIL/SPLADE separate challenger evaluations.
- [ ] Promote only after identity/revision/model provenance gates are satisfied.

## Validation commands

```powershell
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

npx vitest run `
  src/lib/server/atlas/qdrant/qdrant-representation-index-plan-v1.spec.ts `
  src/lib/server/atlas/qdrant/qdrant-representation-index-mutation-plan-v1.spec.ts

npx tsx scripts/atlas/audit-qdrant-representation-index-plan.mts `
  --sample=200 `
  --output=docs/reports/qdrant-representation-index-audit.json

npx tsx scripts/atlas/plan-qdrant-representation-index-mutations.mts `
  --input=docs/reports/qdrant-representation-index-audit.json `
  --output=docs/reports/qdrant-representation-index-mutation-plan.json
```

Expected safety state for both generated receipts:

```text
canonical truth owner          POSTGRES
Qdrant                         projection only
qdrant writes attempted        false
point population allowed       false
revision payload backfill      false
apply allowed                  false
model inference from 768d      forbidden
```
