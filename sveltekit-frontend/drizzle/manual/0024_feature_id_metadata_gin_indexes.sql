/**
 * 0024_feature_id_metadata_gin_indexes.sql
 *
 * Adds comprehensive feature_id + metadata JSONB GIN indexing across all
 * packet + chunk tables for:
 * - Multi-hop Neo4j USED_CONCEPT traversals
 * - KMeans 20x20 SOM clustering + topology 4D queries
 * - Redis centroid lookups (sorted by source_ref, feature_label)
 * - Qdrant multi-vector collection filtering
 * - Agentic hyper-dense search (feature_id + domain grouping)
 * - MapReduce + CouchDB + DuckDB joins
 *
 * All indexes use IF NOT EXISTS for idempotence.
 * Grouped by domain (atlas, route, codebase, legal, evidence, chipset).
 */

-- ══════════════════════════════════════════════════════════════════════════════
-- ATLAS DOMAIN: Feature + Metadata indexing
-- ══════════════════════════════════════════════════════════════════════════════

-- atlas_packets: Ensure feature_id composite index (already exists, verify)
CREATE INDEX IF NOT EXISTS idx_atlas_packets_feature_id_composite
  ON atlas_packets(feature_id, community_id, cluster_id)
  WHERE feature_id IS NOT NULL;

-- atlas_packets: Metadata JSONB paths for topology traversal
CREATE INDEX IF NOT EXISTS idx_atlas_packets_metadata_feature_id
  ON atlas_packets USING GIN((metadata -> 'feature_id'));

CREATE INDEX IF NOT EXISTS idx_atlas_packets_metadata_domain
  ON atlas_packets USING GIN((metadata -> 'domain'));

CREATE INDEX IF NOT EXISTS idx_atlas_packets_metadata_som
  ON atlas_packets USING GIN((metadata -> 'som'));

CREATE INDEX IF NOT EXISTS idx_atlas_packets_payload_feature_label
  ON atlas_packets USING GIN((payload -> 'feature_label'));

CREATE INDEX IF NOT EXISTS idx_atlas_packets_payload_domain_class
  ON atlas_packets USING GIN((payload -> 'domain_class'));

-- atlas_feature_map: Feature synthesis + Neo4j join optimization
CREATE INDEX IF NOT EXISTS idx_atlas_feature_map_feature_id
  ON atlas_feature_map(feature_id)
  WHERE feature_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_feature_map_metadata_gin
  ON atlas_feature_map USING GIN(metadata);

-- ══════════════════════════════════════════════════════════════════════════════
-- ROUTE DOMAIN: Runtime packet feature tracking
-- ══════════════════════════════════════════════════════════════════════════════

-- route_runtime_packets: Composite feature_id + cluster lookup (already exists, verify)
CREATE INDEX IF NOT EXISTS idx_rrp_feature_cluster
  ON route_runtime_packets(feature_id, cluster_id)
  WHERE feature_id IS NOT NULL;

-- route_runtime_packets: Raw JSONB feature paths
CREATE INDEX IF NOT EXISTS idx_rrp_raw_feature_id
  ON route_runtime_packets USING GIN((raw -> 'feature_id'));

CREATE INDEX IF NOT EXISTS idx_rrp_raw_domain
  ON route_runtime_packets USING GIN((raw -> 'domain'));

-- route_error_patches: Feature-scoped error recommendations
CREATE INDEX IF NOT EXISTS idx_route_error_patches_feature_id
  ON route_error_patches(feature_id)
  WHERE feature_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- CODEBASE DOMAIN: File + Symbol + Embedding alignment
-- ══════════════════════════════════════════════════════════════════════════════

-- codebase_files: Feature grouping for MapReduce operations
CREATE INDEX IF NOT EXISTS idx_codebase_files_feature_id
  ON codebase_files(feature_id)
  WHERE feature_id IS NOT NULL;

-- codebase_embeddings: Feature + metadata for SOM topology
CREATE INDEX IF NOT EXISTS idx_codebase_embeddings_feature_id
  ON codebase_embeddings(feature_id)
  WHERE feature_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_codebase_embeddings_metadata_gin
  ON codebase_embeddings USING GIN(metadata)
  WHERE metadata IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- LEGAL DOMAIN: Case + Citation + Statute alignment
-- ══════════════════════════════════════════════════════════════════════════════

-- legal_documents: Feature + domain sorting for retrieval
CREATE INDEX IF NOT EXISTS idx_legal_documents_feature_id
  ON legal_documents(feature_id)
  WHERE feature_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_legal_documents_metadata_gin
  ON legal_documents USING GIN(metadata);

-- legal_citations: Statute + precedent feature mapping
CREATE INDEX IF NOT EXISTS idx_legal_citations_feature_id
  ON legal_citations(feature_id)
  WHERE feature_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- EVIDENCE DOMAIN: Multi-hop evidence graph traversal
-- ══════════════════════════════════════════════════════════════════════════════

