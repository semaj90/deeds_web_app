# Manifold4 Quality Control & Drift Detection

## Overview
As the codebase and manifold grow, maintaining consistency between embeddings, topological tags, and graph relationships becomes critical. This document outlines the mechanisms for quality control, drift detection, and feedback-driven refinement.

## Quality Control (Smoke Tests)
The system uses automated smoke tests to assert routing accuracy:
*   **Expected-Cluster Assertions**: Standard queries (e.g., "Redis") are checked against expected architectural clusters (e.g., 94, 72).
*   **Fail-Open Ladders**: Tests verify that the system cascades gracefully from strict filters to broader search when signal density is low.

## Drift Detection
The `detect-manifold-drift.mjs` script monitors for:
*   **Orphaned Points**: Qdrant vectors without `gpu_cluster` or `som_cluster` tags.
*   **Stale Embeddings**: Files in Postgres with missing or outdated topological metadata.
*   **Redis Consistency**: Checks for missing ACE cluster cards or task distillates for active retrieval paths.
*   **Neo4j Integrity**: Ensures all Qdrant clusters have corresponding nodes and relationships in the graph.

## Context Budgeting
To prevent "context bloat" in Gemma4, the `ContextPacketBudgeter` enforces strict limits:
*   **Task Playbooks**: Max 2.
*   **Cluster Cards**: Max 3.
*   **Graph Paths**: Max 8.
*   **Raw Chunks**: Max 12.
*   **Token Limit**: Max 12,000 tokens per synthesis request.

## Feedback Learning (`activity_w`)
The 4D manifold includes an `activity_w` axis that is updated based on real-world usage:
*   **Retrieval Hit Rate**: Frequency of a chunk appearing in successful searches.
*   **Answer Acceptance**: Positive user feedback on agentic synthesis.
*   **Recency Decay**: Temporal signal ensuring fresh code is prioritized over stale artifacts.

## Continuous Maintenance
*   **Weekly Pipeline**: Run `hypergraph:pipeline` to re-align centroids and tags.
*   **Daily Drift Check**: Integrated into the CI/CD pipeline to warn of metadata misalignment.
*   **Manual Annotation**: Use the `ROUTE_FEATURE_MAP` to refine high-precision routing for sensitive API routes.
