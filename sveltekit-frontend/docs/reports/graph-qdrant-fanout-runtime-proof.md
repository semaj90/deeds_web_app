# Graph → Qdrant Fan-out Runtime Proof

- Status: DEGRADED
- Workspace revision: 5e088be9d4d54010b68c6cfc7c734672dac7a0e0
- Graph revision: 7dd56c374f3c54dbdd7e5b13c75428d15b387be2cbbe3b29f830414c7456e5d1
- Seed packet key: ace:packet:4978fbe089ec
- Seed source ref: src/routes/api/chat/+server.ts
- Neighbors: 1
- Canonical neighbors: 1
- Degraded neighbors: 0
- Qdrant projections: 1
- Process memberships: 0

## Stage timings

- qdrant_contract: 62ms [PASS]
- seed_candidates: 1326ms [PASS]
- seed_resolution: 8080ms [PASS]
- neo4j_fanout: 4169ms [PASS]
- canonical_identity_resolution: 678ms [PASS]
- qdrant_projection_lookup: 171ms [PASS]
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
- QDRANT_FANOUT_IDENTITY_ALIGNED: true
- QDRANT_FANOUT_LINEAGE_ALIGNED: false
- QDRANT_FANOUT_SEMANTIC_REPRESENTATION_ALIGNED: false
- QDRANT_FANOUT_IDENTITY_MISMATCH_COUNT: 0
- QDRANT_FANOUT_LINEAGE_GAP_COUNT: 1
- BM42_NOT_REQUIRED: true
- PROCESS_PACKET_LANE_UNCHANGED: true
- SEED_CANONICAL_MATCH: true
- NO_DUPLICATE_IDENTITY_RESOLVER: true
