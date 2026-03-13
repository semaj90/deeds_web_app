-- pgai Setup for Legal AI Platform
-- Runs after 01-init.sql — adds in-database AI capabilities via Ollama

-- Enable plpython3u (required by pgai)
CREATE EXTENSION IF NOT EXISTS plpython3u;

-- Install pgai vectorizer infrastructure (via CLI)
-- Note: `pgai install` is run separately after container boot

-- Install Ollama SQL functions (ollama_embed, ollama_generate, etc.)
\i /pgai-ollama-functions.sql

-- Verify
DO $$
BEGIN
    RAISE NOTICE 'pgai Ollama functions installed';
    RAISE NOTICE 'Available: ai.ollama_embed(), ai.ollama_generate(), ai.ollama_chat_complete()';
END $$;
