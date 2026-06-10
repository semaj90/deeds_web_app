import * as dotenv from 'dotenv';
import type { Config } from 'drizzle-kit';

dotenv.config({ path: '.env' });

// Prefer migrator URL (postgres superuser) for schema changes
// Fall back to runtime URL (legal_admin) if migrator not available
const connectionString =
  process.env.DATABASE_URL_MIGRATOR ||
  process.env.DATABASE_URL ||
  '';

if (!connectionString) {
  throw new Error('DATABASE_URL_MIGRATOR or process.env.DATABASE_URL is not set in .env file');
}

export default {
  schema: './src/lib/server/db/schema.ts',
  out: './drizzle', // Directory for migrations
  dialect: 'postgresql',
  dbCredentials: {
    url: connectionString,
  },
  verbose: true,
  strict: true,
  // Exclude tables managed via manual sidecar SQL migrations (drizzle/00*_*.sql files
  // outside the journal) AND legacy Phase-89 analysis tables.
  tablesFilter: [
    // Phase 89 analysis tables (managed separately)
    '!phase89_*', '!kg_*', '!ts_errors', '!file_index', '!cpg_*',
    '!error_embedding_history', '!document_embeddings', '!enhanced_tags',
    '!recommendations', '!error_analysis', '!error_fix_history',
    '!learned_fix_patterns', '!raw_error_embeddings',
    '!kb_update_log', '!error_cluster_recommendations', '!clusters',
    '!multi_db_transactions', '!retry_queue', '!pattern_search_cache',
    '!file_metadata', '!error_topk_index',
    
    // Manual sidecar migrations that are NOT in the schema
    '!llm_outputs', '!llm_output_chunks',
    '!courtroom_animations', '!courtroom_keyframes',
    
    // Legacy / Sidecar tables that are NOT in the current Drizzle schema
    '!admin_telemetry', '!agent_actions', '!agent_context_files',
    '!agent_context_files_history', '!agent_context_relations',
    '!case_statute_links', '!chat_document_attachments', '!citation_collections',
    '!code_relations_v1', '!code_retrieval_chunks', '!collection_citations',
    '!directory_context_bindings', '!document_topics',
    '!feature_dependency_edges', '!file_hotness_scores', '!file_summaries',
    '!fix_attempts', '!fixer_patterns', '!fixer_run_log', '!hypergraph_edge_members',
    '!indexing_jobs', '!poi_photos', '!poi_relationships',
    '!report_audit_log', '!report_versions', '!screenshot_artifacts',
    '!statute_chunks', '!symbol_runtime_stats', '!taxonomy_edges',
    '!taxonomy_nodes', '!timeline_events', '!trace_events', '!trace_runs',
    '!user_interaction_history', '!vault_md_index', '!vault_md_join',

    // Added 2026-05-30 (real-gap-classification Tier B): ACE sidecar SQL-managed
    '!ace_chunks', '!ace_context_packets', '!ace_context_sources',
    '!ace_docs', '!ace_hit_logs', '!ace_sources',
    // Added 2026-05-30 (Tier C): Pipeline / MapReduce / GPU SQL-managed
    '!card_source_refs', '!codebase_graph_analysis', '!codebase_mapreduce_jobs',
    '!codebase_search_cache', '!codebase_wiki_pages',
    '!graph_expansion_cache', '!gpu_performance_metrics',
    '!mapreduce_map_queue', '!mapreduce_reduce_results',
    // Added 2026-05-30 (Tier D): custom migrations journal (managed by db/migrate.ts, not drizzle-kit)
    '!migrations',
  ],
} satisfies Config;
