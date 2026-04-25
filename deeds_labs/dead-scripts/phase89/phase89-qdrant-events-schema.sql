-- Phase 89: Qdrant Event Timeline (Audit Layer)
-- Authoritative timeline for all Qdrant operations

CREATE TABLE IF NOT EXISTS phase89_qdrant_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor TEXT NOT NULL,  -- service/script: phase89-redis-qdrant-cache-indexer, ace-synth, etc.
    op TEXT NOT NULL,  -- upsert | delete | payload_patch | collection_create
    collection TEXT NOT NULL,  -- phase89_code_units, phase89_cache_index, etc.
    point_id TEXT,  -- Qdrant point ID (can be int or uuid as text)
    vector_hash TEXT,  -- sha256 of signature text (for dedup)
    payload_hash TEXT,  -- sha256 of normalized payload json
    redis_key_ref TEXT,  -- optional: the cache key that produced it
    diff_json JSONB,  -- optional: what changed
    run_id UUID,  -- correlation ID for batch runs
    metadata JSONB,  -- flexible: codec, size, tags, confidence, etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_qdrant_events_ts ON phase89_qdrant_events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_qdrant_events_actor ON phase89_qdrant_events(actor);
CREATE INDEX IF NOT EXISTS idx_qdrant_events_collection ON phase89_qdrant_events(collection);
CREATE INDEX IF NOT EXISTS idx_qdrant_events_run_id ON phase89_qdrant_events(run_id);
CREATE INDEX IF NOT EXISTS idx_qdrant_events_redis_key ON phase89_qdrant_events(redis_key_ref);

-- GIN index for metadata JSONB queries
CREATE INDEX IF NOT EXISTS idx_qdrant_events_metadata ON phase89_qdrant_events USING GIN(metadata);

-- Example queries:
-- Recent events: SELECT * FROM phase89_qdrant_events ORDER BY ts DESC LIMIT 100;
-- By actor: SELECT * FROM phase89_qdrant_events WHERE actor = 'ace-synth' ORDER BY ts DESC;
-- By collection: SELECT * FROM phase89_qdrant_events WHERE collection = 'phase89_cache_index';
-- By feature tag: SELECT * FROM phase89_qdrant_events WHERE metadata @> '{"feature_tags": ["svelte"]}';
