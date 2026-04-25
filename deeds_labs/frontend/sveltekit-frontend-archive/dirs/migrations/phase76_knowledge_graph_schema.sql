-- ========================================
-- PostgreSQL 17 + pgvector Schema
-- ========================================
-- Purpose: Source of Truth for Knowledge Graph
-- Integration: Write-first layer, synced to Qdrant + CouchDB
--
-- Features:
-- - pgvector for embeddings (384 dimensions)
-- - Foreign keys to CouchDB nodes
-- - Metadata as JSONB
-- - ivfflat indexes for fast ANN search
-- ========================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ========================================
-- Main Knowledge Documents Table
-- ========================================
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id SERIAL PRIMARY KEY,

    -- Content
    title TEXT NOT NULL,
    content TEXT,
    source_url TEXT,

    -- Vector Embedding (384 dimensions for all-MiniLM-L6-v2 or similar)
    embedding vector(384),

    -- Cross-Database IDs
    couchdb_id TEXT UNIQUE, -- Format: "node:{id}"
    qdrant_id BIGINT,       -- ID in Qdrant collection

    -- Metadata
    metadata JSONB,
    -- Example: {
    --   "type": "concept",
    --   "source": "svelte-docs",
    --   "tags": ["reactivity", "runes"],
    --   "importance": 0.95,
    --   "language": "typescript"
    -- }

    -- MinIO Blob Storage
    blob_url TEXT, -- MinIO object URL (if document has PDF/image)
    blob_metadata JSONB, -- {size, mime_type, uploaded_at}

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_synced_to_qdrant TIMESTAMP, -- Track sync state

    -- Full-text search (tsvector)
    content_tsvector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(content, '')), 'B')
    ) STORED
);

-- ========================================
-- Indexes
-- ========================================

-- 1. Vector similarity search (ivfflat for cosine similarity)
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding
    ON knowledge_documents
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100); -- Adjust lists based on dataset size

-- 2. CouchDB ID lookup
CREATE INDEX IF NOT EXISTS idx_knowledge_couchdb_id
    ON knowledge_documents (couchdb_id);

-- 3. Qdrant ID lookup
CREATE INDEX IF NOT EXISTS idx_knowledge_qdrant_id
    ON knowledge_documents (qdrant_id);

-- 4. Full-text search
CREATE INDEX IF NOT EXISTS idx_knowledge_content_tsvector
    ON knowledge_documents
    USING GIN (content_tsvector);

-- 5. Metadata JSONB queries
CREATE INDEX IF NOT EXISTS idx_knowledge_metadata
    ON knowledge_documents
    USING GIN (metadata jsonb_path_ops);

-- 6. Source filtering
CREATE INDEX IF NOT EXISTS idx_knowledge_source
    ON knowledge_documents ((metadata->>'source'));

-- 7. Sync tracking
CREATE INDEX IF NOT EXISTS idx_knowledge_needs_sync
    ON knowledge_documents (last_synced_to_qdrant)
    WHERE last_synced_to_qdrant IS NULL
       OR updated_at > last_synced_to_qdrant;

