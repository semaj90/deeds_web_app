# Tasks: parent-atlas-rlm-ace-routing

## Ownership invariant

```text
RLM = epistemic/navigation policy
ACE = residency/cache policy
```

RLM decides which evidence branch deserves inspection or another model/tool call. ACE may predict which already-canonical objects should be warm, at what fidelity, but it does not choose semantic truth, canonical identity, graph truth, fusion votes, or the final answer.

## RLM-ACE-01 — Pure contracts and planner

- [x] Add revision-qualified `RlmRoutingPrefillV1`, `RlmNavigationDecisionV1`, `AcePrefetchHintV1`, and `RlmAceRoutingReceiptV1` contracts.
- [x] Keep `treeNodeId` a structural coordinate alongside canonicalId/symbolVersionId; do not promote parser-local identity to canonical identity.
- [x] Add a pure navigation planner for AST/callers/tests/runtime/docs/graph/source branches.
- [x] Add a pure ACE prefetch planner for `semantic_768`, AST subtree, caller neighborhood, test packet, source span, and graph neighborhood.
- [x] Ensure the planner emits no Postgres/Qdrant/Neo4j/Valkey/GPU/Kanban writes.
- [x] Add focused fixture tests.

## RLM-ACE-02 — Routing prefill

- [x] Add bounded head activation and fetch-policy derivation.
- [x] Keep the 20x20 SOM as routing metadata only; neighborhood expansion is bounded to 0..19.
- [x] Accept KMeans centroid IDs as routing hints without treating them as ANN results or fusion votes.
- [ ] Bind real SOM BMU + revision from the existing SOM owner.
- [ ] Bind revision-qualified KMeans centroid IDs from the existing clustering owner.
- [ ] Measure routing-prefill token budget separately from synthesis prefill.

## RLM-ACE-03 — QAS integration

- [x] Add `scripts/atlas/report-rlm-ace-routing.mts` consuming existing QAS feature JSONL.
- [x] Reject malformed/mixed request or workspace rows rather than padding identity/revisions.
- [x] Keep exact promotion upstream; this report does not fetch or invent evidence.
- [ ] Bind structural locator into `QueryAdaptiveFeatureRowV1` after canonical identity acceptance.
- [ ] Add same-request exact-top-k/evidence-promotion receipt linkage.
- [ ] Add recursion-decision evaluation: direct retrieval vs bounded RLM vs parallel sub-RLM.

## RLM-ACE-04 — Daily Graphify

- [x] Wire read-only RLM/ACE receipt after daily QAS proof/evaluation.
- [x] Failure/deferred RLM/ACE reporting never blocks canonical Graphify completion.
- [ ] Production owner reachability remains `graphify:daily -> GraphifyStructuralMaterializer -> AstProvider -> 8095 -> canonical persistence`.
- [ ] Feed routing receipt into recommendation/Kanban only through existing receipt owner.
- [ ] Add durable execution-outcome linkage before ACE learns reuse utility.

## RLM-ACE-05 — OpenSpec/git-diff recommendation audit

- [x] Add deterministic read-only OpenSpec/git-diff recommendation drafts.
- [ ] Join drafts to `OkfRecommendationV1` / recommendation evidence receipts before promotion.
- [ ] Compare accepted recommendations with later git/test/ExecutionReceipt outcomes.

## RLM-ACE-06 — BitFrost / Valkey residency

- [ ] Bind ACE hints to existing `LodPromotionDecisionV1`; no second residency contract.
- [ ] Prove `WARM/TURBO_4BIT -> HOT/FP16` only after snapshot/ordinal/TurboVec gates.
- [ ] Store revision-qualified hot references/routing metadata in Valkey; Postgres remains durable owner.
- [ ] Add stale workspace/source/representation/ordinal-map invalidation tests.
- [ ] Add hit/miss, reuse probability, byte cost, RSS and VRAM evidence before learned prefetch.

## RLM-ACE-07 — Retrieval and graph expansion

- [x] Add pure `RetrievalFanoutPlanV1` preserving one logical `semantic_768` lane across Qdrant/cuVS/CAGRA/TurboVec executors.
- [x] Model SOM/KMeans as routing only; KNN remains candidate retrieval.
- [x] Encode graph fanout as a bounded post-narrowing plan with seed count, depth and relation allowlist.
- [x] Default cuGraph execution off until runtime/parity is proven; Neo4j is a bounded projection executor, not truth.
- [x] Add `StructuralRoutingDecisionV1` that ranks canonical seeds, selects relevant n-ary hyperedges, and compiles the existing fanout contract without performing live retrieval.
- [ ] Bind live Qdrant payload filters for workspace/source/representation/domain/SOM/AST metadata.
- [ ] Bind live KMeans centroid membership and measure candidate reduction/recall against exact baseline.
- [ ] Bind Neo4j seed resolution through canonical symbolVersionId/treeNodeId, not filename/string guessing.
- [ ] Feed global PageRank/PPR/community/path signals into derived ranking features, never an independent fusion vote.

