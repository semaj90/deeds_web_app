-- =================================================================
-- 001_graphify_lineage.sql
-- Migration: Establishes the canonical, authoritative source of truth for
-- file indexing, symbol tracking, and lineage tracking.
-- Source: Claude AI Agent
-- =================================================================

-- 1. graphify_runs: Tracks the overall execution of any lineage audit/indexing job.
CREATE TABLE graphify_runs (
    run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    repository_revision text NOT NULL, -- The Git commit SHA used for the run
    base_revision text,
    parser_contract_version text NOT NULL DEFAULT 'graphify.parser.v0.1',
    extraction_contract_version text NOT NULL DEFAULT 'graphify.extractor.v0.1',
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    status text NOT NULL DEFAULT 'RUNNING',
    dry_run boolean NOT NULL DEFAULT false,
    configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
    
    -- Ensures that only one major run can exist for a given workspace/revision/parser
    UNIQUE (workspace_id, repository_revision, parser_contract_version),
    
    -- Indexing for quick lookups by status
    INDEX idx_status_time (status, started_at)
);

-- 2. graphify_files: Tracks the state of every file processed in a given run.
CREATE TABLE graphify_files (
    file_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    source_ref text NOT NULL, -- Canonical path (e.g., 'src/lib/utils/foo.ts')
    source_revision text NOT NULL, -- The specific Git SHA when the file was seen
    content_hash text NOT NULL, -- SHA256 of the file content
    byte_length bigint NOT NULL,
    language text,
    parser_name text,
    parser_version text,
    parse_status text NOT NULL DEFAULT 'UNPROCESSED', -- UNPROCESSED, PARSED, FAILED
    parse_error jsonb,
    
    -- Lineage Pointers
    first_seen_run_id uuid NOT NULL REFERENCES graphify_runs(run_id) ON DELETE CASCADE,
    last_seen_run_id uuid NOT NULL REFERENCES graphify_runs(run_id) ON DELETE CASCADE,
    
    -- Constraint to prevent duplicate records for the same file/revision combination
    UNIQUE (workspace_id, source_ref, source_revision)
);

-- 3. graphify_symbols: Stores all deterministically extracted symbols (Functions, Classes, Types, etc.).
CREATE TABLE graphify_symbols (
    symbol_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id uuid NOT NULL REFERENCES graphify_files(file_id) ON DELETE CASCADE,
    stable_symbol_key text NOT NULL, -- e.g., "Utils.processData"
    symbol_kind text NOT NULL, -- class, function, type, method, etc.
    qualified_name text,
    parent_symbol_id uuid REFERENCES graphify_symbols(symbol_id),
    start_byte bigint NOT NULL,
    end_byte bigint NOT NULL,
    start_row integer NOT NULL,
    end_row integer NOT NULL,
    signature_text text,
    source_text_hash text NOT NULL,
    ast_fingerprint text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    
    -- Ensures unique identification within a file context
    UNIQUE (file_id, stable_symbol_key)
);

-- 4. graphify_edges: Tracks relationships between symbols (A -> B).
CREATE TABLE graphify_edges (
    edge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    subject_symbol_id uuid NOT NULL REFERENCES graphify_symbols(symbol_id) ON DELETE CASCADE,
    predicate text NOT NULL,
    object_symbol_id uuid REFERENCES graphify_symbols(symbol_id) ON DELETE SET NULL,
    unresolved_target text,
    evidence_kind text NOT NULL, -- e.g., 'function_call', 'type_use'
    evidence_span jsonb NOT NULL, -- { "start_byte": 100, "end_byte": 110 }
    confidence real NOT NULL,
    source_revision text NOT NULL
);

-- Add indexes for performance on lookup keys
CREATE INDEX idx_file_source_ref ON graphify_files (source_ref);
CREATE INDEX idx_symbol_key ON graphify_symbols (stable_symbol_key);
CREATE INDEX idx_edge_source_target ON graphify_edges (subject_symbol_id);

-- =================================================================
-- NOTE: This script only defines the schema. The ETL/Ingest logic
-- must then populate these tables transactionally.
-- =================================================================
