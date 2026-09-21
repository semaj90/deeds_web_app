# Parent Atlas Feature Intelligence — Tasks

## Status rule

A checked item means the named contract/code slice exists on this branch. Runtime application, live database proof, projection parity, and benchmark gates remain separate acceptance requirements and are not implied by code existence.

## 2026-09-05 — Feature ontology projection alignment

- [x] **FI-ONTO-01** Reuse canonical `FeatureV1` for the behavioral feature node
  (`feature_id`, `feature_key`, domain, parent feature, and revisions); do not
  reinterpret it as a file, packet, row, or retrieval identity.
- [x] **FI-ONTO-02** Add the derived `FeatureDefinitionProjectionV1`,
  `FeatureImplementationBindingV1`, and `FeatureDependencyEdgeV1` contracts in
  `packages/parent-atlas/src/core/feature-ontology-projection-v1.ts`. Bindings
  require `source_ref`, `source_revision`, evidence, and an optional existing
  `symbol_version_id`/`tree_node_id`; dependency edges are typed relationships,
  not alternate feature identity.
- [x] **FI-ONTO-03** Add deterministic contract tests and the read-only proof
  runner `scripts/atlas/prove-feature-ontology-projection-v1.mjs`.
  Receipt: `docs/reports/feature-ontology-projection-proof-v1.json`.
- [ ] **FI-ONTO-04** Reconcile live feature registry and implementation bindings
  against PostgreSQL and current AST/symbol/route/test evidence. This remains
  open: the new projection is implemented and fixture-proven, but it has not
  authorized or performed live canonical feature/materializer writes.
- [x] **FI-ONTO-05** Add the read-only `FEATURE-ONTOLOGY-CROSSWALK-01` adapter
  (`scripts/atlas/lib/feature-ontology-crosswalk-v1.mjs`) over the existing
  `feature_registry` shape. It derives domain/capability/kind/surface views and
  many-to-many implementation observations without fabricating feature identity,
  source revisions, dependency edges, or canonical authority.
- [ ] **FI-ONTO-06** Run the live crosswalk and reconcile each implementation
  binding to current AST/symbol/route/test evidence with exact source revisions;
  emit no canonical membership until the existing registry and evidence owners
  agree.

### FI-ONTO / FI-02 live migration-state finding — 2026-09-05

The read-only crosswalk and migration-owner audits agree that live registry
adoption is blocked by migration ownership, not by the ontology projection:

- `public.feature_registry` is absent in `legal_ai_db`.
- The full journaled `0024/0025` neighborhood is absent, including
  `feature_tasks` and `agent_progress_log`.
- `drizzle.__drizzle_migrations` exists but contains zero rows.
- `scripts/atlas/audit-atlas-migration-owners.mjs` classifies `feature_registry`
  as `MISSING_MANIFEST_REGISTRATION`; the Drizzle schema owner exists, while the
  competing manual SQL remains excluded from ownership.
- No migration was applied and no registry rows were created in this pass.

This does **not** close FI-02 or authorize applying `0024/0025`. The next
action is a migration-ledger/manifest decision using the existing owner, then a
separate authorized apply/readback proof. Until that happens, crosswalk output
must remain derived and `liveImplementationMembership = UNPROVEN`.


## P0 — Canonical boundary

- [x] FI-01 Define `FeatureV1`, `FeatureCandidateV1`, `FeatureEvidenceV1`, `FeatureStateV1`, `FeatureStateReceiptV1` and canonical `FeatureRelationshipV1` relationship/arity contracts.
- [ ] FI-02 Add stable `feature_id` / `feature_key` registry with revision semantics. **Schema/repository written; live migration + identity round-trip proof pending.** Read-only contract audit on 2026-08-31 confirms `public.feature_registry` is absent. Do not apply the competing manual proposals until migration-ledger reconciliation selects one owner.
- [ ] FI-03 Add evidence identity normalization and canonical promotion. **Bounded proposal eligibility contract exists in `packages/parent-atlas/src/core/feature-promotion-eligibility-v1.ts`; live canonical promotion remains blocked on FI-02 and exact evidence-store ownership.**
- [ ] FI-04 Add Postgres migrations/materializers for canonical features, evidence edges, relationships/hyperedges and state receipts. **Manual PostgreSQL 18 migration + transactional repository written; apply/readback proof pending.**

## P0 — Evidence ingestion

