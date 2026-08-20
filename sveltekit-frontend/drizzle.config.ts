import * as dotenv from 'dotenv';
import type { Config } from 'drizzle-kit';

dotenv.config({ path: '.env' });

const connectionString = process.env.DATABASE_URL_MIGRATOR || process.env.DATABASE_URL || '';
if (!connectionString) throw new Error('DATABASE_URL_MIGRATOR or process.env.DATABASE_URL is not set in .env file');

export default {
  schema: './src/lib/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: connectionString },
  verbose: true,
  strict: true,
  tablesFilter: [
    '!phase89_*', '!kg_*', '!ts_errors', '!file_index', '!cpg_*',
    '!error_embedding_history', '!document_embeddings', '!enhanced_tags',
    '!recommendations', '!error_analysis', '!error_fix_history',
    '!learned_fix_patterns', '!raw_error_embeddings',
    '!kb_update_log', '!error_cluster_recommendations', '!clusters',
    '!multi_db_transactions', '!retry_queue', '!pattern_search_cache',
    '!file_metadata', '!error_topk_index',
    '!llm_outputs', '!llm_output_chunks', '!courtroom_animations', '!courtroom_keyframes',
    '!admin_telemetry', '!agent_actions', '!agent_context_files', '!agent_context_files_history',
    '!agent_context_relations', '!case_statute_links', '!chat_document_attachments',
    '!citation_collections', '!code_relations_v1', '!code_retrieval_chunks',
    '!collection_citations', '!directory_context_bindings', '!document_topics',
    '!feature_dependency_edges', '!file_hotness_scores', '!file_summaries', '!fix_attempts',
    '!fixer_patterns', '!fixer_run_log', '!hypergraph_edge_members', '!indexing_jobs',
    '!poi_photos', '!poi_relationships', '!report_audit_log', '!report_versions',
    '!screenshot_artifacts', '!statute_chunks', '!symbol_runtime_stats', '!taxonomy_edges',
    '!taxonomy_nodes', '!timeline_events', '!trace_events', '!trace_runs',
    '!user_interaction_history', '!vault_md_index', '!vault_md_join',
    '!ace_chunks', '!ace_context_packets', '!ace_context_sources', '!ace_docs', '!ace_hit_logs', '!ace_sources',
    '!card_source_refs', '!codebase_graph_analysis', '!codebase_mapreduce_jobs', '!codebase_search_cache',
    '!codebase_wiki_pages', '!graph_expansion_cache', '!gpu_performance_metrics',
    '!mapreduce_map_queue', '!mapreduce_reduce_results', '!migrations',
    '!library_identities',
    '!atlas_research_runs', '!atlas_fetches', '!atlas_fetch_attempts', '!atlas_source_revisions', '!atlas_extractions',

    // Parent Atlas feature intelligence / structural identity plane. Runtime
    // declarations exist for querying; DDL remains isolated in drizzle/manual.
    '!atlas_features', '!atlas_feature_aliases', '!atlas_evidence', '!atlas_feature_evidence',
    '!atlas_relationships', '!atlas_relationship_members', '!atlas_relationship_cardinality',
    '!atlas_relationship_evidence', '!atlas_relationship_embeddings', '!atlas_feature_embeddings',
    '!atlas_feature_state_receipts', '!atlas_dynamic_hyperedge_candidates', '!atlas_evidence_entities',
    '!atlas_symbol_registry', '!atlas_symbol_aliases', '!atlas_symbol_versions',
    '!atlas_structural_reference_resolutions', '!atlas_schema_object_registry',
    '!atlas_schema_object_aliases', '!atlas_schema_object_versions',

    // Added 2026-08-02: library registry — manual sidecar migration
    // (drizzle/manual/20260802_library_identities.sql) because generating
    // against schema.ts also picked up unrelated pre-existing drift
    // (recommendation_log, semantic_lifecycle_events, semantic_signals).
    '!library_identities',
    // Parent Atlas acquisition plane (drizzle/manual/20260802_atlas_acquisition.sql) —
    // same reason as library_identities above: keep isolated from unrelated schema drift.
    '!atlas_research_runs', '!atlas_fetches', '!atlas_fetch_attempts',
    '!atlas_source_revisions', '!atlas_extractions',

    // Added 2026-08-19: ORF observation feature exact-filter plane.
    // Managed by drizzle/manual/20260819_atlas_observation_feature_rows.sql so
    // this additive table can be proven independently of unrelated schema drift.
    '!atlas_observation_feature_rows',
    // Parent Atlas test/assertion identity plane and reviewed continuity ledger.
    '!atlas_test_registry', '!atlas_test_aliases', '!atlas_test_versions', '!atlas_test_execution_receipts',
    '!atlas_assertion_registry', '!atlas_assertion_aliases', '!atlas_assertion_versions',
    '!atlas_identity_alias_decisions',

    // Parent Atlas algorithm/backend execution receipts. PostgreSQL stores the
    // durable receipt; Kafka/Valkey are projections only. DDL is manual-owned.
    '!atlas_algorithm_execution_receipts',
  ],
} satisfies Config;
