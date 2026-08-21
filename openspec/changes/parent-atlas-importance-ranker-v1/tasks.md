# Tasks: parent-atlas-importance-ranker-v1

## Ownership invariant

`src/lib/server/retrieval/runtime-reranker.ts` remains the canonical production rerank owner. `ImportanceRankerV1` is an analytical/challenger contract until parity/evaluation proves a change is justified. It must not become a second live rank owner, fusion vote, retrieval lane, or persistence owner.

```text
retrievers          -> candidates
feature producers   -> candidate features
runtime-reranker    -> canonical production rerank owner
ImportanceRankerV1  -> explainable challenger / evaluation receipt
BFS/SSSP            -> evidence relationship proof
low-rank sampler    -> expensive-work allocation
exact promotion     -> truth establishment
ACE                  -> residency
```

## IR-00 — Reconcile existing owner before implementation

- [x] Confirm `runtime-reranker.ts` exists and owns deterministic reranking/fallback/provenance.
- [x] Confirm current canonical deterministic blend already accepts dense, BM25, AST, graph, PageRank, domain and cross-encoder signals.
- [x] Confirm QAS already exposes revision-qualified semantic, lexical, AST, graph, domain, execution and evidence context.
- [x] Do not wire `ImportanceRankerV1` into `SearchRuntime` in this tranche.

## IR-01 — Explainable challenger contract

- [x] Add `RankProfileV1` with query/task-conditioned feature weights.
- [x] Add `GraphAuthoritySignalsV1` preserving raw PageRank/PPR-style signals separately from the canonical six-feature projection.
- [x] Add `ImportanceRankInputV1` and `ImportanceRankResultV1` with three scores: relevance, structural importance, and support.
- [x] Add a relevance-gated priority score so a globally central but query-irrelevant node cannot dominate.
- [x] Add per-component contribution reporting for auditability.
- [x] Add deterministic ranking/tie-breaking.

## IR-02 — Existing-QAS bridge

- [x] Adapt existing `QueryAdaptiveFeatureRowV1` into challenger inputs; do not query Postgres/Qdrant/Neo4j/Valkey from the ranker.
- [x] Use existing `graphAuthority` as fallback when PageRank/PPR percentile signals are unavailable.
- [x] Derive bounded evidence-strength only from explicit evidence references in the read-only harness.
- [ ] Bind `GlobalGraphAuthorityV1` from the current graph-revision-qualified PageRank owner.
- [ ] Bind `QueryGraphAuthorityV1` / PPR only after canonical seed identity is proven.
- [ ] Bind path/community affinity from bounded post-top-k graph expansion, not broad graph traversal.

## IR-03 — Read-only report harness

- [x] Add `scripts/atlas/report-importance-ranker-v1.mts` over `docs/reports/atlas-qas-candidate-features.jsonl`.
- [x] Emit `atlas-importance-ranker-v1.ndjson` plus report JSON without canonical/cache/graph/Kanban writes.
- [ ] Add same-request comparison against the canonical `DeterministicReranker` output.
- [ ] Record top-k overlap, rank correlation, and disagreement examples.
- [ ] Do not promote challenger weights from fixture-only evidence.

## IR-04 — Evaluation gate before owner change

- [ ] Build fixed relevance fixtures and/or live receipt-labeled query set.
- [ ] Measure Recall@k, MRR/NDCG, top-k overlap, and rank correlation against canonical reranker.
- [ ] Verify relevance gating on high-PageRank irrelevant hubs.
- [ ] Verify failure queries increase execution/AST usefulness without reducing relevant exact evidence.
- [ ] Only after measured improvement propose extending the canonical runtime-reranker contract; do not add a parallel production caller.

## IR-05 — Graph authority semantics

- [ ] `GlobalGraphAuthorityV1`: raw PageRank plus percentile keyed by canonical identity + graph revision.
- [ ] `QueryGraphAuthorityV1`: PPR/query-relative authority keyed by request + graph revision + canonical seed set.
- [ ] Keep raw graph signals out of the compact canonical six-feature matrix; derive `graphAuthority` from them.
- [ ] Prefer percentile/rank-normalized PageRank for cross-query scoring; retain raw score for receipts.
- [ ] PPR may receive greater query-time weight than global PageRank, but coefficients remain policy revisions, not truth.

## IR-06 — Structural evidence after top-k

- [ ] Run BFS/SSSP/path extraction only after candidate narrowing and canonical identity acceptance.
- [ ] Convert direct-definition/call/type/test/path proof into `EvidenceStrengthV1` rather than another retrieval vote.
- [ ] Support n-ary hyperedge proximity (diagnostic/type/test context) as evidence features without flattening canonical hyperedges.
- [ ] Feed evidence-supported priority to the low-rank sampler/exact-promotion budgeter only after the CPU baseline is proven.

## IR-07 — Current critical blockers outside ranker

- [ ] Do not use unresolved Qdrant point IDs as canonical graph seeds. The supplied audit reports the live 768 corpus is searchable but canonical identity coverage is degraded; unresolved hits remain retrieval evidence only.
- [ ] Prove the live `codebase_chunks_768` representation producer/model before treating 768 dimensions as EmbeddingGemma provenance.
- [ ] Complete Git workspace/source revision owner ledgers and write/readback canary before structural canonical promotion.
- [ ] Keep the 6,908-row null-hash metadata repair separate from revision-owner work.

## Safe order

```text
Git revision semantics proof
  -> workspace/source revision owner canary
  -> Qdrant 768 provenance proof
  -> canonical/degraded identity receipt
  -> QAS candidate feature rows
  -> canonical runtime rerank baseline
  -> ImportanceRankerV1 challenger receipt
  -> admitted top-k canonical seeds
  -> bounded AST/Neo4j/hyperedge evidence expansion
  -> evidence-strength rerank comparison
  -> low-rank sampling / exact promotion
  -> ContextManifest / RLM
  -> execution receipt
  -> ACE residency learning
```
