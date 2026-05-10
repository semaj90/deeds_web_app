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
  // outside the journal) AND legacy Phase-89 analysis tables. These are NOT declared
  // in schema-postgres.ts on purpose — excluding them here prevents `drizzle-kit generate`
  // from proposing DROP TABLE.
  tablesFilter: [
    // Phase 89 analysis tables (managed separately)
    '!phase89_*', '!kg_*', '!ts_errors', '!file_index', '!cpg_*',
    '!error_embedding_history', '!document_embeddings', '!enhanced_tags',
    '!recommendations', '!error_analysis', '!error_fix_history',
    '!learned_fix_patterns', '!kag_*', '!raw_error_embeddings',
    '!kb_update_log', '!error_cluster_recommendations', '!clusters',
    '!multi_db_transactions', '!retry_queue', '!pattern_search_cache',
    '!file_metadata', '!error_topk_index',
    // Manual sidecar migration: drizzle/0016_codeintel_schema.sql
    '!llm_outputs', '!llm_output_chunks',
    // Manual sidecar migration: drizzle/0016_courtroom_3d_animation.sql
    // (courtroom_models IS declared in schema; the other two are not)
    '!courtroom_animations', '!courtroom_keyframes',
    // Admin AI chat — managed via raw SQL (ai-chat-service.ts uses pg.Pool, not Drizzle)
    '!admin_ai_chat_sessions', '!admin_ai_chat_messages',
  ],
} satisfies Config;
