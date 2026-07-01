# HyperRAG Runtime Proof

Generated: 2026-07-01T04:39:18.695Z
Status: **PASS-DEGRADED**

## Identity

- trace_id: `1782880757094-ptpb12v`
- run_id: `1782880757094-ptpb12v`
- retrieval_strategy: `fusion`
- cache_status: `redis_exact_match`
- graph_stage: `GRAPH_ENABLED`
- latency_ms: 1598

## Contributors

| Lane | Hits |
|---|---|
| BM25/FTS | 10 |
| Qdrant vector | 7 |
| Neo4j graph | 11 |
| TurboVec | 0 |
| RRF final | 10 |

## Degraded Services

- turbovec: DEGRADED

## Pass Conditions

- **PASS-DEGRADED**

## Top Packets

### Packet 1: `packet:397dc52f4ccc`
- source_ref: sveltekit-frontend/src/lib/server/ai/context-compression.ts
- feature_id: sveltekit-frontend.context-compression
- fusion_sources: ["postgres_trigram"]
- retrieval_lanes: dense=0.0164 fts=0.4125 jsonb=0
- graph_stage: GRAPH_ENABLED
### Packet 2: `packet:f4a8413a566f`
- source_ref: sveltekit-frontend/src/lib/server/observability/langfuse.ts
- feature_id: sveltekit-frontend.langfuse
- fusion_sources: ["qdrant_vector"]
- retrieval_lanes: dense=0.0164 fts=0.3781 jsonb=0
- graph_stage: GRAPH_ENABLED
### Packet 3: `packet:397dc52f4ccc`
- source_ref: sveltekit-frontend/src/lib/server/ai/context-compression.ts
- feature_id: sveltekit-frontend.context-compression
- fusion_sources: ["postgres_trigram"]
- retrieval_lanes: dense=0.0161 fts=0.4125 jsonb=0
- graph_stage: GRAPH_ENABLED

## Provenance Sample

- [0] `packet:f4a8413a566f` from=hyperrag conf=0.65 kag=false dag=true
- [1] `packet:397dc52f4ccc` from=hyperrag conf=0.65 kag=false dag=true
- [2] `packet:f4a8413a566f` from=hyperrag conf=0.65 kag=true dag=true

## Recommended Patches

- turbovec: start TurboVec service or accept PASS-DEGRADED
