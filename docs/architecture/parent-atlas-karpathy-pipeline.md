---
name: Parent Atlas Karpathy Pipeline
description: Root-level atlas orchestration that composes the SvelteKit graph, route, Neo4j, CouchDB, Redis, and Karpathy batch synthesis lanes.
type: project
tags:
  - atlas
  - karpathy
  - graphify
  - qdrant
  - neo4j
  - redis
---

# Parent Atlas Karpathy Pipeline

This pipeline treats `graphify:karpathy-batch` as the synthesis lane, not the whole system.

Keep the runtime order aligned with the current operator contract:
BM25 + concept activation -> spectra-g / Engram optional adapter ->
XGBoost formal reranker -> Neo4j contextual trees + HyperRAG packet RPC ->
Autoencoder / SOM latent topology -> native GEMM deferred.

Decision docs:
- `docs/atlas/xgboost-reranker-contract.md`
- `docs/atlas/native-gemm-deferral.md`

See also:
- `docs/atlas/xgboost-reranker-contract.md`
- `docs/atlas/native-gemm-deferral.md`

## Root Flow

1. Workspace discovery
2. Route import
3. Import and env maps
4. Qdrant payload tagging
5. Neo4j GraphRAG projection
6. CouchDB MapReduce rollups
7. Karpathy batch synthesis
8. Redis ACE cache sync
9. Offline synthesis / parent atlas promotion
10. Validation reports

## Staged Write Safety

To prevent accidental full-codebase mutations, writes are staged and must be enabled independently:

1.  **Generate Manifest**: `npm run atlas:manifest:create`
2.  **Validate Manifest**: `npm run atlas:manifest:validate`
3.  **Execute Staged Writes**:
    - Redis: `npm run atlas:redis:sync -- --write`
    - CouchDB: `npm run atlas:couchdb:mapreduce -- --write`
    - Qdrant: `npm run atlas:qdrant:tag -- --write --limit=1000`
    - Neo4j: `npm run atlas:neo4j:ingest -- --write --limit=500`

## Command Surface

- `npm run atlas:root:index`
- `npm run atlas:routes`
- `npm run atlas:imports`
- `npm run atlas:env`
- `npm run atlas:manifest:create`
- `npm run atlas:manifest:validate`
- `npm run atlas:qdrant:tag`
- `npm run atlas:neo4j:ingest`
- `npm run atlas:couchdb:mapreduce`
- `npm run graphify:karpathy-batch`
- `npm run atlas:redis:sync`
- `npm run atlas:offline:synthesis`
- `npm run atlas:validate`

## Rule

Dry-run is the default for write surfaces. Pass `--write` when you actually want to mutate Qdrant, Neo4j, CouchDB, or Redis. Use `--limit` and `--workspace` to scope writes during testing.