-- evidence: Feature + source grouping for chain-of-custody
CREATE INDEX IF NOT EXISTS idx_evidence_feature_id
  ON evidence(feature_id)
  WHERE feature_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_evidence_metadata_gin
  ON evidence USING GIN(metadata);

-- evidence_relationship: Cross-feature evidence links
CREATE INDEX IF NOT EXISTS idx_evidence_relationship_feature_from
  ON evidence_relationship(feature_id_from)
  WHERE feature_id_from IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_evidence_relationship_feature_to
  ON evidence_relationship(feature_id_to)
  WHERE feature_id_to IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- CHIPSET/OBSERVATION DOMAIN: High-frequency trace data
-- ══════════════════════════════════════════════════════════════════════════════

-- agent_traces: Feature selection + concept mapping
CREATE INDEX IF NOT EXISTS idx_agent_traces_feature_id
  ON agent_traces(feature_id)
  WHERE feature_id IS NOT NULL;

-- task_semantic_packets: Feature + semantic grouping
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_feature_id
  ON task_semantic_packets(feature_id)
  WHERE feature_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_metadata_gin
  ON task_semantic_packets USING GIN(metadata);

-- ══════════════════════════════════════════════════════════════════════════════
-- TOPOLOGY DOMAIN: SOM + KMeans + PageRank alignment
-- ══════════════════════════════════════════════════════════════════════════════

-- directory_clusters: Feature + SOM cell grouping
CREATE INDEX IF NOT EXISTS idx_directory_clusters_feature_id
  ON directory_clusters(feature_id)
  WHERE feature_id IS NOT NULL;

-- topology: Feature + SOM grid alignment
CREATE INDEX IF NOT EXISTS idx_topology_feature_id
  ON topology(feature_id)
  WHERE feature_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topology_metadata_gin
  ON topology USING GIN(metadata);

-- ══════════════════════════════════════════════════════════════════════════════
-- MULTI-HOP QUERY OPTIMIZATION: Composite indexes for traversal chains
-- ══════════════════════════════════════════════════════════════════════════════

-- Neo4j ↔ Postgres USED_CONCEPT join: (source_ref, feature_id) → concepts
CREATE INDEX IF NOT EXISTS idx_packets_source_feature_multi_hop
  ON atlas_packets(source_ref, feature_id)
  WHERE source_ref IS NOT NULL AND feature_id IS NOT NULL;

-- SOM topology + feature grouping: (som_cluster, feature_id) → packets
CREATE INDEX IF NOT EXISTS idx_packets_som_feature_grouping
  ON atlas_packets USING GIN((payload -> 'som_cluster'), (payload -> 'feature_id'))
  WHERE payload IS NOT NULL;

-- Redis centroid lookup: (source_ref, feature_id) + sorted by modified_at
CREATE INDEX IF NOT EXISTS idx_packets_centroid_cache
  ON atlas_packets(source_ref, feature_id, updated_at DESC)
  WHERE source_ref IS NOT NULL AND feature_id IS NOT NULL;

-- Qdrant multi-vector pre-filter: feature_id + domain_class + tags
CREATE INDEX IF NOT EXISTS idx_packets_qdrant_prefilter
  ON atlas_packets(feature_id, (payload->>'domain_class'))
  WHERE feature_id IS NOT NULL AND payload IS NOT NULL;

-- Agentic hyper-dense search: (domain, feature_id, source_ref) grouped
CREATE INDEX IF NOT EXISTS idx_packets_agentic_grouping
  ON atlas_packets((payload->>'domain_class'), feature_id, source_ref)
  WHERE payload IS NOT NULL AND feature_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- ANALYSIS & AGGREGATION: MapReduce + CouchDB + DuckDB join support
-- ══════════════════════════════════════════════════════════════════════════════

-- Feature frequency aggregation: COUNT(*) GROUP BY feature_id
CREATE INDEX IF NOT EXISTS idx_packets_feature_count
  ON atlas_packets(feature_id)
  WHERE feature_id IS NOT NULL;

-- Community feature affinity: (community_id, feature_id) for CouchDB mirrors
CREATE INDEX IF NOT EXISTS idx_packets_community_feature
  ON atlas_packets(community_id, feature_id)
  WHERE community_id IS NOT NULL AND feature_id IS NOT NULL;

-- DuckDB parquet export alignment: ordered (source_ref, feature_id, created_at)
CREATE INDEX IF NOT EXISTS idx_packets_export_alignment
  ON atlas_packets(source_ref, feature_id, created_at DESC)
  WHERE source_ref IS NOT NULL AND feature_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION: Index coverage audit
-- ══════════════════════════════════════════════════════════════════════════════

-- After application, run:
--
-- SELECT
--   schemaname, tablename, indexname, indexdef
-- FROM pg_indexes
-- WHERE indexname LIKE 'idx_%feature_id%'
--    OR indexname LIKE 'idx_%metadata%'
--    OR indexname LIKE 'idx_%gin%'
-- ORDER BY schemaname, tablename, indexname;
--
-- Expected count: 40+ indexes across all domains
