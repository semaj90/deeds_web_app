# Atlas Packets Schema Audit

**Generated:** 2026-10-11T22:49:00.855Z

## Table Statistics
- **Total Rows:** 61,718
- **Total Size:** 1825 MB
- **Data Size:** 354 MB
- **Indexes Size:** 966 MB

## Columns (144 total)
```
packet_id: text
artifact_id: text (nullable)
packet_key: text (nullable)
source_ref: text (nullable)
source_ref_key: text (nullable)
file_path: text (nullable)
directory_path: text (nullable)
feature_id: text (nullable)
feature_label: text (nullable)
community_id: integer (nullable)
concept_ids: ARRAY (nullable)
cluster_id: integer (nullable)
embedding: USER-DEFINED (nullable)
payload: jsonb (nullable)
metadata: jsonb (nullable)
permissions: jsonb
topology: jsonb
vectors: jsonb
summary: text (nullable)
tags: ARRAY (nullable)
byte_start: bigint (nullable)
byte_end: bigint (nullable)
sha256: text (nullable)
source_kind: text (nullable)
source_path: text (nullable)
group_id: text (nullable)
packet_universe: text (nullable)
qdrant_point_id: text (nullable)
qdrant_collection: text (nullable)
qdrant_vector_dim: integer (nullable)
identity_lane: text (nullable)
identity_confidence: double precision (nullable)
som_cluster: text (nullable)
som_row: integer (nullable)
som_col: integer (nullable)
som_index: integer (nullable)
kmeans_cluster: integer (nullable)
pagerank: real (nullable)
betweenness: real (nullable)
eigenvector: real (nullable)
neo4j_node_id: text (nullable)
redis_centroid_key: text (nullable)
latent_64: bytea (nullable)
reward_prior: double precision (nullable)
created_at: timestamp with time zone (nullable)
updated_at: timestamp with time zone (nullable)
function_symbol: text (nullable)
content_embedding_384: USER-DEFINED (nullable)
embedding_status: text (nullable)
embedding_timestamp: timestamp with time zone (nullable)
extracted_entities: jsonb (nullable)
keywords: ARRAY (nullable)
error_pattern: character varying (nullable)
feature_group_id: character varying (nullable)
domain_class: character varying (nullable)
taxonomy_level: integer (nullable)
bm25_indexed_at: timestamp with time zone (nullable)
bm25_score: real (nullable)
bm25_terms: ARRAY (nullable)
packet_ulid: text (nullable)
title_id: text (nullable)
canonical_source_ref: text (nullable)
page_rank_score: real (nullable)
kmeans_cluster_id: integer (nullable)
tree_node_id: text (nullable)
routing_hints: ARRAY (nullable)
community_source: text (nullable)
community_confidence: numeric (nullable)
lineage_version: text (nullable)
ledger_type: text (nullable)
canonical: boolean (nullable)
payload_backfilled_at: timestamp with time zone (nullable)
k_core: integer (nullable)
ngrams: ARRAY (nullable)
trigrams: ARRAY (nullable)
engrams: ARRAY (nullable)
used_concepts: ARRAY (nullable)
topolog_cluster: integer (nullable)
topolog_confidence: real (nullable)
topolog_method: text (nullable)
topolog_applied_at: timestamp with time zone (nullable)
repository_id: uuid (nullable)
directory_id: uuid (nullable)
file_id: uuid (nullable)
module_id: uuid (nullable)
symbol_id: uuid (nullable)
chunk_id: uuid (nullable)
recovery_lane: text (nullable)
som_cluster_id: integer (nullable)
ontology: jsonb (nullable)
packet_type_test: text (nullable)
packet_type: text (nullable)
packet_ontology: jsonb (nullable)
parent_packet_key: text (nullable)
related_packets: ARRAY (nullable)
telemetry: jsonb (nullable)
embedding_eligible: boolean
summary_hash: text (nullable)
embedding_version: text (nullable)
embedding_claimed_at: timestamp with time zone (nullable)
embedding_claimed_by: text (nullable)
feature_envelope: jsonb (nullable)
domain_confidence: double precision (nullable)
title_generator_version: text (nullable)
file_purpose: USER-DEFINED (nullable)
thoroughness: USER-DEFINED (nullable)
app_criticality: USER-DEFINED (nullable)
test_coverage_pct: integer (nullable)
file_understanding_computed_at: timestamp without time zone (nullable)
file_understanding_method: text (nullable)
openspec_id: uuid (nullable)
gsd_id: uuid (nullable)
enrichment_updated_at: timestamp without time zone (nullable)
som_cell_x: integer (nullable)
som_cell_y: integer (nullable)
ast_score: real (nullable)
community_boost: real (nullable)
rerank_features: jsonb (nullable)
pagerank_score: real (nullable)
som_distance: real (nullable)
predicted_domain: text (nullable)
classifier_kind: text (nullable)
classifier_version: text (nullable)
pagerank_raw: real (nullable)
authority_score: real (nullable)
workspace_id: character varying (nullable)
semantic_anchor: character varying (nullable)
ontology_version: character varying (nullable)
content_hash: character varying (nullable)
domain_memberships: jsonb (nullable)
primary_domain: text (nullable)
workspace_revision: integer
representation_revision: integer
embedding_digest: text (nullable)
source_representation_id: character varying (nullable)
source_dimension: integer (nullable)
projection_representation_id: character varying (nullable)
projection_dimension: integer (nullable)
encoder_revision: text (nullable)
som_revision: text (nullable)
source_revision: text (nullable)
workspace_revision_key: text (nullable)
lineage_binding_checksum: text (nullable)
lineage_producer_revision: text (nullable)
```

