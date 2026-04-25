-- Phase 89: Non-Destructive Schema Migration
-- Creates new tables without touching existing data
-- Run with: docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -f /path/to/this/file.sql

-- ============================================================
-- 1. Error Instances (History, Never Delete)
-- ============================================================

CREATE TABLE IF NOT EXISTS phase89_error_instances (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,                     -- 'svelte-check' | 'tsc' | 'eslint'
  file_path TEXT NOT NULL,
  line INT,
  col INT,
  message TEXT NOT NULL,
  instance_hash TEXT NOT NULL UNIQUE,       -- sha256(source|file|line|col|message)
  model TEXT NOT NULL DEFAULT 'embeddinggemma:latest',
  text_hash TEXT NOT NULL,                  -- sha256(normalized message)
  embedding_id BIGINT,                      -- FK to phase89_embeddings (nullable until linked)
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  run_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',      -- open|resolved|stale|suppressed
  tags TEXT[]                               -- e.g., ['TS1005', 'brace_drift', 'syntax']
);

CREATE INDEX IF NOT EXISTS idx_p89_instances_status ON phase89_error_instances(status);
CREATE INDEX IF NOT EXISTS idx_p89_instances_file   ON phase89_error_instances(file_path);
CREATE INDEX IF NOT EXISTS idx_p89_instances_seen   ON phase89_error_instances(last_seen);
CREATE INDEX IF NOT EXISTS idx_p89_instances_hash   ON phase89_error_instances(instance_hash);
CREATE INDEX IF NOT EXISTS idx_p89_instances_text_hash ON phase89_error_instances(text_hash);

COMMENT ON TABLE phase89_error_instances IS 'Error history - never deleted, only marked stale';
COMMENT ON COLUMN phase89_error_instances.instance_hash IS 'Unique identifier for this exact error instance';
COMMENT ON COLUMN phase89_error_instances.text_hash IS 'Links to deduplicated embedding';

-- ============================================================
-- 2. Embeddings (Deduplicated)
-- ============================================================

CREATE TABLE IF NOT EXISTS phase89_embeddings (
  id BIGSERIAL PRIMARY KEY,
  model TEXT NOT NULL,                      -- 'embeddinggemma:latest'
  text_hash TEXT NOT NULL,                  -- sha256(normalized text)
  dim INT NOT NULL,                         -- 768 or 1024
  embedding BYTEA NOT NULL,                 -- Stored as binary (float32 array)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(model, text_hash)
);

CREATE INDEX IF NOT EXISTS idx_p89_embeddings_model ON phase89_embeddings(model);
CREATE INDEX IF NOT EXISTS idx_p89_embeddings_hash  ON phase89_embeddings(text_hash);

COMMENT ON TABLE phase89_embeddings IS 'Deduplicated embeddings - one per unique normalized text';
COMMENT ON COLUMN phase89_embeddings.text_hash IS 'sha256 of normalized message (case-insensitive, whitespace-normalized)';

-- Add FK constraint
ALTER TABLE phase89_error_instances
  DROP CONSTRAINT IF EXISTS fk_p89_instance_embedding;

ALTER TABLE phase89_error_instances
  ADD CONSTRAINT fk_p89_instance_embedding
  FOREIGN KEY (embedding_id)
  REFERENCES phase89_embeddings(id)
  ON DELETE SET NULL;

-- ============================================================
-- 3. Fix Attempts (Learning Loop)
-- ============================================================

