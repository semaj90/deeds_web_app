-- Phase 89: Edit Log Store Schema
-- PostgreSQL17 + pgvector for tracking ALL edits with timestamps and metadata
-- Enables diff comparison, ripgrep search, and agentic function calling analysis

-- ============================================================================
-- 1. EDIT LOG TABLE (Main Timeline)
-- ============================================================================

CREATE TABLE IF NOT EXISTS phase89_edit_log (
    id BIGSERIAL PRIMARY KEY,
    edit_hash TEXT NOT NULL UNIQUE,  -- SHA256 of (file_path + timestamp + diff)
    file_path TEXT NOT NULL,
    edit_type TEXT NOT NULL CHECK (edit_type IN ('create', 'update', 'delete', 'rename')),

    -- Content tracking
    content_before TEXT,  -- Full file content before edit
    content_after TEXT,   -- Full file content after edit
    diff TEXT,            -- Unified diff format
    diff_embedding vector(1024),  -- Embedding of diff for semantic search

    -- Metadata
    line_numbers_changed INT[],  -- Array of changed line numbers
    lines_added INT NOT NULL DEFAULT 0,
    lines_removed INT NOT NULL DEFAULT 0,
    total_lines_after INT,

    -- Authorship
    author TEXT,  -- 'human', 'copilot', 'phase89_fixer', 'phase89_agentic'
    agent_name TEXT,  -- Specific agent if applicable
    fix_id TEXT,  -- Reference to phase89_fix_attempts if this was a fix

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    committed_at TIMESTAMPTZ,  -- Git commit timestamp if available

    -- Tags and categorization
    tags TEXT[],  -- ['typescript', 'svelte5_migration', 'automated']
    root_cause_tags TEXT[],  -- If this was a fix, what errors did it address

    -- Quality metrics
    validation_before JSONB,  -- svelte-check output before
    validation_after JSONB,   -- svelte-check output after
    errors_fixed INT DEFAULT 0,
    errors_introduced INT DEFAULT 0,

    -- Git integration
    git_commit_sha TEXT,
    git_branch TEXT DEFAULT 'main',
    git_remote_url TEXT,

    -- Indexing
    indexed_at TIMESTAMPTZ,
    search_vector tsvector  -- Full-text search on diff content
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_edit_log_file_path ON phase89_edit_log(file_path);
CREATE INDEX IF NOT EXISTS idx_edit_log_created_at ON phase89_edit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_edit_log_author ON phase89_edit_log(author);
CREATE INDEX IF NOT EXISTS idx_edit_log_fix_id ON phase89_edit_log(fix_id);
CREATE INDEX IF NOT EXISTS idx_edit_log_tags ON phase89_edit_log USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_edit_log_search ON phase89_edit_log USING GIN(search_vector);

-- Vector index for semantic diff search
CREATE INDEX IF NOT EXISTS idx_edit_log_diff_embedding
ON phase89_edit_log USING ivfflat (diff_embedding vector_cosine_ops)
WITH (lists = 100);

-- ============================================================================
-- 2. FILE TIMELINE VIEW (Per-File History)
-- ============================================================================

CREATE OR REPLACE VIEW phase89_file_timeline AS
SELECT
    file_path,
    COUNT(*) as edit_count,
    MIN(created_at) as first_edit,
    MAX(created_at) as last_edit,
    SUM(lines_added) as total_lines_added,
    SUM(lines_removed) as total_lines_removed,
    SUM(errors_fixed) as total_errors_fixed,
    SUM(errors_introduced) as total_errors_introduced,
    array_agg(DISTINCT author) as authors,
    array_agg(edit_hash ORDER BY created_at) as edit_history
FROM phase89_edit_log
GROUP BY file_path;

-- ============================================================================
-- 3. EDIT COMPARISON TABLE (Diff Analysis)
-- ============================================================================

CREATE TABLE IF NOT EXISTS phase89_edit_comparisons (
    id BIGSERIAL PRIMARY KEY,
    edit_a_hash TEXT NOT NULL REFERENCES phase89_edit_log(edit_hash),
    edit_b_hash TEXT NOT NULL REFERENCES phase89_edit_log(edit_hash),

    -- Comparison method
    method TEXT NOT NULL CHECK (method IN ('ripgrep_awk', 'sed', 'ast_diff', 'semantic')),

    -- Similarity metrics
    line_similarity FLOAT,  -- 0.0-1.0 based on ripgrep + awk
    semantic_similarity FLOAT,  -- Cosine similarity of embeddings
    ast_similarity FLOAT,  -- AST structural similarity

    -- Diff of diffs (meta-diff)
    meta_diff TEXT,  -- What changed between two diffs

    -- Agentic analysis
    agent_analysis JSONB,  -- AI-generated comparison insights

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edit_comp_a ON phase89_edit_comparisons(edit_a_hash);
CREATE INDEX IF NOT EXISTS idx_edit_comp_b ON phase89_edit_comparisons(edit_b_hash);

-- ============================================================================
-- 4. AUTO-TAGGING MIRROR (Synchronized across all stores)
-- ============================================================================

CREATE TABLE IF NOT EXISTS phase89_tag_mirror (
    id BIGSERIAL PRIMARY KEY,
    entity_id TEXT NOT NULL,  -- Universal ID (edit_hash, instance_hash, etc.)
    entity_type TEXT NOT NULL CHECK (entity_type IN ('edit', 'error', 'fix', 'kb_card', 'cluster')),

    -- Tag data
    tags TEXT[] NOT NULL,
    auto_generated BOOLEAN DEFAULT TRUE,
    confidence FLOAT,  -- 0.0-1.0 for auto-generated tags

    -- Synchronization status
    synced_to_qdrant BOOLEAN DEFAULT FALSE,
    synced_to_neo4j BOOLEAN DEFAULT FALSE,
    synced_to_couchdb BOOLEAN DEFAULT FALSE,
    synced_to_redis BOOLEAN DEFAULT FALSE,

    -- Timestamps
    tagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_sync_at TIMESTAMPTZ,

    -- Source tracking
    tagged_by TEXT,  -- 'gemma3-legal', 'embeddinggemma', 'manual'

    UNIQUE(entity_id, entity_type)
);

CREATE INDEX IF NOT EXISTS idx_tag_mirror_entity ON phase89_tag_mirror(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_tag_mirror_tags ON phase89_tag_mirror USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_tag_mirror_sync ON phase89_tag_mirror(synced_to_qdrant, synced_to_neo4j, synced_to_couchdb);

-- ============================================================================
-- 5. RIPGREP SEARCH CACHE (Faster than re-scanning)
-- ============================================================================

CREATE TABLE IF NOT EXISTS phase89_ripgrep_cache (
    id BIGSERIAL PRIMARY KEY,
    query_hash TEXT NOT NULL UNIQUE,  -- Hash of (pattern + file_patterns + flags)

    -- Query details
    pattern TEXT NOT NULL,
    file_patterns TEXT[],
    flags TEXT[],  -- ['-i', '--json', '--no-heading']

    -- Results
    matches JSONB,  -- Array of {file, line, column, text}
    match_count INT,

    -- Performance
    execution_time_ms FLOAT,
    cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,  -- TTL for cache invalidation

    -- Usage stats
    hit_count INT DEFAULT 0,
    last_hit_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ripgrep_cache_query ON phase89_ripgrep_cache(query_hash);
CREATE INDEX IF NOT EXISTS idx_ripgrep_cache_expires ON phase89_ripgrep_cache(expires_at);

-- ============================================================================
-- 6. AGENTIC FUNCTION CALLS LOG (LLM Tool Usage)
-- ============================================================================

CREATE TABLE IF NOT EXISTS phase89_agentic_calls (
    id BIGSERIAL PRIMARY KEY,
    call_id TEXT NOT NULL UNIQUE,

    -- Function details
    function_name TEXT NOT NULL,
    parameters JSONB,
    result JSONB,

    -- Context
    agent_name TEXT,  -- 'phase89_fixer', 'phase89_ace', etc.
    task_id TEXT,     -- Reference to parent task
    edit_hash TEXT REFERENCES phase89_edit_log(edit_hash),

    -- Performance
    execution_time_ms FLOAT,
    success BOOLEAN,
    error_message TEXT,

    -- Timestamps
    called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- Comparison tracking
    comparison_method TEXT,  -- 'ripgrep_awk', 'sed', 'ast_diff'
    comparison_score FLOAT   -- Quality score for this function call
);

CREATE INDEX IF NOT EXISTS idx_agentic_calls_function ON phase89_agentic_calls(function_name);
CREATE INDEX IF NOT EXISTS idx_agentic_calls_agent ON phase89_agentic_calls(agent_name);
CREATE INDEX IF NOT EXISTS idx_agentic_calls_edit ON phase89_agentic_calls(edit_hash);

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Generate edit hash
CREATE OR REPLACE FUNCTION phase89_generate_edit_hash(
    p_file_path TEXT,
    p_timestamp TIMESTAMPTZ,
    p_diff TEXT
) RETURNS TEXT AS $$
BEGIN
    RETURN encode(sha256(CONCAT(p_file_path, p_timestamp::TEXT, p_diff)::bytea), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update search vector on insert/update
CREATE OR REPLACE FUNCTION phase89_update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('english', COALESCE(NEW.diff, '') || ' ' || COALESCE(NEW.file_path, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_edit_log_search_vector
BEFORE INSERT OR UPDATE ON phase89_edit_log
FOR EACH ROW
EXECUTE FUNCTION phase89_update_search_vector();

-- ============================================================================
-- 8. EXAMPLE QUERIES
-- ============================================================================

-- Find all edits to a file
COMMENT ON VIEW phase89_file_timeline IS
'SELECT * FROM phase89_file_timeline WHERE file_path LIKE ''%Button.svelte%'' ORDER BY last_edit DESC;';

-- Find similar diffs using embeddings
COMMENT ON COLUMN phase89_edit_log.diff_embedding IS
'SELECT file_path, created_at, 1 - (diff_embedding <=> query_embedding) AS similarity
FROM phase89_edit_log
ORDER BY diff_embedding <=> query_embedding
LIMIT 10;';

-- Find unsynced tags
COMMENT ON TABLE phase89_tag_mirror IS
'SELECT * FROM phase89_tag_mirror
WHERE NOT (synced_to_qdrant AND synced_to_neo4j AND synced_to_couchdb)
ORDER BY tagged_at DESC;';

-- Ripgrep vs Sed comparison
COMMENT ON TABLE phase89_agentic_calls IS
'SELECT
    comparison_method,
    AVG(comparison_score) as avg_score,
    AVG(execution_time_ms) as avg_time_ms,
    COUNT(*) as call_count
FROM phase89_agentic_calls
WHERE comparison_method IN (''ripgrep_awk'', ''sed'')
GROUP BY comparison_method;';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT ALL ON phase89_edit_log TO legal_admin;
GRANT ALL ON phase89_edit_comparisons TO legal_admin;
GRANT ALL ON phase89_tag_mirror TO legal_admin;
GRANT ALL ON phase89_ripgrep_cache TO legal_admin;
GRANT ALL ON phase89_agentic_calls TO legal_admin;

GRANT SELECT ON phase89_file_timeline TO legal_admin;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Phase 89: Edit Log Store schema created successfully!';
    RAISE NOTICE '   Tables: phase89_edit_log, phase89_edit_comparisons, phase89_tag_mirror, phase89_ripgrep_cache, phase89_agentic_calls';
    RAISE NOTICE '   Views: phase89_file_timeline';
    RAISE NOTICE '   Triggers: trig_edit_log_search_vector';
    RAISE NOTICE '   Indexes: 15 total (including vector index)';
END $$;
