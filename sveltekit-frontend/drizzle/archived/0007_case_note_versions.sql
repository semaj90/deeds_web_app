-- Migration: Add note versioning support
-- Creates table to store historical snapshots of note content

CREATE TABLE IF NOT EXISTS case_note_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES case_notes(id) ON DELETE CASCADE,
  title text,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast retrieval of versions by note
CREATE INDEX IF NOT EXISTS idx_case_note_versions_note_id ON case_note_versions(note_id);

-- Index for ordering versions by creation date
CREATE INDEX IF NOT EXISTS idx_case_note_versions_created_at ON case_note_versions(note_id, created_at DESC);
