# Tasks: parent-atlas-rlm-ace-routing

## Ownership invariant

```text
RLM = epistemic/navigation policy
ACE = residency/cache policy
```

RLM decides which evidence branch deserves inspection or another model/tool call.
ACE may predict which already-canonical objects should be warm, at what fidelity,
but it does not choose semantic truth, canonical identity, graph truth, fusion votes,
or the final answer.

## RLM-ACE-01 — Pure contracts and planner

- [x] Add revision-qualified `RlmRoutingPrefillV1`, `RlmNavigationDecisionV1`, `AcePrefetchHintV1`, and `RlmAceRoutingReceiptV1` contracts.
- [x] Keep `treeNodeId` a structural coordinate alongside canonicalId/symbolVersionId; do not promote parser-local identity to canonical identity.
- [x] Add a pure navigation planner for AST/callers/tests/runtime/docs/graph/source branches.
- [x] Add a pure ACE prefetch planner for `semantic_768`, AST subtree, caller neighborhood, test packet, source span, and graph neighborhood.
- [x] Ensure the planner emits no Postgres/Qdrant/Neo4j/Valkey/GPU/Kanban writes.
- [x] Add focused fixture tests using `treeNodeId=T8421`, `symbolVersionId=S331`, and `packetKey=packet:1`.

## RLM-ACE-02 — Routing prefill

- [x] Add bounded head activation and fetch-policy derivation.
- [x] Keep the 20x20 SOM as routing metadata only; neighborhood expansion is bounded to the existing 0..19 coordinate space.
- [x] Accept KMeans centroid IDs as routing hints without treating them as ANN results or fusion votes.
- [ ] Bind real SOM BMU + revision from the existing SOM owner. Do not fabricate `(x,y)` from task labels or priority.
- [ ] Bind revision-qualified KMeans centroid IDs from the existing clustering owner.
- [ ] Measure the small routing-prefill token budget separately from synthesis prefill.

## RLM-ACE-03 — QAS integration

- [x] Add `scripts/atlas/report-rlm-ace-routing.mts` that consumes the existing `atlas-qas-candidate-features.jsonl` artifact.
- [x] Reject malformed/mixed request or workspace rows rather than padding missing identity/revisions.
- [x] Keep exact promotion upstream; this report does not fetch or invent evidence.
- [ ] Bind `tree_node_id` into `QueryAdaptiveFeatureRowV1` through the existing structural identity owner after the identity split is proven.
- [ ] Add explicit same-request exact-top-k/evidence-promotion receipt linkage.
- [ ] Add recursion-decision evaluation: direct retrieval vs bounded RLM vs parallel sub-RLM.

## RLM-ACE-04 — Daily Graphify

- [x] Wire the read-only RLM/ACE receipt after the existing daily QAS proof/evaluation step.
- [x] Failure/deferred RLM/ACE reporting must never block canonical `graphify:daily` completion.
- [ ] Keep AST owner selection first: `graphify:daily -> GraphifyStructuralMaterializer -> AstProvider -> 8095 -> canonical owner` must be production-reachable before RLM claims AST-grounded recursion.
- [ ] Feed the resulting routing receipt into recommendation/Kanban evidence only through the existing recommendation receipt owner.
- [ ] Add durable execution-outcome linkage before ACE learns reuse/promotion utility from task success.

## RLM-ACE-05 — OpenSpec/git-diff recommendation audit

- [x] Add `scripts/atlas/audit-openspec-diff-recommendations.mjs`.
- [x] Read open checkboxes from current `openspec/changes/**/tasks.md` plus working-tree/index diffs.
- [x] Emit deterministic, read-only Kanban recommendation drafts with source and changed-file evidence.
- [x] Do not create or update Kanban cards from the audit script.
- [ ] Join these drafts to `OkfRecommendationV1` / recommendation evidence receipts before promotion.
- [ ] Compare accepted recommendations with later git/test/ExecutionReceipt outcomes for offline policy evaluation.

## RLM-ACE-06 — BitFrost / Valkey residency

- [ ] Bind ACE hints to the existing `LodPromotionDecisionV1`; do not create a second residency contract.
- [ ] Prove `WARM/TURBO_4BIT -> HOT/FP16` only after `SemanticSnapshotV1`, ordinal-map, and TurboVec execution-owner gates are proven.
- [ ] Store only revision-qualified hot references/routing metadata in Valkey; Postgres remains durable receipt/canonical owner.
- [ ] Add stale workspace/source/representation/ordinal-map invalidation tests.
- [ ] Add actual hit/miss, reuse probability, byte cost, RSS and VRAM evidence before enabling learned prefetch.

## RLM-ACE-07 — Retrieval and graph expansion

- [ ] Preserve one logical semantic lane regardless of Qdrant/cuVS/CAGRA/TurboVec executor.
- [ ] Keep SOM/KMeans as coarse routing; KNN remains nearest-neighbor retrieval.
- [ ] Run bounded Neo4j/cuGraph fanout only after canonical candidate narrowing.
- [ ] Feed global PageRank/PPR/community/path signals into derived ranking features, never as an independent fusion vote.
- [ ] Keep ontology-linked tuples and domain classifications canonical/revisioned in their existing OKF/Postgres ownership boundary; projection indexes may accelerate lookup but may not become truth.

## RLM-ACE-08 — Storage/index experiments after correctness gates

- [ ] PostgreSQL AIO, pgvector, and bitmap-index work remains proof/benchmark work until runtime ownership/parity is measured.
- [ ] Qdrant tags/payload filters remain a projection for revision/domain/SOM/AST metadata; do not create a collection per SOM cell/domain/agent.
- [ ] TurboVec uses the canonical ordinal map; compressed local IDs may not replace packet/symbol identity.
- [ ] Any bitmap/BitFrost bucket warming must be derived from canonical identity + revisions and be rebuildable.
- [ ] GPU top-K/KMeans/SOM bindings must consume existing bridge contracts and emit parity/ordinal receipts before production promotion.

## Current safe order

```text
AST production owner reachability
  -> tree_node_id/canonical identity binding
  -> live revision-qualified QAS feature export
  -> exact baseline + promotion
  -> RLM routing receipt
  -> bounded AST/graph recursion
  -> ContextManifest synthesis prefill
  -> DAG candidates
  -> execution/validation receipt
  -> Kanban recommendation outcome
  -> ACE/BitFrost measured prefetch and LOD policy
```
