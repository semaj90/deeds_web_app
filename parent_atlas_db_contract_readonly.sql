-- ============================================================================
-- Parent Atlas: DB Contract Read-Only Audit (DB-ALIGN-01)
-- Safety: Enforces read-only transaction. Zero mutations.
-- ============================================================================

BEGIN READ ONLY;

-- 1. Database & Catalog Identity
SELECT 
    current_database() AS current_database,
    current_user AS current_user,
    inet_server_addr() AS server_addr,
    inet_server_port() AS server_port,
    version() AS postgres_version;

-- 2. Schema Column & Type Verification
SELECT 
    table_name,
    column_name,
    ordinal_position,
    data_type,
    udt_name,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'analysis_jobs',
    'evidence',
    'evidence_vectors',
    'codebase_chunk_index',
    'evidence_vector_projection_outbox'
  )
ORDER BY table_name, ordinal_position;

-- 3. Check Constraints & Foreign Keys
SELECT 
    conrelid::regclass::text AS table_name,
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public'
  AND conrelid::regclass::text IN (
    'analysis_jobs',
    'evidence',
    'evidence_vectors',
    'codebase_chunk_index',
    'evidence_vector_projection_outbox'
  )
ORDER BY table_name, constraint_name;

-- 4. Index Status, Validity, and HNSW Configuration
SELECT 
    t.relname AS table_name,
    i.relname AS index_name,
    am.amname AS index_type,
    idx.indisvalid AS is_valid,
    idx.indisready AS is_ready,
    idx.indisunique AS is_unique,
    pg_size_pretty(pg_relation_size(i.oid)) AS index_size,
    pg_get_indexdef(i.oid) AS index_def
FROM pg_index idx
JOIN pg_class i ON i.oid = idx.indexrelid
JOIN pg_class t ON t.oid = idx.indrelid
JOIN pg_am am ON am.oid = i.relam
WHERE t.relnamespace = 'public'::regnamespace
  AND t.relname IN (
    'analysis_jobs',
    'evidence',
    'evidence_vectors',
    'codebase_chunk_index',
    'evidence_vector_projection_outbox'
  )
ORDER BY table_name, index_name;

-- 5. Physical Storage & Heap/Index/TOAST Footprint
SELECT 
    relname AS table_name,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
    pg_size_pretty(pg_relation_size(c.oid)) AS heap_size,
    pg_size_pretty(pg_indexes_size(c.oid)) AS index_size,
    pg_size_pretty(COALESCE(pg_total_relation_size(c.reltoastrelid), 0)) AS toast_size,
    reltuples::bigint AS approximate_row_count
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname IN (
    'analysis_jobs',
    'evidence',
    'evidence_vectors',
    'codebase_chunk_index',
    'evidence_vector_projection_outbox'
  )
ORDER BY pg_total_relation_size(c.oid) DESC;

-- 6. Drizzle Migration History Presence
SELECT 
    EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = '__drizzle_migrations'
    ) AS drizzle_migrations_table_exists;

SELECT 
    id, 
    hash, 
    created_at 
FROM __drizzle_migrations 
ORDER BY id DESC 
LIMIT 10;

-- Optional exact embedding census (commented out by default for fast audit)
-- SELECT count(*) AS populated_768_count FROM codebase_chunk_index WHERE content_embedding_768 IS NOT NULL;

ROLLBACK;
