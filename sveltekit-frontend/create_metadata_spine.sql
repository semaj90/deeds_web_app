CREATE TABLE IF NOT EXISTS metadata_envelopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type TEXT NOT NULL,
    stable_key TEXT NOT NULL UNIQUE,
    repo_root TEXT,
    file_path TEXT,
    directory_path TEXT,
    name TEXT,
    language TEXT,
    content_hash TEXT,
    schema_version INTEGER NOT NULL DEFAULT 1,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    relations JSONB NOT NULL DEFAULT '[]'::jsonb,
    diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb,
    embedding_model TEXT,
    qdrant_collection TEXT,
    qdrant_point_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    indexed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS metadata_envelopes_source_type_idx ON metadata_envelopes(source_type);
CREATE INDEX IF NOT EXISTS metadata_envelopes_file_path_idx ON metadata_envelopes(file_path);
CREATE INDEX IF NOT EXISTS metadata_envelopes_metadata_gin ON metadata_envelopes USING GIN (metadata);
CREATE INDEX IF NOT EXISTS metadata_envelopes_features_gin ON metadata_envelopes USING GIN (features);
CREATE INDEX IF NOT EXISTS metadata_envelopes_relations_gin ON metadata_envelopes USING GIN (relations);

CREATE TABLE IF NOT EXISTS code_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_key TEXT NOT NULL,
    target_key TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    confidence DOUBLE PRECISION DEFAULT 1.0,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_file TEXT,
    source_line INTEGER,
    target_file TEXT,
    target_line INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS code_relations_source_idx ON code_relations(source_key);
CREATE INDEX IF NOT EXISTS code_relations_target_idx ON code_relations(target_key);
CREATE INDEX IF NOT EXISTS code_relations_type_idx ON code_relations(relation_type);
CREATE INDEX IF NOT EXISTS code_relations_evidence_gin ON code_relations USING GIN (evidence);

CREATE TABLE IF NOT EXISTS codebase_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_type TEXT NOT NULL,
    stable_key TEXT,
    actor TEXT NOT NULL DEFAULT 'system',
    status TEXT NOT NULL,
    input JSONB DEFAULT '{}'::jsonb,
    output JSONB DEFAULT '{}'::jsonb,
    error JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS codebase_audit_events_type_idx ON codebase_audit_events(audit_type);
CREATE INDEX IF NOT EXISTS codebase_audit_events_status_idx ON codebase_audit_events(status);
CREATE INDEX IF NOT EXISTS codebase_audit_events_input_gin ON codebase_audit_events USING GIN (input);
CREATE INDEX IF NOT EXISTS codebase_audit_events_output_gin ON codebase_audit_events USING GIN (output);

CREATE TABLE IF NOT EXISTS ace_retrieval_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    intent TEXT,
    mode TEXT,
    model TEXT,
    query_embedding_model TEXT,
    expanded_terms TEXT[] DEFAULT '{}',
    context_budget_tokens INTEGER,
    final_context_tokens INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ace_retrieval_hits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES ace_retrieval_runs(id) ON DELETE CASCADE,
    stable_key TEXT NOT NULL,
    chunk_id TEXT,
    file_path TEXT,
    source TEXT NOT NULL,
    vector_score DOUBLE PRECISION,
    graph_score DOUBLE PRECISION,
    tag_score DOUBLE PRECISION,
    recency_score DOUBLE PRECISION,
    error_relevance_score DOUBLE PRECISION,
    final_score DOUBLE PRECISION,
    rank INTEGER,
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
