# Parent Atlas OpenSpec Index

This directory is the canonical behavioral specification surface for Parent Atlas feature intelligence.

## Source-of-truth rule

OpenSpec requirements define **what must remain true**. Spec Kit and GSD-style planning artifacts may derive plans and execution slices from these requirements, but they must not become competing semantic authorities.

## Table of contents

### Existing runtime contract

- `openspec/specs/openspec/specs/parent-atlas-agentic-runtime/spec.md` — canonical authority, evidence-grounded repair, retrieval, DAG/KAG boundaries, replay and Kanban evidence.

### Feature intelligence contracts

1. `openspec/specs/atlas-feature-registry/spec.md`
   - stable `feature_id` / `feature_key`
   - feature labels and aliases
   - revision identity
   - canonical ownership

2. `openspec/specs/atlas-feature-evidence-graph/spec.md`
   - Feature → Requirement / Artifact / Route / Table / Symbol / PackageCapability / Test / RuntimeEvidence
   - n-ary evidence relations and hyperedges
   - evidence lineage and confidence

3. `openspec/specs/atlas-feature-state/spec.md`
   - completion and confidence are evidence-derived
   - PageRank/fanout/blocking/user-criticality are priority signals, not completion signals
   - revisioned feature state receipts

4. `openspec/specs/atlas-repository-evidence-ingestion/spec.md`
   - parse OpenSpec, Spec Kit, markdown tables/checklists, package manifests, schema metadata, source/AST, tests and runtime receipts
   - infer feature candidates without silently asserting implementation

5. `openspec/specs/atlas-retrieval-reconciliation/spec.md`
   - lexical/BM25, dense/Qdrant, graph/Neo4j, structural/AST and low-rank/SVD candidate lanes
   - one logical lane = one vote
   - exact identity promotion before fusion

6. `openspec/specs/atlas-kanban-materializer/spec.md`
   - dynamically rebuild current board from canonical evidence
   - states: EVIDENCE_NEEDED, MISSING, SPECIFIED, IMPLEMENTING, VERIFY, VERIFIED
   - 0–100 completion with explicit confidence and blockers

### Planning adapters

- `docs/atlas/spec-kit-adapter.md` — map OpenSpec requirements into Spec Kit-style Specify → Plan → Tasks → Implement artifacts.
- `docs/atlas/gsd-adapter.md` — map canonical feature state into small execution slices with receipts and verification.

## Feature intelligence flow

```text
REPOSITORY + DATABASE + DOCS + RUNTIME
                │
                ▼
        EvidenceCandidateV1[]
                │
                ▼
         FeatureCandidateV1[]
                │
                ▼
            FeatureV1
                │
                ▼
       FeatureEvidenceGraphV1
                │
       ┌────────┼─────────┐
       ▼        ▼         ▼
   retrieval  graph    low-rank
   evidence   impact   association
       └────────┼─────────┘
                ▼
          FeatureStateV1
                │
                ▼
        KanbanProjectionV1
```

## Important invariant

`phase completion != feature completion != application readiness`.

A feature may be highly central in PageRank, highly similar in Qdrant, or strongly associated in an SVD factor while still being unverified. Completion must be determined from acceptance evidence, not topology or similarity alone.
