-- Phase 89: CUDA-Accelerated Knowledge System Schema
-- Run this to create all required tables for the Phase 89 dashboard

-- Clean up existing tables to ensure fresh schema
DROP VIEW IF EXISTS phase89_health_summary CASCADE;
DROP VIEW IF EXISTS phase89_cluster_summary CASCADE;
DROP VIEW IF EXISTS phase89_fix_success_rate CASCADE;

DROP TABLE IF EXISTS phase89_fix_attempts CASCADE;
DROP TABLE IF EXISTS phase89_kb_cards CASCADE;
DROP TABLE IF EXISTS phase89_error_clusters CASCADE;
DROP TABLE IF EXISTS phase89_timeline CASCADE;
DROP TABLE IF EXISTS phase89_cosine_rankings CASCADE;

-- =====================================================
-- Fix Attempts Tracking Table
-- =====================================================
CREATE TABLE phase89_fix_attempts (
    id SERIAL PRIMARY KEY,
    error_instance_id BIGINT REFERENCES phase89_error_instances(id),
    file_path TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fix_type TEXT NOT NULL, -- 'agentic', 'batch', 'manual'
    status TEXT NOT NULL, -- 'pending', 'success', 'failed'
    diff_applied TEXT,
    validation_output TEXT,
    confidence_score FLOAT,
    metadata JSONB
);

CREATE INDEX idx_fix_attempts_error ON phase89_fix_attempts(error_instance_id);
CREATE INDEX idx_fix_attempts_timestamp ON phase89_fix_attempts(timestamp DESC);
CREATE INDEX idx_fix_attempts_status ON phase89_fix_attempts(status);

-- =====================================================
-- Knowledge Base Cards Table
-- =====================================================
CREATE TABLE phase89_kb_cards (
    id SERIAL PRIMARY KEY,
    card_type TEXT NOT NULL, -- 'pattern', 'fix', 'antipattern'
    title TEXT NOT NULL,
    description TEXT,
    file_path TEXT,
    code_snippet TEXT,
    confidence FLOAT,
    tags TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    validation_passed BOOLEAN DEFAULT FALSE,
    metadata JSONB
);

CREATE INDEX idx_kb_cards_type ON phase89_kb_cards(card_type);
CREATE INDEX idx_kb_cards_confidence ON phase89_kb_cards(confidence DESC);
CREATE INDEX idx_kb_cards_tags ON phase89_kb_cards USING gin(tags);

