# Parent Atlas Feature Intelligence — Tasks

## P0 — Canonical boundary

- [x] FI-01 Define `FeatureV1`, `FeatureCandidateV1`, `FeatureEvidenceV1`, `FeatureStateV1`, `FeatureStateReceiptV1` and canonical `FeatureRelationshipV1` relationship/arity contracts.
- [ ] FI-02 Add stable `feature_id` / `feature_key` registry with revision semantics.
- [ ] FI-03 Add evidence identity normalization and canonical promotion.
- [ ] FI-04 Add Postgres migrations/materializers for canonical features, evidence edges, relationships/hyperedges and state receipts.

## P0 — Evidence ingestion

- [ ] FI-05 Parse OpenSpec requirements, scenarios, change proposals and task checklists.
- [ ] FI-06 Parse Spec Kit `.specify` artifacts when present without making them canonical authority.
- [ ] FI-07 Parse markdown headings, task checkboxes and tables into structured evidence candidates.
- [ ] FI-08 Parse `package.json`/lockfiles into package capability candidates and distinguish installed from wired.
- [ ] FI-09 Parse schema/migrations into table, column, FK, index and policy evidence.
- [ ] FI-10 Join AST/symbol/route/test evidence to feature candidates.
- [ ] FI-11 Add version-qualified external documentation evidence and version-mismatch flags.

## P1 — Feature evidence graph

- [ ] FI-12 Materialize typed Feature↔Evidence relations.
- [x] FI-13A Define explicit unary/binary/ternary/N-ary relationship semantics, participant roles, degree and cardinality contracts.
- [ ] FI-13B Persist canonical n-ary relationship/hyperedge records and member rows in Postgres.
- [ ] FI-13C Derive reversible pairwise graph projections from canonical n-ary relationships.
- [ ] FI-14 Project canonical graph snapshot to Neo4j and NetworkX/cuGraph with parity receipts.
- [ ] FI-15 Compute PageRank/fanout/blocking metrics by canonical `feature_id`; keep graph node degree separate from relationship degree.

## P1 — Retrieval reconciliation

- [ ] FI-16 Materialize Qdrant feature/evidence points with canonical IDs, revisions, domains and embedding metadata.
- [ ] FI-17 Add logical-lane candidate adapter for lexical/BM25, AST, semantic, graph and low-rank association.
- [ ] FI-18 Enforce one vote per logical lane regardless of executor count.
- [ ] FI-19 Add degraded-identity observability and exact promotion before fusion.
- [ ] FI-20 Add SVD/low-rank candidate generation over revisioned feature/evidence matrix; never promote relations without evidence inspection.

## P1 — State and Kanban

- [ ] FI-21 Define feature-class acceptance rubrics.
- [ ] FI-22 Compute separate completion and confidence scores.
- [ ] FI-23 Add staleness propagation from source/schema/dependency/test/runtime revisions.
- [ ] FI-24 Generate dynamic Kanban projection with `EVIDENCE_NEEDED`, `MISSING`, `SPECIFIED`, `IMPLEMENTING`, `VERIFY`, `VERIFIED`.
- [ ] FI-25 Generate recommendations from missing evidence, unresolved owners, failed validation and graph bottlenecks.
- [ ] FI-26 Add board revision diff/replay receipt.

## P2 — Current repository reconciliation

- [ ] FI-27 Seed known Atlas workstreams from existing Gate 12, PageRank, Qdrant/TurboVec, OKF and Parent Atlas scripts as evidence candidates, not completion claims.
- [ ] FI-28 Reconcile existing static Kanban/progress documents against current source/test/runtime evidence.
- [ ] FI-29 Produce first complete feature-state snapshot and compare it with historical phase-completion claims.
- [ ] FI-30 Add feature-specific QA packs for auth, forms, navigation, accessibility, performance and other applicable user-facing capabilities.

## Acceptance gates

- [ ] Canonical identity survives path/cluster/projection changes.
- [ ] Neo4j/NetworkX/cuGraph/Qdrant records round-trip to canonical feature/evidence/relationship IDs.
- [x] Recursive same-entity-type relationships can have multiple participants but degree 1.
- [x] Relationship degree is distinct from cardinality and graph node degree.
- [ ] Pairwise graph projection of an N-ary fact reconstructs the original canonical relationship ID.
- [ ] A checked markdown task alone cannot produce `VERIFIED`.
- [ ] PageRank changes priority but cannot directly change completion.
- [ ] Qdrant similarity changes retrieval candidates but cannot directly change completion.
- [ ] Current Kanban can be reconstructed from a pinned repository + evidence revision.
