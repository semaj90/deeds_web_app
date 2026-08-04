# Parent Atlas Recent-Change Completion Audit

- Generated: 2026-08-03T22:36:15.024Z
- Overall: **BLOCKED**

## Gates

| Order | ID | Gate | Status | Proof |
|---:|---|---|---|---|
| 1 | PA-PG-001 | PostgreSQL 18 canonical runtime | PARTIAL | RUNTIME_SMOKE_PROVEN |
| 2 | PA-PROJ-001 | Active Qdrant writer integration | FAIL | SOURCE_PRESENT |
| 3 | PA-PROJ-002 | Isolated packet projection proof | NOT_PROVEN | NOT_PROVEN |
| 4 | PA-PROJ-003 | Production Qdrant identity and duplicate safety | FAIL | PRODUCTION_DATA_PROVEN |
| 5 | PA-XGB-001 | XGBoost model and canonical cascade wiring | PARTIAL | RUNTIME_SMOKE_PROVEN |
| 6 | PA-SVC-001 | Model and NLP service discovery | PASS | RUNTIME_SMOKE_PROVEN |
| 7 | PA-EVAL-001 | EmbeddingGemma → exact oracle → CAGRA readiness | NOT_PROVEN | NOT_PROVEN |
| 8 | PA-RET-001 | Canonical retrieval completion chain | NOT_PROVEN | STATIC_WIRING_PROVEN |
| 9 | PA-OPS-001 | Graphify freshness | FAIL | PRODUCTION_DATA_PROVEN |

## Exact next task

**PA-PROJ-001 — Active Qdrant writer integration**

Patch the worker to call one pure strict builder, inject the collection name for tests, and exercise a real event-shaped fixture against an isolated proof collection.

## Recent Git changes


## PA-PG-001 — PostgreSQL 18 canonical runtime

**Status:** PARTIAL

Connected on 5432, server 18.4 (Debian 18.4-1.pgdg12+1).

