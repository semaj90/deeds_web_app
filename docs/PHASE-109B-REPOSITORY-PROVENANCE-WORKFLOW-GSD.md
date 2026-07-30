# Phase 109B Repository Provenance Workflow GSD - 2026-07-30

**Status**: Draft
**Date**: July 30, 2026

## Executive Summary

The repository needs a provenance-aware code intelligence workflow that treats source files, external dependencies, derived summaries, embeddings, labels, and graph relationships as separate artifacts with shared identity and versioned provenance. The system must combine deterministic extraction with lexical retrieval, semantic retrieval, relationship construction, validation, and incremental invalidation.

This workflow is organized into 13 stages:

1. Repository snapshot
2. File inventory
3. Deterministic extraction
4. Identity resolution
5. Lexical indexing
6. Semantic enrichment
7. Relationship construction
8. Labeling
9. GPU analysis
10. Projection
11. Validation
12. Evaluation
13. Incremental updates

## Core Principles

- Postgres is canonical authority for identities, provenance, and persisted revision history.
- Qdrant mirrors searchable projections and must not become the only copy of truth.
- Lexical, semantic, and structural indexes are separate lanes and must not be collapsed into one representation.
- Labels are observations, not overwritten facts.
- Clusters and GPU outputs are suggestions until validated.
- Every derived artifact must keep source hash, repository revision, producer revision, and validity range.

## Stage Summary

| Stage | Purpose | Primary Output |
|---|---|---|
| 0 | Pin revision and dependencies | Snapshot manifest |
| 1 | Walk and classify files | File ledger |
| 2 | Parse structure and spans | Symbols, imports, routes, schemas |
| 3 | Reconcile identities | Stable artifact IDs |
| 4 | Build lexical signals | BM25/BM42-style symbol and token index |
| 5 | Derive semantic cards | Summaries and embeddings |
| 6 | Build relationships | Deterministic edges and hyperedges |
| 7 | Attach labels | Observations with provenance |
| 8 | Run GPU analysis | K-means, SOM, reranker features |
| 9 | Project to stores | Postgres, Qdrant, Neo4j, Redis |
| 10 | Validate consistency | Hash, parity, and coverage checks |
| 11 | Evaluate retrieval | Judgments and ranking metrics |
| 12 | Incrementally update | Recompute only affected artifacts |

## Query Flow

1. Parse the query and extract exact entities.
2. Search exact symbols and lexical evidence.
3. Search semantic embeddings.
4. Expand direct relationships with bounded graph hops.
5. Fuse ranked candidates.
6. Rerank a small candidate set.
7. Validate evidence and assemble a bounded ACE packet.

## Non-goals

- No single model replaces deterministic parsing, lexical search, and graph evidence.
- No stage may silently delete historical records.
- No GPU lane may overwrite canonical authority.
