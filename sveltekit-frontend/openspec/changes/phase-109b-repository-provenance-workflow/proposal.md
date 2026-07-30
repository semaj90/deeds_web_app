## Phase 109B Repository Provenance Workflow Proposal - 2026-07-30

## Why

The repository already contains many partial owners for parsing, retrieval, labeling, projection, GPU analysis, and evaluation. What is missing is one contract that describes how those stages fit together without collapsing authority into Qdrant, Redis, or a single embedding lane.

## What Changes

- Define a repository provenance workflow contract with 13 explicit stages
- Establish the separation between canonical authority, searchable projections, and derived observations
- Capture incremental invalidation rules so changed hashes recompute only affected outputs
- Record the query-time flow that combines lexical, semantic, structural, and graph lanes before reranking

## Capabilities

- `repository-snapshot-contract`
- `file-inventory-ledger`
- `deterministic-extraction-contract`
- `artifact-identity-resolution`
- `lexical-indexing-lane`
- `semantic-enrichment-lane`
- `relationship-construction-lane`
- `labeling-observation-lane`
- `gpu-analysis-lane`
- `projection-validation-lane`
- `retrieval-evaluation-lane`
- `incremental-update-invalidation`

## Non-goals

- No new canonical store beyond Postgres
- No deletion of historical records
- No attempt to make embeddings authoritative over structure or provenance
