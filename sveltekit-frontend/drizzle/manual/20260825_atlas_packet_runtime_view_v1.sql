-- Parent Atlas canonical packet read model.
--
-- Additive compatibility boundary only. This view reads atlas_packets as the
-- packet spine and joins decomposed feature/metric projections. It does not
-- copy data, write to atlas_packet_registry, or change any canonical table.

CREATE OR REPLACE VIEW public.atlas_packet_runtime_v1 AS
SELECT
  p.packet_id,
  p.packet_key,
  p.source_ref,
  p.source_ref_key,
  p.canonical_source_ref,
  p.file_path,
  p.directory_path,
  p.feature_id,
  p.feature_label,
  p.summary,
  p.domain_class,
  p.embedding_status,
  COALESCE(p.qdrant_vector_dim, p.source_dimension,
    CASE WHEN p.embedding IS NOT NULL THEN 768 ELSE NULL END) AS embedding_dim,
  p.embedding AS embedding_768d,
  p.content_embedding_384 AS latent_384d,
  p.latent_64,
  p.kmeans_cluster_id,
  p.som_cell_x AS som_x,
  p.som_cell_y AS som_y,
  NULL::real AS semantic_z,
  NULL::real AS activity_w,
  p.topology AS manifold4,
  p.qdrant_point_id,
  NULL::text AS turbovec_id,
  p.neo4j_node_id,
  p.redis_centroid_key AS valkey_cache_key,
  NULL::text AS ace_cache_key,
  NULL::text AS seaweedfs_filer_path,
  p.pagerank_score,
  m.authority_score,
  NULL::real AS karpathy_score,
  NULL::real AS last_rerank_score,
  0::bigint AS retrieval_count,
  0::bigint AS cache_hits,
  0::bigint AS cache_misses,
  NULL::timestamptz AS last_retrieved,
  CASE WHEN COALESCE(p.canonical, true) THEN 'active' ELSE 'staged' END AS status,
  NULL::text AS validation_status,
  p.telemetry AS activity,
  p.payload -> 'kag_edges' AS kag_edges,
  p.payload -> 'dag_edges' AS dag_edges,
  NULL::bigint AS total_size_bytes,
  NULL::text AS glyph_id,
  p.som_index AS som_cluster,
  p.created_at,
  p.updated_at,
  f.used_concepts AS feature_used_concepts,
  f.lexical_features AS feature_lexical_features,
  f.ast_symbols AS feature_ast_symbols,
  f.entities AS feature_entities,
  m.feature_density AS metric_feature_density,
  m.complexity_score AS metric_complexity_score,
  m.semantic_entropy AS metric_semantic_entropy,
  m.retrieval_relevance AS metric_retrieval_relevance,
  m.page_rank_score AS metric_page_rank_score,
  m.som_index AS metric_som_index,
  p.workspace_revision,
  p.source_representation_id,
  p.source_dimension,
  p.representation_revision,
  p.embedding_digest,
  p.qdrant_collection,
  p.qdrant_vector_dim,
  p.tree_node_id
FROM public.atlas_packets p
LEFT JOIN public.atlas_packet_features f ON f.packet_key = p.packet_key
LEFT JOIN public.atlas_packet_metrics m ON m.packet_key = p.packet_key;

COMMENT ON VIEW public.atlas_packet_runtime_v1 IS
  'Canonical Parent Atlas packet read model. atlas_packets owns identity; features and metrics are decomposed projections; atlas_packet_registry is legacy compatibility only.';

CREATE OR REPLACE VIEW public.atlas_feature_directory_context_v1 AS
SELECT
  COALESCE(NULLIF(r.feature_id, ''), 'directory:' || COALESCE(NULLIF(r.directory_path, ''), 'unclassified')) AS feature_key,
  NULLIF(MAX(NULLIF(r.feature_label, '')), '') AS feature_label,
  r.directory_path,
  COUNT(DISTINCT r.packet_key)::integer AS packet_count,
  COUNT(DISTINCT r.source_ref)::integer AS source_ref_count,
  ARRAY_AGG(DISTINCT r.source_ref) FILTER (WHERE r.source_ref IS NOT NULL) AS source_refs,
  ARRAY_AGG(DISTINCT COALESCE(r.file_path, r.source_ref)) FILTER (WHERE COALESCE(r.file_path, r.source_ref) IS NOT NULL) AS file_urls,
  JSONB_AGG(JSONB_BUILD_OBJECT(
    'packet_key', r.packet_key,
    'source_ref', r.source_ref,
    'file_url', COALESCE(r.file_path, r.source_ref),
    'summary', r.summary,
    'tree_node_id', r.tree_node_id,
    'workspace_revision', r.workspace_revision
  ) ORDER BY r.packet_key) FILTER (WHERE r.packet_key IS NOT NULL) AS packet_context,
  MAX(r.workspace_revision) AS workspace_revision,
  MAX(r.representation_revision) AS representation_revision
FROM public.atlas_packet_runtime_v1 r
GROUP BY
  COALESCE(NULLIF(r.feature_id, ''), 'directory:' || COALESCE(NULLIF(r.directory_path, ''), 'unclassified')),
  r.directory_path;

COMMENT ON VIEW public.atlas_feature_directory_context_v1 IS
  'Rebuildable feature-directory context projection. Groups canonical packet rows by feature and directory; file_urls and summaries are derived, not identity owners.';

DO $$
BEGIN
  IF to_regclass('public.atlas_packet_registry') IS NOT NULL THEN
    COMMENT ON TABLE public.atlas_packet_registry IS
      'Historical snapshot / legacy compatibility only. Canonical packet owner is atlas_packets. Do not write new Parent Atlas state here.';
  END IF;
END
$$;