## Indexes (92 total)
- **GIN:** 24
- **B-tree:** 67
- **HNSW:** 0

### Index Details
```
atlas_packets_domain_unclassified_idx [BTREE]
atlas_packets_metadata_gin_idx [GIN]
atlas_packets_packet_key_key [BTREE]
atlas_packets_pkey [BTREE]
atlas_packets_workspace_representation_idx [BTREE]
idx_atlas_packets_ast_score [BTREE]
idx_atlas_packets_bm25_indexed_at [BTREE]
idx_atlas_packets_bm25_terms [GIN]
idx_atlas_packets_canonical_source_ref [BTREE]
idx_atlas_packets_chunk_id [BTREE]
idx_atlas_packets_community_boost [BTREE]
idx_atlas_packets_community_confidence_idx [BTREE]
idx_atlas_packets_community_id [BTREE]
idx_atlas_packets_community_id_idx [BTREE]
idx_atlas_packets_community_source_idx [BTREE]
idx_atlas_packets_concept_ids [GIN]
idx_atlas_packets_directory_id [BTREE]
idx_atlas_packets_domain_class [BTREE]
idx_atlas_packets_domain_class_idx [BTREE]
idx_atlas_packets_domain_confidence [BTREE]
idx_atlas_packets_domain_memberships [GIN]
idx_atlas_packets_embedding_digest [BTREE]
idx_atlas_packets_embedding_status [BTREE]
idx_atlas_packets_envelope_fts [GIN]
idx_atlas_packets_error_pattern [BTREE]
idx_atlas_packets_extracted_entities [GIN]
idx_atlas_packets_feature_group_id [BTREE]
idx_atlas_packets_feature_id [BTREE]
idx_atlas_packets_feature_id_composite [BTREE]
idx_atlas_packets_feature_id_idx [BTREE]
idx_atlas_packets_feature_label_idx [BTREE]
idx_atlas_packets_file_id [BTREE]
idx_atlas_packets_file_path [BTREE]
idx_atlas_packets_file_path_trgm [GIN]
idx_atlas_packets_hierarchy [BTREE]
idx_atlas_packets_identity_compound_idx [BTREE]
idx_atlas_packets_identity_lane [BTREE]
idx_atlas_packets_keywords [GIN]
idx_atlas_packets_kmeans_cluster_id [BTREE]
idx_atlas_packets_kmeans_cluster_idx [BTREE]
idx_atlas_packets_ledger_type_idx [BTREE]
idx_atlas_packets_lineage_binding_checksum [BTREE]
idx_atlas_packets_lineage_version_idx [BTREE]
idx_atlas_packets_metadata_gin [GIN]
idx_atlas_packets_metadata_gin_pathops [GIN]
idx_atlas_packets_module_id [BTREE]
idx_atlas_packets_neo4j_node_id [BTREE]
idx_atlas_packets_ontology_gin [GIN]
idx_atlas_packets_packet_key [BTREE]
idx_atlas_packets_packet_key_idx [BTREE]
idx_atlas_packets_packet_ulid [BTREE]
idx_atlas_packets_page_rank_score [BTREE]
idx_atlas_packets_pagerank_score [BTREE]
idx_atlas_packets_payload_gin [GIN]
idx_atlas_packets_payload_gin_pathops [GIN]
idx_atlas_packets_payload_path [GIN]
idx_atlas_packets_permissions_gin_pathops [GIN]
idx_atlas_packets_primary_domain [BTREE]
idx_atlas_packets_qdrant_point_id [BTREE]
idx_atlas_packets_redis_centroid_key [BTREE]
idx_atlas_packets_repository_id [BTREE]
idx_atlas_packets_representation_revision [BTREE]
idx_atlas_packets_rerank_features [GIN]
idx_atlas_packets_routing_hints [GIN]
idx_atlas_packets_som_cell [BTREE]
idx_atlas_packets_som_cluster [BTREE]
idx_atlas_packets_som_distance [BTREE]
idx_atlas_packets_som_index [BTREE]
idx_atlas_packets_som_index_idx [BTREE]
idx_atlas_packets_source_feature [BTREE]
idx_atlas_packets_source_kind [BTREE]
idx_atlas_packets_source_ref [BTREE]
idx_atlas_packets_source_ref_idx [BTREE]
idx_atlas_packets_source_ref_key [BTREE]
idx_atlas_packets_source_revision [BTREE]
idx_atlas_packets_summary_fts [GIN]
idx_atlas_packets_symbol_id [BTREE]
idx_atlas_packets_tags [GIN]
idx_atlas_packets_tags_gin [GIN]
idx_atlas_packets_taxonomy_level [BTREE]
idx_atlas_packets_title_id [BTREE]
idx_atlas_packets_topology_gin_pathops [GIN]
idx_atlas_packets_tree_node_id [BTREE]
idx_atlas_packets_type [BTREE]
idx_atlas_packets_vectors_gin_pathops [GIN]
idx_atlas_packets_workspace_revision [BTREE]
idx_atlas_packets_workspace_revision_key_source [BTREE]
idx_latent_64_not_null [BTREE]
idx_packets_centroid_cache [BTREE]
idx_packets_feature_envelope [GIN]
idx_packets_source_feature_multi_hop [BTREE]
idx_packets_used_concepts_gin [GIN]
```