```json
{
  "connection": {
    "database": "legal_ai_db",
    "schema": "public",
    "server_address": "172.18.0.23/32",
    "server_port": 5432,
    "server_version": "18.4 (Debian 18.4-1.pgdg12+1)",
    "search_path": "\"$user\", public"
  },
  "columns": [
    {
      "column_name": "packet_id",
      "data_type": "text",
      "is_nullable": "NO",
      "column_default": null
    },
    {
      "column_name": "artifact_id",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "packet_key",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "source_ref",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "source_ref_key",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "file_path",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "directory_path",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "feature_id",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "feature_label",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "community_id",
      "data_type": "integer",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "concept_ids",
      "data_type": "ARRAY",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "cluster_id",
      "data_type": "integer",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "embedding",
      "data_type": "USER-DEFINED",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "payload",
      "data_type": "jsonb",
      "is_nullable": "YES",
      "column_default": "'{}'::jsonb"
    },
    {
      "column_name": "metadata",
      "data_type": "jsonb",
      "is_nullable": "YES",
      "column_default": "'{}'::jsonb"
    },
    {
      "column_name": "permissions",
      "data_type": "jsonb",
      "is_nullable": "NO",
      "column_default": "'{\"source\": \"repo_index\", \"can_write\": false, \"can_export\": false, \"visibility\": \"internal\", \"can_execute\": false}'::jsonb"
    },
    {
      "column_name": "topology",
      "data_type": "jsonb",
      "is_nullable": "NO",
      "column_default": "'{}'::jsonb"
    },
    {
      "column_name": "vectors",
      "data_type": "jsonb",
      "is_nullable": "NO",
      "column_default": "'{}'::jsonb"
    },
    {
      "column_name": "summary",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "tags",
      "data_type": "ARRAY",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "byte_start",
      "data_type": "bigint",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "byte_end",
      "data_type": "bigint",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "sha256",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "source_kind",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "source_path",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "group_id",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "packet_universe",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": "'atlas'::text"
    },
    {
      "column_name": "qdrant_point_id",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "qdrant_collection",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "qdrant_vector_dim",
      "data_type": "integer",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "identity_lane",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": "'qdrant_chunk'::text"
    },
    {
      "column_name": "identity_confidence",
      "data_type": "double precision",
      "is_nullable": "YES",
      "column_default": "1.0"
    },
    {
      "column_name": "som_cluster",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "som_row",
      "data_type": "integer",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "som_col",
      "data_type": "integer",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "som_index",
      "data_type": "integer",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "kmeans_cluster",
      "data_type": "integer",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "pagerank",
      "data_type": "real",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "betweenness",
      "data_type": "real",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "eigenvector",
      "data_type": "real",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "neo4j_node_id",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "redis_centroid_key",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "latent_64",
      "data_type": "bytea",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "reward_prior",
      "data_type": "double precision",
      "is_nullable": "YES",
      "column_default": "0"
    },
    {
      "column_name": "created_at",
      "data_type": "timestamp with time zone",
      "is_nullable": "YES",
      "column_default": "now()"
    },
    {
      "column_name": "updated_at",
      "data_type": "timestamp with time zone",
      "is_nullable": "YES",
      "column_default": "now()"
    },
    {
      "column_name": "function_symbol",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "content_embedding_384",
      "data_type": "USER-DEFINED",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "embedding_status",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": "'pending'::text"
    },
    {
      "column_name": "embedding_timestamp",
      "data_type": "timestamp with time zone",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "extracted_entities",
      "data_type": "jsonb",
      "is_nullable": "YES",
      "column_default": "'[]'::jsonb"
    },
    {
      "column_name": "keywords",
      "data_type": "ARRAY",
      "is_nullable": "YES",
      "column_default": "'{}'::text[]"
    },
    {
      "column_name": "error_pattern",
      "data_type": "character varying",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "feature_group_id",
      "data_type": "character varying",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "domain_class",
      "data_type": "character varying",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "taxonomy_level",
      "data_type": "integer",
      "is_nullable": "YES",
      "column_default": "0"
    },
    {
      "column_name": "bm25_indexed_at",
      "data_type": "timestamp with time zone",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "bm25_score",
      "data_type": "real",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "bm25_terms",
      "data_type": "ARRAY",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "packet_ulid",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "title_id",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "canonical_source_ref",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "page_rank_score",
      "data_type": "real",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "kmeans_cluster_id",
      "data_type": "integer",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "tree_node_id",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "routing_hints",
      "data_type": "ARRAY",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "community_source",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "community_confidence",
      "data_type": "numeric",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "lineage_version",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "ledger_type",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "canonical",
      "data_type": "boolean",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "payload_backfilled_at",
      "data_type": "timestamp with time zone",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "k_core",
      "data_type": "integer",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "ngrams",
      "data_type": "ARRAY",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "trigrams",
      "data_type": "ARRAY",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "engrams",
      "data_type": "ARRAY",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "used_concepts",
      "data_type": "ARRAY",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "topolog_cluster",
      "data_type": "integer",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "topolog_confidence",
      "data_type": "real",
      "is_nullable": "YES",
      "column_default": "0.5"
    },
    {
      "column_name": "topolog_method",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": "'unassigned'::text"
    },
    {
      "column_name": "topolog_applied_at",
      "data_type": "timestamp with time zone",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "repository_id",
      "data_type": "uuid",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "directory_id",
      "data_type": "uuid",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "file_id",
      "data_type": "uuid",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "module_id",
      "data_type": "uuid",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "symbol_id",
      "data_type": "uuid",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "chunk_id",
      "data_type": "uuid",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "recovery_lane",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": "'canonical'::text"
    },
    {
      "column_name": "som_cluster_id",
      "data_type": "integer",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "ontology",
      "data_type": "jsonb",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "packet_type_test",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "packet_type",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": "'code'::text"
    },
    {
      "column_name": "packet_ontology",
      "data_type": "jsonb",
      "is_nullable": "YES",
      "column_default": "'{\"tags\": [], \"examples\": {}, \"constraints\": {}, \"capabilities\": []}'::jsonb"
    },
    {
      "column_name": "parent_packet_key",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "related_packets",
      "data_type": "ARRAY",
      "is_nullable": "YES",
      "column_default": "'{}'::text[]"
    },
    {
      "column_name": "telemetry",
      "data_type": "jsonb",
      "is_nullable": "YES",
      "column_default": "'{\"failure_count\": 0, \"success_count\": 0, \"avg_latency_ms\": 0, \"execution_count\": 0}'::jsonb"
    },
    {
      "column_name": "embedding_eligible",
      "data_type": "boolean",
      "is_nullable": "NO",
      "column_default": "false"
    },
    {
      "column_name": "summary_hash",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "embedding_version",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "embedding_claimed_at",
      "data_type": "timestamp with time zone",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "embedding_claimed_by",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "feature_envelope",
      "data_type": "jsonb",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "domain_confidence",
      "data_type": "double precision",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "title_generator_version",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": "'v1'::text"
    },
    {
      "column_name": "file_purpose",
      "data_type": "USER-DEFINED",
      "is_nullable": "YES",
      "column_default": "'other'::file_purpose_enum"
    },
    {
      "column_name": "thoroughness",
      "data_type": "USER-DEFINED",
      "is_nullable": "YES",
      "column_default": "'stub'::thoroughness_enum"
    },
    {
      "column_name": "app_criticality",
      "data_type": "USER-DEFINED",
      "is_nullable": "YES",
      "column_default": "'optional'::app_criticality_enum"
    },
    {
      "column_name": "test_coverage_pct",
      "data_type": "integer",
      "is_nullable": "YES",
      "column_default": "0"
    },
    {
      "column_name": "file_understanding_computed_at",
      "data_type": "timestamp without time zone",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "file_understanding_method",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "openspec_id",
      "data_type": "uuid",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "gsd_id",
      "data_type": "uuid",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "enrichment_updated_at",
      "data_type": "timestamp without time zone",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "som_cell_x",
      "data_type": "integer",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "som_cell_y",
      "data_type": "integer",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "ast_score",
      "data_type": "real",
      "is_nullable": "YES",
      "column_default": "0.0"
    },
    {
      "column_name": "community_boost",
      "data_type": "real",
      "is_nullable": "YES",
      "column_default": "1.0"
    },
    {
      "column_name": "rerank_features",
      "data_type": "jsonb",
      "is_nullable": "YES",
      "column_default": "'{}'::jsonb"
    },
    {
      "column_name": "pagerank_score",
      "data_type": "real",
      "is_nullable": "YES",
      "column_default": "0.0"
    },
    {
      "column_name": "som_distance",
      "data_type": "real",
      "is_nullable": "YES",
      "column_default": "0.0"
    },
    {
      "column_name": "predicted_domain",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "classifier_kind",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "classifier_version",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "pagerank_raw",
      "data_type": "real",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "authority_score",
      "data_type": "real",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "workspace_id",
      "data_type": "character varying",
      "is_nullable": "YES",
      "column_default": "'unknown'::character varying"
    },
    {
      "column_name": "semantic_anchor",
      "data_type": "character varying",
      "is_nullable": "YES",
      "column_default": "'unknown'::character varying"
    },
    {
      "column_name": "ontology_version",
      "data_type": "character varying",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "content_hash",
      "data_type": "character varying",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "domain_memberships",
      "data_type": "jsonb",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "primary_domain",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "workspace_revision",
      "data_type": "integer",
      "is_nullable": "NO",
      "column_default": "0"
    },
    {
      "column_name": "representation_revision",
      "data_type": "integer",
      "is_nullable": "NO",
      "column_default": "0"
    },
    {
      "column_name": "embedding_digest",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "source_representation_id",
      "data_type": "character varying",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "source_dimension",
      "data_type": "integer",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "projection_representation_id",
      "data_type": "character varying",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "projection_dimension",
      "data_type": "integer",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "encoder_revision",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    },
    {
      "column_name": "som_revision",
      "data_type": "text",
      "is_nullable": "YES",
      "column_default": null
    }
  ],
  "coverage": {
    "total_rows": 61659,
    "packet_key_present": 61659,
    "source_ref_present": 61659,
    "workspace_id_present": 61659,
    "workspace_revision_present": 61659,
    "representation_revision_present": 61659,
    "packet_key_missing": 0,
    "workspace_id_missing": 0,
    "representation_revision_zero": 61659
  }
}
```

