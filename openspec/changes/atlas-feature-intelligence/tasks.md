# Parent Atlas Feature Intelligence — Tasks

## Status rule

A checked item means the named contract/code slice exists on this branch. Runtime application, live database proof, projection parity, and benchmark gates remain separate acceptance requirements and are not implied by code existence.

## P0 — Canonical boundary

- [x] FI-01 Define `FeatureV1`, `FeatureCandidateV1`, `FeatureEvidenceV1`, `FeatureStateV1`, `FeatureStateReceiptV1` and canonical `FeatureRelationshipV1` relationship/arity contracts.
- [ ] FI-02 Add stable `feature_id` / `feature_key` registry with revision semantics. **Schema/repository written; live migration + identity round-trip proof pending.**
- [ ] FI-03 Add evidence identity normalization and canonical promotion.
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
- [ ] FI-16H Wire `HyperRagFusionService` to the Parent Atlas package and expose the N-ary facade on the live search/API path. **Root package links `@deeds/parent-atlas`; frontend live import/adoption remains unproven.**
- [ ] FI-16I Add query-conditioned PPR executor over relationship/incidence candidates and write revisioned receipts. **CPU reference executor/receipt written; cuGraph/Neo4j parity + live receipt pending.**
- [ ] FI-16J Add dynamic SQL hyperedge construction from canonical shared-entity/evidence joins and promotion review. **`atlas_evidence_entities`, event-hyperedge view, bounded SQL neighborhood function and TS reader written; extractor/backfill/apply/promotion workflow pending.**
- [x] FI-16K Add executable ACE hypergraph packet fixture covering canonical entity seed + direct relationship candidate + typed evidence chain + sufficient-context synthesis gate. **Test source written; not executed in this connector session.**
- [ ] FI-16L Attach `AceHypergraphPayloadV1` to the existing `CanonicalAcePacketEnvelope` / `HyperRAGPacketPipeline` materialization path under a versioned optional field; keep packet identity unchanged.
- [ ] FI-16M Add retrieval-action receipt for every `NEED_* -> DAG action -> new evidence -> sufficiency re-evaluation` loop.

## P1 — Retrieval reconciliation

- [ ] FI-17 Materialize Qdrant feature/evidence/relationship points with canonical IDs, revisions, domains and embedding metadata. **Postgres relationship vector(768)+HNSW surface written; Qdrant/CAGRA projection pending.**
- [ ] FI-18 Add logical-lane candidate adapter for lexical/BM25, AST, semantic, graph and low-rank association.
- [ ] FI-19 Enforce one vote per logical lane regardless of executor count. **`CandidateFabricV1` and ACE payload encode `semantic_lane_votes = 1`; existing runtime fusion still needs adoption proof.**
- [ ] FI-20 Add degraded-identity observability and exact promotion before fusion.
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