CREATE TABLE IF NOT EXISTS phase89_fix_attempts (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model TEXT NOT NULL,                         -- 'gemma3-legal:latest'
  target_instance_hashes TEXT[] NOT NULL,      -- Array of instance hashes this fix targets
  retrieved_chunk_ids TEXT[] NOT NULL,         -- Qdrant chunk IDs used for context
  patch_diff TEXT NOT NULL,                    -- Git-style diff
  validation_cmd TEXT NOT NULL,                -- e.g., 'svelte-check'
  validation_before JSONB,                     -- Error counts before fix
  validation_after  JSONB,                     -- Error counts after fix
  success BOOLEAN NOT NULL,
  root_cause_tags TEXT[] NOT NULL,             -- e.g., ['brace_drift', 'TS1005']
  execution_time_ms INT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_p89_fix_attempts_success ON phase89_fix_attempts(success);
CREATE INDEX IF NOT EXISTS idx_p89_fix_attempts_created ON phase89_fix_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_p89_fix_attempts_tags    ON phase89_fix_attempts USING GIN(root_cause_tags);

COMMENT ON TABLE phase89_fix_attempts IS 'Every fix attempt (success or failure) for learning';

-- ============================================================
-- 4. KB Cards (Knowledge Base)
-- ============================================================

CREATE TABLE IF NOT EXISTS phase89_kb_cards (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,                       -- Markdown playbook
  tags TEXT[] NOT NULL,                        -- Root cause tags
  source_fix_attempt_id BIGINT,                -- FK to fix_attempts
  confidence_score FLOAT DEFAULT 0.5,          -- Increases with successful applications
  times_applied INT DEFAULT 0,
  times_successful INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_p89_kb_cards_tags ON phase89_kb_cards USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_p89_kb_cards_source ON phase89_kb_cards(source_fix_attempt_id);

ALTER TABLE phase89_kb_cards
  DROP CONSTRAINT IF EXISTS fk_p89_kb_source_fix;

ALTER TABLE phase89_kb_cards
  ADD CONSTRAINT fk_p89_kb_source_fix
  FOREIGN KEY (source_fix_attempt_id)
  REFERENCES phase89_fix_attempts(id)
  ON DELETE SET NULL;

COMMENT ON TABLE phase89_kb_cards IS 'Learned playbooks from successful fixes';
COMMENT ON COLUMN phase89_kb_cards.confidence_score IS 'min(avg_success_score * (times_applied / (times_applied + 10)), 1.0)';

-- ============================================================
-- 5. Cluster Recommendations (CUDA Output)
-- ============================================================

CREATE TABLE IF NOT EXISTS error_cluster_recommendations (
  id BIGSERIAL PRIMARY KEY,
  cluster_id INT NOT NULL,
  priority_score FLOAT NOT NULL,
  summary TEXT NOT NULL,
  error_instance_hashes TEXT[] NOT NULL,       -- Array of instance hashes in this cluster
  centroid_vector BYTEA,                       -- Cluster centroid (float32 array)
  recommended_actions JSONB,                   -- Structured recommendations
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_p89_cluster_priority ON error_cluster_recommendations(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_p89_cluster_id ON error_cluster_recommendations(cluster_id);

COMMENT ON TABLE error_cluster_recommendations IS 'CUDA clustering output with batch summaries';

-- ============================================================
-- 6. Knowledge Graph (KAG)
-- ============================================================

CREATE TABLE IF NOT EXISTS kag_nodes (
  id BIGSERIAL PRIMARY KEY,
  node_id TEXT NOT NULL UNIQUE,               -- e.g., 'error:TS1005:instance123'
  node_type TEXT NOT NULL,                    -- 'error', 'fix', 'file', 'pattern'
  properties JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kag_nodes_type ON kag_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_kag_nodes_id   ON kag_nodes(node_id);

CREATE TABLE IF NOT EXISTS kag_edges (
  id BIGSERIAL PRIMARY KEY,
  from_node TEXT NOT NULL,                    -- node_id
  to_node TEXT NOT NULL,                      -- node_id
  relation_type TEXT NOT NULL,                -- 'FIX_RESOLVES_ERROR', 'FILE_HAS_ERROR', 'SIMILAR_TO'
  properties JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kag_edges_from ON kag_edges(from_node);
CREATE INDEX IF NOT EXISTS idx_kag_edges_to   ON kag_edges(to_node);
CREATE INDEX IF NOT EXISTS idx_kag_edges_type ON kag_edges(relation_type);

COMMENT ON TABLE kag_nodes IS 'Knowledge graph nodes (errors, fixes, files, patterns)';
COMMENT ON TABLE kag_edges IS 'Knowledge graph edges (relationships)';

-- ============================================================
-- 7. Import Edges (File Dependency Graph)
-- ============================================================

CREATE TABLE IF NOT EXISTS phase89_import_edges (
  id BIGSERIAL PRIMARY KEY,
  from_file TEXT NOT NULL,
  to_file   TEXT NOT NULL,
  kind      TEXT NOT NULL,                    -- 'import' | 'dynamic_import' | 'reexport'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(from_file, to_file, kind)
);

CREATE INDEX IF NOT EXISTS idx_p89_edges_from ON phase89_import_edges(from_file);
CREATE INDEX IF NOT EXISTS idx_p89_edges_to   ON phase89_import_edges(to_file);

COMMENT ON TABLE phase89_import_edges IS 'File dependency graph for topology-aware fixing';

-- ============================================================
-- 8. Code Unit Index (Routes, Components, Modules)
-- ============================================================

CREATE TABLE IF NOT EXISTS phase89_unit_index (
  id BIGSERIAL PRIMARY KEY,
  unit_id TEXT NOT NULL UNIQUE,               -- sha256(file_path)
  file_path TEXT NOT NULL,
  route_id TEXT,                              -- SvelteKit route path
  unit_kind TEXT NOT NULL,                    -- page|layout|endpoint|component|module
  feature_tags TEXT[],
  content_hash TEXT NOT NULL,
  signature_text TEXT,
  context_text TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_p89_unit_kind ON phase89_unit_index(unit_kind);
CREATE INDEX IF NOT EXISTS idx_p89_unit_route ON phase89_unit_index(route_id);
CREATE INDEX IF NOT EXISTS idx_p89_unit_tags ON phase89_unit_index USING GIN(feature_tags);

COMMENT ON TABLE phase89_unit_index IS 'Index of all code units for fast filtering and similarity search';

-- ============================================================
-- 9. Migration from Existing Schema
-- ============================================

-- Migrate raw_error_embeddings to new schema (if data exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM raw_error_embeddings LIMIT 1) THEN
    INSERT INTO phase89_embeddings (model, text_hash, dim, embedding, created_at)
    SELECT
      model,
      encode(digest(content, 'sha256'), 'hex') as text_hash,
      vector_dim as dim,
      embedding,
      created_at
    FROM raw_error_embeddings
    ON CONFLICT (model, text_hash) DO NOTHING;

    RAISE NOTICE 'Migrated % embeddings from raw_error_embeddings',
      (SELECT COUNT(*) FROM phase89_embeddings);
  END IF;
END $$;

-- ============================================================
-- 9. Helper Views
-- ============================================================

CREATE OR REPLACE VIEW phase89_active_errors AS
SELECT
  i.*,
  e.embedding,
  e.dim
FROM phase89_error_instances i
LEFT JOIN phase89_embeddings e ON i.embedding_id = e.id
WHERE i.status = 'open'
ORDER BY i.last_seen DESC;

COMMENT ON VIEW phase89_active_errors IS 'Active (open) errors with embeddings joined';

CREATE OR REPLACE VIEW phase89_fix_success_rate AS
SELECT
  UNNEST(root_cause_tags) as root_cause,
  COUNT(*) FILTER (WHERE success=true) as successes,
  COUNT(*) FILTER (WHERE success=false) as failures,
  ROUND(100.0 * COUNT(*) FILTER (WHERE success=true) / NULLIF(COUNT(*), 0), 2) as success_rate
FROM phase89_fix_attempts
GROUP BY root_cause
ORDER BY success_rate DESC;

COMMENT ON VIEW phase89_fix_success_rate IS 'Success rate by root cause tag';

-- ============================================================
-- 10. Grant Permissions
-- ============================================================

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO legal_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO legal_admin;

-- ============================================================
-- Verification
-- ============================================================

SELECT
  'phase89_error_instances' as table_name,
  COUNT(*) as row_count
FROM phase89_error_instances
UNION ALL
SELECT 'phase89_embeddings', COUNT(*) FROM phase89_embeddings
UNION ALL
SELECT 'phase89_fix_attempts', COUNT(*) FROM phase89_fix_attempts
UNION ALL
SELECT 'phase89_kb_cards', COUNT(*) FROM phase89_kb_cards
UNION ALL
SELECT 'error_cluster_recommendations', COUNT(*) FROM error_cluster_recommendations
UNION ALL
SELECT 'kag_nodes', COUNT(*) FROM kag_nodes
UNION ALL
SELECT 'kag_edges', COUNT(*) FROM kag_edges
UNION ALL
SELECT 'phase89_import_edges', COUNT(*) FROM phase89_import_edges;

\echo '✅ Phase 89 schema initialized!'