**Next:** Keep all projection joins and revision checks anchored to this exact instance.

## PA-PROJ-001 — Active Qdrant writer integration

**Status:** FAIL

Worker does not import the proven strict payload helper or still builds payload inline.

```json
{
  "workerExists": false,
  "helperExists": false,
  "workerImportsHelper": false,
  "inlinePayload": false,
  "writesProduction": false,
  "ackAfterSuccessfulProcessing": false,
  "deterministicPointId": false
}
```

**Next:** Patch the worker to call one pure strict builder, inject the collection name for tests, and exercise a real event-shaped fixture against an isolated proof collection.

## PA-PROJ-002 — Isolated packet projection proof

**Status:** NOT_PROVEN

Proof runner or evidence-backed OpenSpec statuses are absent from this checkout.

```json
{
  "proofRunnerExists": false,
  "openSpecExists": false,
  "proofRecorded": false
}
```

**Next:** Do not promote production identity from the isolated proof; use it only as the prerequisite for active-writer seam proof.

## PA-PROJ-003 — Production Qdrant identity and duplicate safety

**Status:** FAIL

Sampled 200 points from codebase_chunks_768.

```json
{
  "pointsCount": 105761,
  "sampled": 200,
  "coverage": {
    "packet_key": 0,
    "source_ref": 200,
    "workspace_id": 0,
    "workspace_revision": 0,
    "source_revision": 0,
    "representation_id": 200,
    "representation_revision": 0,
    "schema_version": 0,
    "stable_symbol_id": 0,
    "symbol_version_id": 0,
    "qdrant_point_id": 200
  },
  "signatures": {
    "chunk_id,content_hash,packet_version,qdrant_point_id,representation_id,source_ref": 200
  },
  "duplicateLogicalKeys": 0
}
```

