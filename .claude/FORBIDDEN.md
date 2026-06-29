# FORBIDDEN.md

## Core Rule
Never confuse:
1. Semantics
2. Topology
3. Ontology
4. Runtime telemetry
5. Storage
6. GPU acceleration
7. Agent behavior

These are independent layers.

## Forbidden Semantic Violations
- latent_64 is NOT semantic truth.
- SOM is NOT ontology.
- PageRank is NOT semantic relevance.
- Louvain communities are NOT ontology.
- Redis/Bifrost are NOT canonical truth.
- cuVS is NOT storage.
- Neo4j traversal alone does NOT determine answers.

## Forbidden Architecture Behavior
- Inventing schemas, RPCs, ports, or graph edges.
- Claiming future lanes are implemented.
- Unbounded repo rewrites.
- Automatic retraining.
- Deleting telemetry, traces, or cold storage.

All mutations require:
- safe command
- smoke command
- replay proof