- [ ] FI-05 Parse OpenSpec requirements, scenarios, change proposals and task checklists.
- [ ] FI-06 Parse Spec Kit `.specify` artifacts when present without making them canonical authority.
- [ ] FI-07 Parse markdown headings, task checkboxes and tables into structured evidence candidates.
- [ ] FI-08 Parse `package.json`/lockfiles into package capability candidates and distinguish installed from wired.
- [ ] FI-09 Parse schema/migrations into table, column, FK, index and policy evidence.
- [ ] FI-10 Join AST/symbol/route/test evidence to feature candidates.
- [ ] FI-11 Add version-qualified external documentation evidence and version-mismatch flags.
- [ ] FI-11B Materialize `atlas_evidence_entities` from AST/schema/runtime/test/OpenSpec evidence. **Table/view/query-time neighborhood migration written; extractor/backfill + live proof pending.**

## P1 — Feature evidence graph

- [ ] FI-12 Materialize typed Feature↔Evidence relations.
- [x] FI-13A Define explicit unary/binary/ternary/N-ary relationship semantics, participant roles, degree and cardinality contracts.
- [ ] FI-13B Persist canonical N-ary relationship/hyperedge records and member rows in Postgres. **Header/member/cardinality/evidence tables + transactional writer exist; live migration/receipt pending.**
- [x] FI-13C1 Define a lossless relationship-node incidence projection and a reversible pairwise projection retaining `relationship_id`, roles and revision.
- [ ] FI-13C2 Materialize pairwise/incidence graph projections and prove reconstruction/parity against canonical Postgres facts.
- [ ] FI-14 Project canonical graph snapshot to Neo4j and NetworkX/cuGraph with parity receipts.
- [ ] FI-15 Compute PageRank/PPR/fanout/blocking metrics by canonical `feature_id`; keep graph node degree separate from relationship degree. **Deterministic CPU incidence-PPR reference + receipt written; live/cross-backend proof pending.**

## P1 — N-ary retrieval / HyperGraphRAG

- [x] FI-16A Define `CandidateFabricV1` with entity, relationship and evidence candidate families.
- [x] FI-16B Define `RelationshipCandidateV1` and `RelationshipEmbeddingProjectionV1` (`semantic_768`) without making vector identity canonical.
- [x] FI-16C Define dynamic query-scoped hyperedge candidates that cannot self-promote to canonical relationships.
- [x] FI-16D Define bounded entity → hyperedge → entity reasoning chains with max-hop/fanout budgets and semantic/PPR confidence hooks.
- [x] FI-16E Define deterministic sufficient-context states/actions so the DAG retrieves a missing evidence class or synthesizes.
- [x] FI-16F Define ACE hypergraph payload with typed participants, relationship evidence, reasoning chain, sufficiency decision and projection lineage.
- [x] FI-16G Define a dependency-injected second-stage hypergraph fusion facade over existing first-stage candidates.
- [x] FI-16G2 Add query-conditioned relationship selection using semantic relevance, PPR, relation/extraction confidence, evidence coverage and expected relation type. **Test written; execution proof pending.**
- [x] FI-16G3 Accept first-stage `family=relationship` candidates through an exact canonical relationship resolver hook; add PostgreSQL `findCanonicalRelationshipsByIds()` helper.
- [ ] FI-16H Wire `HyperRagFusionService` to the Parent Atlas package and expose the N-ary facade on the live search/API path. **The HyperRAG API now has an explicit `useGraph=true` read-only bridge through `@deeds/parent-atlas`, the PostgreSQL feature-intelligence repository, and the existing fusion boundary. It admits only exact current canonical hits and reports unavailable/degraded results without changing primary retrieval. Live production relationship rows and end-to-end API readback remain unproven.**
- [ ] FI-16I Add query-conditioned PPR executor over relationship/incidence candidates and write revisioned receipts. **The existing deterministic CPU PPR executor is now injectable into the HyperGraph fusion facade and its receipt is returned with the fusion result; cuGraph/Neo4j parity and live current-corpus receipt remain pending.**
- [ ] FI-16J Add dynamic SQL hyperedge construction from canonical shared-entity/evidence joins and promotion review. **`atlas_evidence_entities`, event-hyperedge view, bounded SQL neighborhood function, TS reader, and a pure fail-closed promotion-review receipt are written; extractor/backfill, live evidence review, canonical materializer, and live readback remain pending. Dynamic candidates remain `promotable=false` and `writes_performed=false`.**
- [x] FI-16K Add executable ACE hypergraph packet fixture covering canonical entity seed + direct relationship candidate + typed evidence chain + sufficient-context synthesis gate. **Test source written; not executed in this connector session.**
- [ ] FI-16L Attach `AceHypergraphPayloadV1` to the existing `CanonicalAcePacketEnvelope` / `HyperRAGPacketPipeline` materialization path under a versioned optional field; keep packet identity unchanged. **Explicit optional `aceHypergraph` input and revision fail-closed guard are wired; the live HyperRAG API now exposes additive facade payloads through the same package boundary. Focused packet materialization and live DB readback remain pending.**
- [ ] FI-16M Add retrieval-action receipt for every `NEED_* -> DAG action -> new evidence -> sufficiency re-evaluation` loop.

