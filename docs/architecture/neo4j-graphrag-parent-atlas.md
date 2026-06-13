---
name: Neo4j GraphRAG Parent Atlas
description: Neo4j projection layer for parent atlas multi-hop traversal and feature graph analysis.
type: project
tags:
  - neo4j
  - graphrag
  - atlas
---

# Neo4j GraphRAG Parent Atlas

Neo4j is the traversal authority for the parent atlas.

It sits after storage tiering, optional deeds/engram memory hints,
retrieval telemetry, and the formal XGBoost reranker. It does not replace
those layers.

## Owns

- File to file import edges
- Route to implementation edges
- Feature and cluster relations
- Datastore usage edges

## Does Not Own

- Raw code bodies
- Hidden reasoning
- Hot cache records
- Ranking contract selection
