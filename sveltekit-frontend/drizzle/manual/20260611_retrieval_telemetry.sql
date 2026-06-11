-- Phase 3D retrieval telemetry contract.
-- Additive only. Records behavioral temperature for retrieval quality and cache policy.

CREATE TABLE IF NOT EXISTS retrieval_telemetry (
    id                    bigserial PRIMARY KEY,
    created_at            timestamptz NOT NULL DEFAULT now(),
    query                 text NOT NULL,
    query_hash            text NOT NULL,
    latency_ms            integer NOT NULL,
    vector_hits           integer NOT NULL DEFAULT 0,
    trigram_hits          integer NOT NULL DEFAULT 0,
    fts_hits              integer NOT NULL DEFAULT 0,
    selected_packet_key   text,
    selected_packet_keys  jsonb NOT NULL DEFAULT '[]'::jsonb,
    selected_feature_id   text,
    feature_ids           jsonb NOT NULL DEFAULT '[]'::jsonb,
    fusion_score          double precision,
    cache_hit             boolean NOT NULL DEFAULT false,
    surface               text NOT NULL,
    environment           text NOT NULL,
    retrieval_strategy    text NOT NULL DEFAULT 'hybrid'
);

CREATE INDEX IF NOT EXISTS idx_retrieval_telemetry_created_at
    ON retrieval_telemetry (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_retrieval_telemetry_query_hash
    ON retrieval_telemetry (query_hash);

CREATE INDEX IF NOT EXISTS idx_retrieval_telemetry_selected_packet_keys_gin
    ON retrieval_telemetry USING gin (selected_packet_keys);

CREATE INDEX IF NOT EXISTS idx_retrieval_telemetry_feature_ids_gin
    ON retrieval_telemetry USING gin (feature_ids);

CREATE INDEX IF NOT EXISTS idx_retrieval_telemetry_latency_ms
    ON retrieval_telemetry (latency_ms);

CREATE INDEX IF NOT EXISTS idx_retrieval_telemetry_strategy
    ON retrieval_telemetry (retrieval_strategy);

CREATE INDEX IF NOT EXISTS idx_retrieval_telemetry_surface
    ON retrieval_telemetry (surface);

CREATE INDEX IF NOT EXISTS idx_retrieval_telemetry_environment
    ON retrieval_telemetry (environment);

COMMENT ON TABLE retrieval_telemetry IS
    'Phase 3D behavioral retrieval telemetry. Records query behavior before cache policy, feature governance, or SeaweedFS automation.';
