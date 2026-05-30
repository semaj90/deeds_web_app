-- Create scenario_cache table (idempotent sidecar)
CREATE TABLE IF NOT EXISTS public.scenario_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_hash VARCHAR(64) NOT NULL UNIQUE,
    query TEXT NOT NULL,
    response TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index query_hash for fast exact lookups
CREATE INDEX IF NOT EXISTS idx_scenario_cache_query_hash ON public.scenario_cache(query_hash);
