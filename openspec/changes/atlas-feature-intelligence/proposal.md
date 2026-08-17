# Change Proposal: Parent Atlas Feature Intelligence Layer

## Why

Parent Atlas already has packet feature extraction, vector indexing, graph ranking, retrieval, clustering and orchestration primitives. Those mechanisms answer questions about packets and candidates, but they do not yet define a single canonical boundary for application feature identity and evidence-derived application state.

Without that boundary, phase completion, graph importance, retrieval relevance, checklist claims and actual verified feature readiness can be accidentally conflated.

## What changes

Introduce a canonical feature intelligence layer between packet/candidate extraction and task/Kanban generation:

```text
repository evidence
      ↓
FeatureCandidateV1[]
      ↓
FeatureV1
      ↓
FeatureEvidenceV1[]
      ↓
FeatureStateV1
      ↓
KanbanProjectionV1
```

This change also formalizes projection adapters for Postgres, Neo4j/NetworkX/cuGraph, Qdrant and low-rank feature matrices.

## Canonical authority

Postgres/Parent Atlas remains canonical for feature and evidence identity.

Qdrant, Neo4j, NetworkX/cuGraph, cached feature matrices and Kanban views are rebuildable projections.

## Non-goals

- Do not make PageRank a completion score.
- Do not create a second semantic authority in Spec Kit or GSD planning files.
- Do not let cluster IDs, Qdrant IDs or tree paths become feature IDs.
- Do not require QLoRA inference for deterministic repository facts.

## Initial implementation gates

- FI-01 canonical feature contracts and registry
- FI-02 repository evidence normalizer
- FI-03 feature/evidence identity promotion
- FI-04 Postgres materialization
- FI-05 graph + vector projection adapters
- FI-06 feature-state evaluator
- FI-07 dynamic Kanban materializer
- FI-08 parity/replay receipts
