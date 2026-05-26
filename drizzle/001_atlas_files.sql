-- Migration 001: Create atlas_files table
CREATE TABLE atlas_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path TEXT NOT NULL UNIQUE,
    sha TEXT NOT NULL,
    language VARCHAR(50),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
-- Add index for faster lookups on path
CREATE INDEX idx_atlas_files_path ON atlas_files(path);