**Next:** Keep production migration blocked; patch the active writer, then deterministically re-upsert or rebuild.

## PA-XGB-001 — XGBoost model and canonical cascade wiring

**Status:** PARTIAL

XGBoost service is reachable; canonical post-hydration cascade execution still requires a focused runtime receipt.

```json
{
  "health": {
    "ok": true,
    "endpoint": "/health",
    "value": {
      "status": "ok",
      "model_loaded": true,
      "model_type": "xgboost",
      "features": [
        "cosine_score",
        "bm25_rank_norm",
        "ann_turbovec_score",
        "concept_overlap",
        "same_feature",
        "community_conf",
        "reward_prior",
        "domain_class_match",
        "freshness_score",
        "pagerank_score",
        "som_cache_hit",
        "provenance_git_age",
        "packet_hit_count",
        "n_retrieved",
        "n_concepts",
        "trace_score"
      ]
    }
  },
  "repositoryHits": [],
  "canonicalClientHits": []
}
```

**Next:** Prove XGBoost receives canonically hydrated, packet-deduplicated candidates after RRF and preserves packet_key in output.

## PA-SVC-001 — Model and NLP service discovery

**Status:** PASS

LLM, LangExtract/NLP, and embedding endpoints were probed independently.

```json
{
  "models": {
    "ok": true,
    "endpoint": "/v1/models",
    "value": {
      "models": [
        {
          "name": "hforf.gguf",
          "model": "hforf.gguf",
          "modified_at": "",
          "size": "",
          "digest": "",
          "type": "model",
          "description": "",
          "tags": [
            ""
          ],
          "capabilities": [
            "completion"
          ],
          "parameters": "",
          "details": {
            "parent_model": "",
            "format": "gguf",
            "family": "",
            "families": [
              ""
            ],
            "parameter_size": "",
            "quantization_level": ""
          }
        }
      ],
      "object": "list",
      "data": [
        {
          "id": "hforf.gguf",
          "aliases": [],
          "tags": [],
          "object": "model",
          "created": 1785796595,
          "owned_by": "llamacpp",
          "meta": {
            "vocab_type": 2,
            "n_vocab": 248320,
            "n_ctx_train": 262144,
            "n_embd": 4096,
            "n_params": 8953803264,
            "size": 5899814912
          }
        }
      ]
    }
  },
  "langextract": {
    "ok": true,
    "endpoint": "/health",
    "value": {
      "status": "ok",
      "model": "gemma4-legal-iq4xs-direct.gguf",
      "runtime": {
        "pythonExecutable": "C:\\Python313\\python.exe",
        "pythonVersion": "3.13.5",
        "environmentType": "system-python"
      },
      "capabilities": {
        "spacy": true,
        "langextract": true,
        "tree_sitter": true,
        "treesitter_chunker": true,
        "ast_grep": true,
        "torch": true
      },
      "imports": {
        "langextract": {
          "available": true,
          "version": "0.1.0",
          "modulePath": "C:\\Users\\james\\Videos\\deeds-web-app\\python\\langextract\\__init__.py",
          "importVerified": true,
          "editableSource": null,
          "beautifulsoup4": {
            "available": true,
            "version": "4.13.4",
            "modulePath": null,
            "importVerified": true
          }
        },
        "treesitterChunker": {
          "available": true,
          "version": "4.0.0",
          "modulePath": "C:\\Users\\james\\AppData\\Roaming\\Python\\Python313\\site-packages\\chunker\\__init__.py",
          "moduleName": "chunker",
          "importVerified": true,
          "fixtureVerified": false
        },
        "treeSitterLanguagePack": {
          "available": true,
          "version": "0.9.0",
          "importVerified": true
        },
        "astGrepPy": {
          "available": true,
          "version": "0.44.1",
          "importVerified": true
        }
      },
      "timestamp": 1785796595795
    }
  },
  "embedding": {
    "ok": true,
    "endpoint": "/health",
    "value": {
      "status": "ok"
    }
  }
}
```