-- ========================================
-- Knowledge Relationships Table
-- ========================================
-- Store explicit relationships (complements CouchDB edges)
CREATE TABLE IF NOT EXISTS knowledge_relationships (
    id SERIAL PRIMARY KEY,
    from_id INTEGER NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    to_id INTEGER NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL, -- 'related_to', 'implements', 'extends', etc.
    weight REAL DEFAULT 0.5 CHECK (weight >= 0 AND weight <= 1),
    bidirectional BOOLEAN DEFAULT FALSE,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),

    -- Unique constraint: one relationship type per pair
    UNIQUE(from_id, to_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_relationships_from
    ON knowledge_relationships (from_id);

CREATE INDEX IF NOT EXISTS idx_relationships_to
    ON knowledge_relationships (to_id);

CREATE INDEX IF NOT EXISTS idx_relationships_type
    ON knowledge_relationships (relationship_type);

-- ========================================
-- Sync Queue Table
-- ========================================
-- Track documents that need syncing to Qdrant
CREATE TABLE IF NOT EXISTS sync_queue (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_pending
    ON sync_queue (created_at)
    WHERE processed_at IS NULL;

-- ========================================
-- Functions
-- ========================================

-- Function: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update updated_at on knowledge_documents
DROP TRIGGER IF EXISTS trigger_update_knowledge_documents_updated_at ON knowledge_documents;
CREATE TRIGGER trigger_update_knowledge_documents_updated_at
    BEFORE UPDATE ON knowledge_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function: Auto-add to sync queue on insert/update
CREATE OR REPLACE FUNCTION queue_sync_on_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO sync_queue (document_id, operation)
        VALUES (NEW.id, 'insert');
    ELSIF (TG_OP = 'UPDATE' AND (NEW.embedding IS DISTINCT FROM OLD.embedding OR NEW.metadata IS DISTINCT FROM OLD.metadata)) THEN
        INSERT INTO sync_queue (document_id, operation)
        VALUES (NEW.id, 'update');
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO sync_queue (document_id, operation)
        VALUES (OLD.id, 'delete');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Queue sync on insert/update/delete
DROP TRIGGER IF EXISTS trigger_queue_sync_on_knowledge_change ON knowledge_documents;
CREATE TRIGGER trigger_queue_sync_on_knowledge_change
    AFTER INSERT OR UPDATE OR DELETE ON knowledge_documents
    FOR EACH ROW
    EXECUTE FUNCTION queue_sync_on_change();

-- ========================================
-- Utility Functions
-- ========================================

-- Function: Search by vector similarity
CREATE OR REPLACE FUNCTION search_by_embedding(
    query_embedding vector(384),
    limit_count INTEGER DEFAULT 10,
    similarity_threshold REAL DEFAULT 0.5
)
RETURNS TABLE (
    id INTEGER,
    title TEXT,
    content TEXT,
    couchdb_id TEXT,
    similarity REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        kd.id,
        kd.title,
        kd.content,
        kd.couchdb_id,
        1 - (kd.embedding <=> query_embedding) AS similarity
    FROM knowledge_documents kd
    WHERE kd.embedding IS NOT NULL
      AND 1 - (kd.embedding <=> query_embedding) > similarity_threshold
    ORDER BY kd.embedding <=> query_embedding
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Search by full-text
CREATE OR REPLACE FUNCTION search_by_text(
    query_text TEXT,
    limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
    id INTEGER,
    title TEXT,
    content TEXT,
    couchdb_id TEXT,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        kd.id,
        kd.title,
        kd.content,
        kd.couchdb_id,
        ts_rank(kd.content_tsvector, websearch_to_tsquery('english', query_text)) AS rank
    FROM knowledge_documents kd
    WHERE kd.content_tsvector @@ websearch_to_tsquery('english', query_text)
    ORDER BY rank DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Get documents needing sync
CREATE OR REPLACE FUNCTION get_documents_needing_sync()
RETURNS TABLE (
    id INTEGER,
    title TEXT,
    embedding vector(384),
    couchdb_id TEXT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        kd.id,
        kd.title,
        kd.embedding,
        kd.couchdb_id,
        kd.metadata
    FROM knowledge_documents kd
    WHERE kd.last_synced_to_qdrant IS NULL
       OR kd.updated_at > kd.last_synced_to_qdrant
    ORDER BY kd.updated_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- Sample Data (Optional)
-- ========================================

-- Example: Insert Svelte 5 knowledge
-- INSERT INTO knowledge_documents (
--     title,
--     content,
--     source_url,
--     couchdb_id,
--     metadata
-- ) VALUES (
--     'Svelte 5 $props() Rune',
--     'The $props() rune is used to declare component props in Svelte 5...',
--     'https://svelte.dev/docs/svelte/runes#$props',
--     'node:svelte_props_rune',
--     '{"type": "concept", "source": "svelte-docs", "tags": ["runes", "props"], "importance": 0.95}'::jsonb
-- );

-- ========================================
-- Monitoring Queries
-- ========================================

-- View: Documents pending sync
CREATE OR REPLACE VIEW pending_sync_view AS
SELECT
    id,
    title,
    couchdb_id,
    updated_at,
    last_synced_to_qdrant,
    EXTRACT(EPOCH FROM (NOW() - updated_at)) AS seconds_since_update
FROM knowledge_documents
WHERE last_synced_to_qdrant IS NULL
   OR updated_at > last_synced_to_qdrant
ORDER BY updated_at DESC;

-- View: Sync queue status
CREATE OR REPLACE VIEW sync_queue_status AS
SELECT
    operation,
    COUNT(*) FILTER (WHERE processed_at IS NULL) AS pending,
    COUNT(*) FILTER (WHERE processed_at IS NOT NULL AND error_message IS NULL) AS success,
    COUNT(*) FILTER (WHERE error_message IS NOT NULL) AS failed
FROM sync_queue
GROUP BY operation;

-- ========================================
-- Grant Permissions (Adjust as needed)
-- ========================================
-- GRANT ALL ON knowledge_documents TO your_app_user;
-- GRANT ALL ON knowledge_relationships TO your_app_user;
-- GRANT ALL ON sync_queue TO your_app_user;
