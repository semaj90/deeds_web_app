-- pgai + pgvectorscale + pg_cron Setup for Legal AI Platform
-- Runs after 01-init.sql — adds in-database AI, DiskANN indexes, and scheduled jobs

-- Enable plpython3u (required by pgai)
CREATE EXTENSION IF NOT EXISTS plpython3u;

-- Enable pgvectorscale (StreamingDiskANN + Statistical Binary Quantization)
-- CASCADE auto-installs pgvector if not present
CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;

-- Enable pg_cron (scheduled maintenance jobs)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Install Ollama SQL functions (ollama_embed, ollama_generate, etc.)
\i /pgai-ollama-functions.sql

-- Schedule weekly REINDEX on HNSW vector indexes (Sundays 3 AM)
SELECT cron.schedule(
    'reindex-evidence-hnsw',
    '0 3 * * 0',
    $$REINDEX INDEX CONCURRENTLY idx_evidence_embedding_hnsw$$
);

-- Schedule daily VACUUM ANALYZE on evidence table (2 AM)
SELECT cron.schedule(
    'vacuum-evidence',
    '0 2 * * *',
    $$VACUUM ANALYZE evidence$$
);

-- Verify
DO $$
BEGIN
    RAISE NOTICE 'Extensions installed:';
    RAISE NOTICE '  - pgvector (vector similarity search)';
    RAISE NOTICE '  - pgvectorscale (StreamingDiskANN + SBQ)';
    RAISE NOTICE '  - pg_cron (scheduled maintenance)';
    RAISE NOTICE '  - plpython3u + pgai Ollama functions';
    RAISE NOTICE 'Available: ai.ollama_embed(), ai.ollama_generate(), ai.ollama_chat_complete()';
    RAISE NOTICE 'Scheduled: reindex-evidence-hnsw (Sun 3AM), vacuum-evidence (daily 2AM)';
END $$;
