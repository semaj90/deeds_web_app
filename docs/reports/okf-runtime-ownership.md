# Parent Atlas OKF runtime ownership audit

Generated: 2026-08-14T20:04:14.564Z
Status: PROVEN_READ_ONLY_AUDIT
Files scanned: 26820

| Capability | Expected role | Classification | Status | Anchor evidence |
| --- | --- | --- | --- | --- |
| DomainClassificationV1 | CANONICAL_OWNER | CANONICAL_OWNER | MULTIPLE_ANCHORS_REVIEW | sveltekit-frontend/src/lib/server/atlas/contracts/feature-extraction-v1.ts<br>sveltekit-frontend/src/lib/server/atlas/contracts/okf-cross-domain-v1.ts |
| Taxonomy/domain taxonomy | CANONICAL_OWNER | CANONICAL_OWNER | ANCHOR_FOUND_UNPROVEN_LIVE | sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts |
| OntologyLinkedTupleV1 | CANONICAL_OWNER | CANONICAL_OWNER | ANCHOR_FOUND_UNPROVEN_LIVE | sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts |
| FeatureMatrixRowV1 | CANONICAL_OWNER | CANONICAL_OWNER | MULTIPLE_ANCHORS_REVIEW | sveltekit-frontend/src/lib/server/atlas/feature-matrix-schema.ts<br>sveltekit-frontend/src/lib/server/atlas/contracts/feature-extraction-v1.ts |
| CandidateFeatureMatrix | DERIVED_VIEW | DERIVED_VIEW | ANCHOR_FOUND_UNPROVEN_LIVE | sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.ts |
| Recommendation/Kanban | RECOMMENDATION_SURFACE | RECOMMENDATION_SURFACE | ANCHOR_FOUND_UNPROVEN_LIVE | sveltekit-frontend/src/lib/server/atlas/board/daily-graphify-board-recommendations.ts |
| PostgreSQL canonical storage | CANONICAL_OWNER | CANONICAL_OWNER | ANCHOR_FOUND_UNPROVEN_LIVE | sveltekit-frontend/src/lib/server/db/schema-postgres.ts |
| pgvector | PROJECTION_OWNER | EXPERIMENTAL | EVIDENCE_FOUND_UNPROVEN | none |
| PostgreSQL AIO | RUNTIME_EXECUTOR | EXPERIMENTAL | EVIDENCE_FOUND_UNPROVEN | none |
| Bitmap/table indexing | RUNTIME_EXECUTOR | EXPERIMENTAL | EVIDENCE_FOUND_UNPROVEN | none |
| PyTorch/LibTorch | RUNTIME_EXECUTOR | EXPERIMENTAL | EVIDENCE_FOUND_UNPROVEN | none |
| Qdrant | PROJECTION_OWNER | EXPERIMENTAL | EVIDENCE_FOUND_UNPROVEN | none |
| Neo4j GDS/graphdatascience | RUNTIME_EXECUTOR | EXPERIMENTAL | EVIDENCE_FOUND_UNPROVEN | none |
| Valkey/Redis cache | CACHE | EXPERIMENTAL | EVIDENCE_FOUND_UNPROVEN | none |
| LangChain | OPTIONAL_INTEGRATION | OPTIONAL_INTEGRATION | EVIDENCE_FOUND_UNPROVEN | none |
| Deep Agents | OPTIONAL_INTEGRATION | OPTIONAL_INTEGRATION | EVIDENCE_FOUND_UNPROVEN | none |
| LangGraph | OPTIONAL_INTEGRATION | OPTIONAL_INTEGRATION | EVIDENCE_FOUND_UNPROVEN | none |
| OpenWiki | OPTIONAL_INTEGRATION | OPTIONAL_INTEGRATION | EVIDENCE_FOUND_UNPROVEN | none |
| GPU feature/tensor adapters | PROJECTION_OWNER | EXPERIMENTAL | EVIDENCE_FOUND_UNPROVEN | none |

This is a static, read-only ownership inventory. It does not install packages, call endpoints, write canonical data, or promote ownership.
