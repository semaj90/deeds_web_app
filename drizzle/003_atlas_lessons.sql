-- Migration 003: Create atlas_lessons table
CREATE TABLE atlas_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    failure_type VARCHAR(100) NOT NULL,
    query TEXT NOT NULL,
    fix TEXT,
    source_refs JSONB, -- Storing array of source references
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
-- Indexing for quick lookup of lessons by failure type
CREATE INDEX idx_atlas_lessons_failure_type ON atlas_lessons(failure_type);
-- Indexing on source_refs if they are frequently queried for specific tags
CREATE INDEX idx_atlas_lessons_source_refs ON atlas_lessons USING GIN (source_refs);