## P1 — Retrieval reconciliation

- [ ] FI-17 Materialize Qdrant feature/evidence/relationship points with canonical IDs, revisions, domains and embedding metadata. **Postgres relationship vector(768)+HNSW surface written; Qdrant/CAGRA projection pending.**
- [ ] FI-18 Add logical-lane candidate adapter for lexical/BM25, AST, semantic, graph and low-rank association.
- [x] FI-19 Enforce one vote per logical lane regardless of executor count. **`CandidateFabricV1` and ACE payload encode `semantic_lane_votes = 1`; `mergeAndRank()` now collapses duplicate IDs within each lane before assigning RRF ranks. Focused multi-lane tests pass.**
- [ ] FI-20 Add degraded-identity observability and exact promotion before fusion. **The new n-ary fusion input is fail-closed on workspace/source/query revision mismatch and can only enrich an existing hit; full canonical identity adoption across all live lanes remains open.**
- [ ] FI-21 Add SVD/randomized-low-rank/leverage-sampling candidate generation over a revisioned feature/evidence matrix; never promote relations without evidence inspection.
- [ ] FI-21B Add exact multi-view rerank after future MUVERA/FDE candidate nomination; FDE/ANN is nomination only, original views remain rerank/evidence inputs.

## P1 — Derived feature matrix / model-routing projections

- [x] FI-22A Define revisioned `FeatureMatrixRowV1` keyed by canonical `feature_id` with lexical/AST/coverage/topology/state signals.
- [x] FI-22B Define multi-view feature projections (semantic/structural/requirement/runtime/relationship/token) and optional fixed-dimensional-encoding refs for future MUVERA-like candidate nomination.
- [x] FI-22C Define low-rank association candidates with mandatory evidence inspection and `canonical_relationship_created=false`.
- [x] FI-22D Define derived 4-D SOM/semantic/activity coordinates and SO(4) left/right quaternion routing transforms; canonical authority is always false.
- [ ] FI-22E Materialize revisioned feature matrices from existing packet/features/metrics/graph snapshots.
- [ ] FI-22F Wire TurboVec, SVD/low-rank, KMeans/SOM, XGBoost and CrossEncoder outputs into derived feature rows with receipts.
- [ ] FI-22G Add QLoRA dataset selection/export from verified canonical evidence + derived feature rows; derived manifold/rotation values may guide sampling but cannot become labels/truth.

## P1 — State and Kanban

- [ ] FI-23 Define feature-class acceptance rubrics.
- [ ] FI-24 Compute separate completion and confidence scores.
- [ ] FI-25 Add staleness propagation from source/schema/dependency/test/runtime revisions.
- [ ] FI-26 Generate dynamic Kanban projection with `EVIDENCE_NEEDED`, `MISSING`, `SPECIFIED`, `IMPLEMENTING`, `VERIFY`, `VERIFIED`.
- [ ] FI-27 Generate recommendations from missing evidence, unresolved owners, failed validation and graph bottlenecks.
- [ ] FI-28 Add board revision diff/replay receipt.

## P2 — Current repository reconciliation

- [ ] FI-29 Seed known Atlas workstreams from existing Gate 12, PageRank, Qdrant/TurboVec, OKF and Parent Atlas scripts as evidence candidates, not completion claims.
- [ ] FI-30 Reconcile existing static Kanban/progress documents against current source/test/runtime evidence.
- [ ] FI-31 Produce first complete feature-state snapshot and compare it with historical phase-completion claims.
- [ ] FI-32 Add feature-specific QA packs for auth, forms, navigation, accessibility, performance and other applicable user-facing capabilities.

## Acceptance gates