**Next:** Do not assume 8090 owns embeddings or reranking; keep each model role explicit in receipts.

## PA-EVAL-001 — EmbeddingGemma → exact oracle → CAGRA readiness

**Status:** NOT_PROVEN

CAGRA remains ineligible until same-matrix semantic_768 exact-search and Qdrant parity gates pass.

```json
{
  "embeddingHits": [],
  "cuvsHits": [],
  "exactOracleSourcePresent": false,
  "cagraSourcePresent": false
}
```

**Next:** Run cuVS brute-force and PyTorch top-k parity on one revision-qualified manifest, then measure Qdrant HNSW recall before any CAGRA test.

## PA-RET-001 — Canonical retrieval completion chain

**Status:** NOT_PROVEN

Retrieval, RRF, PageRank, summary, and ACE seams were inventoried; one production receipt is still required.

```json
{
  "hyperrag": [],
  "rrf": [],
  "pagerank": [],
  "summaries": [],
  "ace": []
}
```

**Next:** After production Qdrant identity is repaired, prove one route through hydration, stale rejection, independent lanes, rerank, exact source, and ACE.

## PA-OPS-001 — Graphify freshness

**Status:** FAIL

Graph artifact age is 688.3 minutes.

```json
{
  "path": "C:\\Users\\james\\Videos\\deeds-web-app\\docs\\graph\\codebase-graph.json",
  "size": 26984163,
  "modifiedAt": "2026-08-03T11:07:56.506Z",
  "ageMinutes": 688.3115817789713
}
```

**Next:** Isolate code graph refresh from optional SOM/topology stages and emit stage receipts.