-- =====================================================
-- Error Clusters Table
-- =====================================================
CREATE TABLE phase89_error_clusters (
    id SERIAL PRIMARY KEY,
    cluster_id INTEGER NOT NULL,
    cluster_pattern TEXT NOT NULL,
    error_instance_id BIGINT REFERENCES phase89_error_instances(id),
    confidence FLOAT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

CREATE INDEX idx_clusters_id ON phase89_error_clusters(cluster_id);
CREATE INDEX idx_clusters_pattern ON phase89_error_clusters(cluster_pattern);
CREATE INDEX idx_clusters_error ON phase89_error_clusters(error_instance_id);

-- =====================================================
-- Timeline Events Table
-- =====================================================
CREATE TABLE phase89_timeline (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    event_type TEXT NOT NULL, -- 'fix_attempt', 'kb_update', 'cluster_found', 'embedding_generated'
    file_path TEXT,
    success BOOLEAN,
    details TEXT,
    metadata JSONB
);

CREATE INDEX idx_timeline_timestamp ON phase89_timeline(timestamp DESC);
CREATE INDEX idx_timeline_event_type ON phase89_timeline(event_type);
CREATE INDEX idx_timeline_success ON phase89_timeline(success);

-- =====================================================
-- Cosine Similarity Rankings Table
-- =====================================================
CREATE TABLE phase89_cosine_rankings (
    id SERIAL PRIMARY KEY,
    query_text TEXT NOT NULL,
    top_match TEXT NOT NULL,
    similarity_score FLOAT NOT NULL,
    confidence_boost FLOAT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

CREATE INDEX idx_rankings_similarity ON phase89_cosine_rankings(similarity_score DESC);
CREATE INDEX idx_rankings_timestamp ON phase89_cosine_rankings(created_at DESC);

-- =====================================================
-- AST Signatures Table (for GPU clustering)
-- =====================================================
-- Note: phase89_ast_signatures might already exist from indexer, so we use IF NOT EXISTS
CREATE TABLE IF NOT EXISTS phase89_ast_signatures (
    id SERIAL PRIMARY KEY,
    file_path TEXT NOT NULL UNIQUE,
    imports TEXT[],
    exports TEXT[],
    declarations TEXT[],
    runes_usage TEXT[], -- ['$state', '$derived', '$effect', etc.]
    shape_metrics JSONB, -- {loc, complexity, depth, etc.}
    signature_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ast_signatures_file ON phase89_ast_signatures(file_path);
CREATE INDEX IF NOT EXISTS idx_ast_signatures_hash ON phase89_ast_signatures(signature_hash);
CREATE INDEX IF NOT EXISTS idx_ast_signatures_runes ON phase89_ast_signatures USING gin(runes_usage);

-- =====================================================
-- Views for Dashboard Aggregations
-- =====================================================

-- Health Overview
CREATE OR REPLACE VIEW phase89_health_summary AS
SELECT
    COUNT(*) FILTER (WHERE status = 'open') as total_open,
    COUNT(*) FILTER (WHERE status = 'resolved') as total_resolved,
    COUNT(*) FILTER (WHERE status = 'stale') as total_stale,
    CASE
        WHEN COUNT(*) > 0 THEN
            ROUND((COUNT(*) FILTER (WHERE status = 'resolved')::NUMERIC / COUNT(*)::NUMERIC) * 100, 1)
        ELSE 0
    END as resolution_rate
FROM phase89_error_instances;

-- Cluster Summary
CREATE OR REPLACE VIEW phase89_cluster_summary AS
SELECT
    cluster_id,
    cluster_pattern,
    COUNT(*) as error_count,
    AVG(confidence) as avg_confidence
FROM phase89_error_clusters
GROUP BY cluster_id, cluster_pattern
ORDER BY error_count DESC;

-- Fix Attempt Success Rate
CREATE OR REPLACE VIEW phase89_fix_success_rate AS
SELECT
    COUNT(*) FILTER (WHERE status = 'success') as successful_fixes,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_fixes,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_fixes,
    CASE
        WHEN COUNT(*) > 0 THEN
            ROUND((COUNT(*) FILTER (WHERE status = 'success')::NUMERIC / COUNT(*)::NUMERIC) * 100, 1)
        ELSE 0
    END as success_rate
FROM phase89_fix_attempts;

-- =====================================================
-- Triggers for Updated Timestamps
-- =====================================================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop triggers if they exist before creating
DROP TRIGGER IF EXISTS phase89_kb_cards_update ON phase89_kb_cards;
CREATE TRIGGER phase89_kb_cards_update
    BEFORE UPDATE ON phase89_kb_cards
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS phase89_ast_signatures_update ON phase89_ast_signatures;
CREATE TRIGGER phase89_ast_signatures_update
    BEFORE UPDATE ON phase89_ast_signatures
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- =====================================================
-- Insert Sample Data for Dashboard Testing
-- =====================================================

-- Sample Timeline Events
INSERT INTO phase89_timeline (event_type, file_path, success, details) VALUES
('fix_attempt', 'src/routes/admin/phase89/+page.svelte', true, 'Successfully migrated to Svelte 5 runes'),
('kb_update', 'src/lib/stores/barrel.svelte.ts', true, 'Added $state pattern card'),
('cluster_found', 'src/routes/api/admin/routes/+server.ts', true, 'Cluster #42: TypeScript import errors'),
('embedding_generated', 'src/lib/server/knowledge-base.ts', true, 'Generated 768-dim embedding'),
('fix_attempt', 'src/routes/legal-ai/+page.svelte', false, 'Validation failed: svelte-check errors');

-- Sample Cosine Rankings
INSERT INTO phase89_cosine_rankings (query_text, top_match, similarity_score, confidence_boost) VALUES
('Svelte 5 $state reactivity', 'src/lib/stores/barrel.svelte.ts', 0.92, 0.15),
('TypeScript import errors', 'src/routes/api/admin/routes/+server.ts', 0.88, 0.12),
('SSR hydration issues', 'src/routes/+layout.server.ts', 0.85, 0.10),
('PostgreSQL query optimization', 'src/lib/server/db.ts', 0.83, 0.08),
('Redis cache invalidation', 'src/lib/server/cache.ts', 0.79, 0.05);

-- Sample KB Cards
INSERT INTO phase89_kb_cards (card_type, title, description, file_path, confidence, tags, validation_passed) VALUES
('pattern', 'Svelte 5 Reactive State', 'Use $state rune instead of let variables', 'src/lib/stores/barrel.svelte.ts', 0.95, ARRAY['svelte5', 'reactivity', 'runes'], true),
('fix', 'TypeScript Import Resolution', 'Use explicit .ts extension for SvelteKit imports', 'src/routes/api/admin/routes/+server.ts', 0.88, ARRAY['typescript', 'imports'], true),
('antipattern', 'Direct DOM Manipulation', 'Avoid document.querySelector in SSR context', 'src/lib/utils/legacy.ts', 0.82, ARRAY['ssr', 'dom', 'antipattern'], false);

-- Sample Error Clusters (linking to existing instances if any)
INSERT INTO phase89_error_clusters (cluster_id, cluster_pattern, error_instance_id, confidence)
SELECT
    42,
    'TypeScript import resolution errors',
    id,
    0.85
FROM phase89_error_instances
WHERE message LIKE '%Cannot find module%'
LIMIT 5;

-- Sample Fix Attempts
INSERT INTO phase89_fix_attempts (error_instance_id, file_path, fix_type, status, confidence_score)
SELECT
    id,
    file_path,
    'agentic',
    CASE WHEN random() > 0.3 THEN 'success' ELSE 'failed' END,
    0.7 + (random() * 0.3)
FROM phase89_error_instances
LIMIT 10;

-- =====================================================
-- Verification Queries
-- =====================================================

-- Check all tables exist
SELECT
    tablename,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = tablename) as column_count
FROM pg_tables
WHERE tablename LIKE 'phase89%'
ORDER BY tablename;

-- Check sample data counts
SELECT
    'fix_attempts' as table_name, COUNT(*) as row_count FROM phase89_fix_attempts
UNION ALL
SELECT 'kb_cards', COUNT(*) FROM phase89_kb_cards
UNION ALL
SELECT 'error_clusters', COUNT(*) FROM phase89_error_clusters
UNION ALL
SELECT 'timeline', COUNT(*) FROM phase89_timeline
UNION ALL
SELECT 'cosine_rankings', COUNT(*) FROM phase89_cosine_rankings
UNION ALL
SELECT 'ast_signatures', COUNT(*) FROM phase89_ast_signatures;

-- Test health summary view
SELECT * FROM phase89_health_summary;
