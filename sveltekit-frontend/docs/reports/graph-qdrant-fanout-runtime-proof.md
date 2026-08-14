# Graph → Qdrant Fan-out Runtime Proof

- Status: PROVEN
- Workspace revision: 1e07a730addf5f853ca740bb3cbf2decddd5ad87
- Graph revision: 7dd56c374f3c54dbdd7e5b13c75428d15b387be2cbbe3b29f830414c7456e5d1
- Seed packet key: ace:packet:4978fbe089ec
- Seed source ref: src/routes/api/chat/+server.ts
- Neighbors: 1
- Canonical neighbors: 1
- Degraded neighbors: 0
- Qdrant projections: 1
- Process memberships: 0

## Stage timings

- qdrant_contract: 64ms [PASS]
- seed_candidates: 1402ms [PASS]
- seed_resolution: 846ms [PASS]
- neo4j_fanout: 1579ms [PASS]
- canonical_identity_resolution: 659ms [PASS]
- qdrant_projection_lookup: 177ms [PASS]
- graph_evidence_assembly: 0ms [PASS]
- process_membership: 0ms [PASS]
- receipt: 0ms [PASS]

## Checks

- TREE_NODE_ID_NOT_CANONICAL: true
- NEO4J_INTERNAL_ID_NOT_CANONICAL: true
- QDRANT_POINT_ID_NOT_CANONICAL: true
- GRAPH_NEIGHBOR_CANONICAL_IDENTITY_PRESERVED: true
- GRAPH_FANOUT_BOUNDED: true
- GRAPH_EVIDENCE_PRESERVED: true
- QDRANT_CONTENT_VECTOR_CONTRACT_768: true
- BM42_NOT_REQUIRED: true
- PROCESS_PACKET_LANE_UNCHANGED: true
- SEED_CANONICAL_MATCH: true
- NO_DUPLICATE_IDENTITY_RESOLVER: true
