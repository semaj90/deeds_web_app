-- Migration: Add full-text search support to case_notes
-- Adds tsvector column with GIN index for fast full-text search

ALTER TABLE case_notes
ADD COLUMN IF NOT EXISTS content_tsv tsvector
GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,''))) STORED;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_case_notes_fts ON case_notes USING GIN (content_tsv);

-- Create index on case_id for faster filtering by case
CREATE INDEX IF NOT EXISTS idx_case_notes_case_id ON case_notes(case_id);

-- Create index on is_pinned for sorting
CREATE INDEX IF NOT EXISTS idx_case_notes_is_pinned ON case_notes(is_pinned DESC, updated_at DESC);