## RLM-ACE-08 — Structural identity promotion

- [x] Add `AstNodeLocatorV1` and separate revision-local `astNodeId`, structural node ID, stable `symbolId`, and revisioned `symbolVersionId` derivations.
- [x] Extend 8095 TypeScript client contract to preserve optional native IDs, node type, signature, named flag, raw/named AST paths, parent paths/type, child ordinals, depth, and grammar revision.
- [x] Upgrade normalization to prefer exact grammar+AST-path coordinates and explicitly mark `UPSTREAM_NATIVE` or `SPAN_FALLBACK` when the sidecar has not supplied exact paths.
- [x] Never use fallback structural coordinates as canonical acceptance proof.
- [ ] Upgrade the live 8095 Python facade to actually emit grammar revision, signature, named flag, AST child-index paths and parent paths. Current latest-main facade preserves native Consiliency IDs/parent route, but these exact fields still require producer work.
- [ ] Add canonical persistence resolver: exact existing version -> stable symbol -> approved alias -> structural fingerprint -> AMBIGUOUS/fail closed.
- [ ] Persist/read back `symbolId <-> symbolVersionId <-> astNodeId <-> packetKey(s)` using existing canonical Postgres/Drizzle owner.
- [ ] Resolve normalized CALLS/REFERENCES/TYPE/TEST edges to canonical IDs before Neo4j/cuGraph projection.

## RLM-ACE-09 — N-ary hypergraph

- [x] Add `StructuralHyperedgeV1` for genuinely n-ary facts such as call binding, type constraints, diagnostic context, test coverage, ontology assertions and retrieval promotion.
- [x] Preserve participant role + ordinal; do not destroy n-ary meaning by making pairwise edges the canonical representation.
- [x] Add focused fixture proof for a five-participant type-constraint hyperedge.
- [x] Add hyperedge-aware structural seed selection; hyperedges participate after candidate narrowing and never replace ordinary AST/CALLS binary edges.
- [ ] Project hyperedges to Neo4j using event/hyperedge nodes plus participant-role edges for traversal; keep Postgres/OKF event contract canonical.
- [ ] Add Qdrant payload references to relevant hyperedge/event IDs for filtered semantic retrieval, not full hypergraph truth duplication.
- [ ] Add hyperedge-derived ranking features: diagnostic overlap, type-constraint proximity, test coverage proximity, event breadth.

## RLM-ACE-10 — AST relational selection

- [x] Add bounded `AstNodeSelectorV1` / `AstTraversalPlanV1` with parent, child, ancestor, descendant, sibling, calls, called-by, reference, type, test and diagnostic relations.
- [x] Use named-node-first traversal and explicit max-depth/top-k/visited-node limits; selector relations are query policy, not structural identity.
- [x] Allow a bounded `has` clause analogous to relational selection without exposing arbitrary recursive Cypher to the RLM.
- [ ] Compile selector plans against the canonical AST adjacency owner after `astNodeId` persistence/readback is proven.
- [ ] Measure relation-selection utility from execution receipts before learned edge-picking is promoted.

## RLM-ACE-11 — Storage/index experiments after correctness gates

- [ ] PostgreSQL AIO, pgvector, and bitmap-index work remains benchmark/proof until ownership/parity is measured.
- [ ] Qdrant tags/payload filters remain projection metadata; no collection per SOM cell/domain/agent.
- [ ] TurboVec uses canonical ordinal map; compressed local IDs never replace packet/symbol identity.
- [ ] Bitmap/BitFrost bucket warming derives from canonical identity + revisions and remains rebuildable.
- [ ] GPU top-K/KMeans/SOM bindings consume existing bridge contracts and emit parity/ordinal receipts before production promotion.

## Current safe order

```text
8095 exact AST coordinates
  -> structural identity promotion
  -> Postgres identity readback
  -> QAS structural locator
  -> broad Qdrant/KNN candidate recall
  -> KMeans/SOM routing hints
  -> exact sampling/top-k promotion
  -> bounded Neo4j/hypergraph fanout
  -> bounded AST relational selection
  -> RLM navigation
  -> ContextManifest synthesis prefill
  -> DAG candidates
  -> execution/validation receipt
  -> Kanban recommendation outcome
  -> ACE/BitFrost measured prefetch + LOD policy
```