## Enrichment Field Coverage

### Identity Fields
- Status: ✅ COMPLETE
- Found: 5/5
- Present: packet_key, source_ref, feature_id, feature_label, file_path


### Enrichment Fields
- Found: 2/2
- Present: community_id, community_confidence


### Qdrant Mirror Fields
- Found: 1/2
- Present: qdrant_point_id

### SOM Topology Fields
- Found: 3/3
- Present: som_row, som_col, som_cluster

### Karpathy Authority Fields
- Found: 1/2
- Present: authority_score

### Latent Vector Fields
- Found: 0/1

### Metadata/Payload JSONB
- Found: 2/2

### Tree/PageIndex Fields
- Found: 1/1

## Data Coverage

- **packet_key:** 61718/61718 (100%)
- **source_ref:** 61718/61718 (100%)
- **feature_id:** 61718/61718 (100%)
- **feature_label:** 61660/61718 (99.9%)
- **community_id:** 61660/61718 (99.9%)
- **file_path:** 58366/61718 (94.6%)

## Readiness Status

| Category | Status |
|----------|--------|
| Identity Fields | ✅ |
| Enrichment Fields | ✅ |
| Qdrant Mirror | ✅ |
| SOM Topology | ✅ |
| Karpathy Scores | ✅ |
| Latent Vectors | ⏳ |
| Metadata JSONB | ✅ |
| Tree Nodes | ✅ |

## Recommendations

- Missing 3 enrichment fields: qdrant:qdrant_tags, karpathy:karpathy_score, latent:encoded_latent
- Ready for multihop regeneration with schema-adaptive queries (null fields for missing columns)

## Missing Fields Summary

Total missing: 3
- qdrant:qdrant_tags
- karpathy:karpathy_score
- latent:encoded_latent

---
**Report generated by:** scripts/atlas/schema-audit-atlas-packets.mjs
**Canonical schema:** sveltekit-frontend/src/lib/server/db/schema-postgres.ts
