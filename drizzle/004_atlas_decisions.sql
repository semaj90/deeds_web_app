-- Migration 004: Create atlas_decisions table
CREATE TABLE atlas_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    rationale TEXT NOT NULL,
    source_refs JSONB, -- Storing array of source references
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
-- Indexing for faster lookup on titles
CREATE INDEX idx_atlas_decisions_title ON atlas_decisions(title);
-- Indexing on source_refs for tracing decisions
CREATE INDEX idx_atlas_decisions_source_refs ON atlas_decisions USING GIN (source_refs);