- [ ] Canonical identity survives path/cluster/projection changes in live Postgres readback.
- [ ] Neo4j/NetworkX/cuGraph/Qdrant records round-trip to canonical feature/evidence/relationship IDs.
- [x] Recursive same-entity-type relationships can have multiple participants but degree 1.
- [x] Relationship degree is distinct from cardinality and graph node degree.
- [ ] Pairwise graph projection of an N-ary fact reconstructs the original canonical relationship ID in executed tests/parity receipts. **Test written; not executed in this connector session.**
- [ ] Incidence projection retains one relationship node plus every typed participant role in executed parity proof.
- [ ] Query-conditioned fanout selects the highest supported relation rather than relationship-ID order. **Test written; not executed.**
- [ ] CPU incidence-PPR is deterministic and cuGraph/Neo4j PPR matches within a declared tolerance. **CPU test written; cross-backend execution pending.**
- [ ] Dynamic SQL hyperedges cannot enter canonical relationship tables without promotion review.
- [ ] ACE packet construction produces canonical relationship IDs, typed participant roles, evidence refs, chain lineage and a sufficient-context decision. **End-to-end fixture written; execution pending.**
- [ ] A checked markdown task alone cannot produce `VERIFIED`.
- [ ] PageRank/PPR changes priority/routing but cannot directly change completion.
- [ ] Qdrant/pgvector/CAGRA/TurboVec similarity changes retrieval candidates but cannot directly change completion.
- [ ] SVD/low-rank/manifold/SO(4) derived signals cannot directly create canonical relationships.
- [ ] Sufficient-context gate prevents synthesis when required entity/relation/evidence classes are missing, stale or contradictory.
- [ ] Current Kanban can be reconstructed from a pinned repository + evidence revision.

## 2026-09-15 — Runtime fusion adoption slice

- **Fusion boundary updated:** `sveltekit-frontend/src/lib/server/features/rag/multi-lane-retrieval.ts`
  now collapses duplicate IDs within each logical lane before assigning RRF ranks,
  uses deterministic score/ID tie-breaking, and accepts optional HyperGraphRAG
  evidence only when workspace/source/query revisions all match. N-ary evidence
  is a bounded additive enrichment of an existing hit; it cannot create a hit or
  contribute another retrieval vote.
- **N-ary projection added:** `buildHypergraphFusionEvidenceV1()` in
  `sveltekit-frontend/src/lib/server/atlas/retrieval/hypergraph-retrieval-v1.ts`
  derives candidate-local relation/entity/evidence counts from intact n-ary
  relations and preserves the projection checksum.
- **Focused proof:** multi-lane fusion 5/5 and HyperGraphRAG retrieval 6/6
  passed; strict OpenSpec validation and scoped diff check passed.
- **Still open:** FI-16H live relationship-row/readback proof, FI-16I live
  PPR/backend parity, FI-16J extraction/backfill/promotion, FI-16L focused
  SvelteKit packet materialization, and FI-20 repository-wide canonical identity
  admission. No database, cache, Qdrant, Neo4j, or GPU writes were performed.
- **2026-09-15 dynamic hyperedge review boundary:** added
  `reviewDynamicHyperedgePromotionV1()` in
  `packages/parent-atlas/src/core/dynamic-hyperedge-sql.ts`. It requires the
  admitted source snapshot and reviewed evidence references, emits deterministic
  review checksums, and can only return `READY_FOR_EXPLICIT_MATERIALIZATION`;
  it cannot authorize, persist, or convert a dynamic relationship into a
  canonical relationship. Focused tests pass; live extractor/backfill and
  canonical materializer remain blocked.
- **2026-09-15 follow-up:** added
  `sveltekit-frontend/src/lib/server/atlas/integration/hyperrag-fusion-runtime-adapter-v1.ts`
  and its focused tests. The API invokes this adapter only when the caller
  explicitly supplies `useGraph=true` and an admitted `workspaceRevision`.
  Stale, degraded, or missing-identity hits are rejected; n-ary results are
  additive metadata and never new hits or RRF votes.
- **PPR follow-up:** the facade now optionally executes the existing CPU
  incidence-PPR owner before query-conditioned relationship ranking and returns
  its revisioned receipt. No GPU/Neo4j execution or persistence was added.
- **Pipeline comment:** NLP/LangExtract/Ornith/PyTorch and Naive Bayes/logistic/XGBoost
  outputs, `.okf` lookup validation, BM25 and PageRank are evidence/ranking inputs.
  HyperRAG n-ary adoption may annotate existing candidates with exact-revision
  relation context; it cannot mint IDs, invent pairwise edges, add votes, or
  authorize promotion.
- [ ] CANONICAL-IDENTITY-V1 POINTER (2026-09-21): canonical object identity (symbol/file/chunk discriminants, mandatory workspaceRevision + sourceRevision, no 'unknown'/latest-row inference, representation/execution/transport ids and CandidateOrdinal are NOT canonical identity) is owned by `CANONICAL-IDENTITY-V1-SPEC-01` in `openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md`. This change SHALL reference that contract and not define its own identity rules; it may add representation-, execution-, feature-, cache-, transport- or projection-specific identities only. Pointer only; no scope change here. Spec status: SPEC_DRAFT (not signed off).
