# Feature Card Semantics Report

Generated: 2026-05-26T23:03:58.613Z

Cards: 19  |  Feature cards: 19  |  Rich cards: 19

## Field Counts

### modules
- src/lib/server/atlas: 4
- src/lib/server/retrieval: 4
- scripts/atlas: 3
- src/lib/server/ace: 2
- src/lib/server/gpu: 2
- src/lib/server/kag: 2
- docs/atlas-index: 1
- scripts/atlas/detect-manifold-drift.mjs: 1
- scripts/graph/build-codebase-relationships.mjs: 1
- src/lib/server/ai: 1

### imports
- store:Postgres: 10
- store:Redis: 9
- route-feature-map: 6
- store:Qdrant: 5
- store:Neo4j: 4
- feature-label-registry: 2
- route-map: 2
- ContextDagSynthesis: 1
- ContextPacketBudgeter: 1
- CudaStreamManager: 1

### dependencies
- postgres registry: 10
- redis hot cache: 9
- route atlas: 6
- qdrant vector store: 5
- neo4j projection: 4
- import map: 2
- env mapping: 1
- feature cards: 1
- feature registry: 1
- gemma4 inference: 1

### languages
- TypeScript: 19
- JavaScript: 2
- JSON: 2
- Markdown: 1

### networking
- Postgres: 10
- Redis: 10
- Qdrant: 6
- Neo4j: 4
- HTTP: 1
- SvelteKit endpoints: 1

### offlineProcessing
- DuckDB: 3
- CouchDB: 2

### cache
- Redis hot cache: 9
- feature-map cache: 1
- Redis atlas cache: 1
- Redis graph cache: 1
- Redis route cards: 1

### inferenceFallbacks
- Gemma4 Opencode: 2
- CPU dependency analysis: 1
- CPU fallback: 1
- CPU rerank fallback: 1
- Graceful fallback: 1
- static route analysis: 1

## Multi Query

### feature-lane
- query: feature labels modules imports dependencies languages networking
- feature-map:import-atlas (feature) [2.823]
- feature-map:gpu-compute-plane (feature) [1.956]
- feature-map:hyperrag-fusion (feature) [1.955]
- feature-map:atlas-reconciliation (feature) [1.954]
- feature-map:ace-envelope (feature) [1.953]
- feature-map:hypergraph-4d (feature) [1.953]
- feature-map:ingestion-layer (feature) [1.953]
- feature-map:legal-product (feature) [1.953]
- feature-map:feature-atlas (feature) [1.952]
- feature-map:karpathy-blend (feature) [1.952]

### offline-lane
- query: duckdb couchdb offline processing cache export
- feature-map:feature-atlas (feature) [4.952]
- feature-map:import-atlas (feature) [4.823]
- feature-map:route-map (feature) [3.952]
- feature-map:gpu-compute-plane (feature) [1.956]
- feature-map:hyperrag-fusion (feature) [1.955]
- feature-map:atlas-reconciliation (feature) [1.954]
- feature-map:ace-envelope (feature) [1.953]
- feature-map:hypergraph-4d (feature) [1.953]
- feature-map:karpathy-blend (feature) [1.952]
- feature-map:trace-mcp (feature) [1.952]

### graph-lane
- query: neo4j imports dependency chain graph projection
- feature-map:import-atlas (feature) [5.823]
- feature-map:hyperrag-fusion (feature) [3.955]
- feature-map:context-dag (feature) [3.541]
- feature-map:legal-product (feature) [2.953]
- feature-map:gpu-compute-plane (feature) [1.956]
- feature-map:hypergraph-4d (feature) [1.953]
- feature-map:atlas-reconciliation (feature) [0.954]
- feature-map:ace-envelope (feature) [0.953]
- feature-map:ingestion-layer (feature) [0.953]
- feature-map:feature-atlas (feature) [0.952]

### inference-lane
- query: gemma4 opencode inference fallback cache
- feature-map:legal-product (feature) [4.953]
- feature-map:feature-atlas (feature) [4.952]
- feature-map:gpu-compute-plane (feature) [2.956]
- feature-map:route-map (feature) [2.952]
- feature-map:import-atlas (feature) [2.823]
- feature-map:hyperrag-fusion (feature) [1.955]
- feature-map:atlas-reconciliation (feature) [1.954]
- feature-map:ace-envelope (feature) [1.953]
- feature-map:hypergraph-4d (feature) [1.953]
- feature-map:karpathy-blend (feature) [1.952]

### realtime-lane
- query: svelte-realtime stream sse live update
- feature-map:ace-envelope (feature) [1.953]
- feature-map:karpathy-blend (feature) [1.952]
- feature-map:cuda-streams (feature) [1.54]
- feature-map:gpu-compute-plane (feature) [0.956]
- feature-map:hyperrag-fusion (feature) [0.955]
- feature-map:atlas-reconciliation (feature) [0.954]
- feature-map:hypergraph-4d (feature) [0.953]
- feature-map:ingestion-layer (feature) [0.953]
- feature-map:legal-product (feature) [0.953]
- feature-map:feature-atlas (feature) [0.952]

### inspector-lane
- query: svelte-inspector inspector inspecter debug
- feature-map:gpu-compute-plane (feature) [0.956]
- feature-map:hyperrag-fusion (feature) [0.955]
- feature-map:atlas-reconciliation (feature) [0.954]
- feature-map:ace-envelope (feature) [0.953]
- feature-map:hypergraph-4d (feature) [0.953]
- feature-map:ingestion-layer (feature) [0.953]
- feature-map:legal-product (feature) [0.953]
- feature-map:feature-atlas (feature) [0.952]
- feature-map:karpathy-blend (feature) [0.952]
- feature-map:route-map (feature) [0.952]

## Recommendations

### Keep rich feature-card fields aligned across generators
- priority: medium
- details: 19 feature cards already carry modules/imports/dependencies and lane metadata. Keep the contract stable so later multi-query passes can reuse it.
- nextAction: Use this report as the input contract for any new offline DuckDB or CouchDB mirror.
- sourceRefs: `feature-map:gpu-compute-plane`, `feature-map:hyperrag-fusion`, `feature-map:atlas-reconciliation`, `feature-map:ace-envelope`, `feature-map:hypergraph-4d`, `feature-map:ingestion-layer`, `feature-map:legal-product`, `feature-map:feature-atlas`, `feature-map:karpathy-blend`, `feature-map:route-map`
### Keep offline lanes explicit but non-blocking
- priority: low
- details: 4 cards already signal offline or fallback lanes. Keep those as evaluated paths rather than request-path dependencies.
- nextAction: Mirror the same cards into offline stores later, then keep runtime reads on the authoritative Postgres/Redis path.
- sourceRefs: `feature-map:legal-product`, `feature-map:feature-atlas`, `feature-map:route-map`, `feature-map:import-atlas`