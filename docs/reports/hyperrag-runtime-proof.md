# HyperRAG Runtime Proof

Generated: 2026-06-23T03:17:55.351Z
Status: **PASS-DEGRADED**

## Identity

- trace_id: `1782184671302-6uovrzk`
- run_id: `1782184671302-6uovrzk`
- retrieval_strategy: `fusion`
- cache_status: `redis_exact_match`
- graph_stage: `GRAPH_ENABLED`
- latency_ms: 4047

## Contributors

| Lane | Hits |
|---|---|
| BM25/FTS | 10 |
| Qdrant vector | 2 |
| Neo4j graph | 11 |
| TurboVec | 0 |
| RRF final | 10 |

## Degraded Services

- turbovec: DEGRADED

## Pass Conditions

- **PASS-DEGRADED**

## Top Packets

### Packet 1: `nes:utility:9fa84252`
- source_ref: src/lib/types/svelte5-api-types.d.ts
- feature_id: utility
- fusion_sources: ["qdrant_vector"]
- retrieval_lanes: dense=0.0164 fts=0.9000 jsonb=1
- graph_stage: GRAPH_ENABLED
### Packet 2: `nes:utility:8c023912`
- source_ref: src/lib/components/ui/gaming/types/gaming-types-minimal.ts
- feature_id: utility
- fusion_sources: ["qdrant_vector"]
- retrieval_lanes: dense=0.0154 fts=1.0000 jsonb=1
- graph_stage: GRAPH_ENABLED
### Packet 3: `hyperrag:src/lib/services/error-analysis/types.ts`
- source_ref: src/lib/services/error-analysis/types.ts
- feature_id: codebase-structure
- fusion_sources: []
- retrieval_lanes: dense=0.0000 fts=0.8000 jsonb=1
- graph_stage: GRAPH_ENABLED

## Provenance Sample

- [0] `nes:utility:9fa84252` from=hyperrag conf=0.85 kag=true dag=true
- [1] `nes:utility:9fa84252` from=hyperrag conf=0.85 kag=true dag=true
- [2] `nes:utility:8c023912` from=hyperrag conf=0.85 kag=true dag=true

## Recommended Patches

- turbovec: start TurboVec service or accept PASS-DEGRADED
