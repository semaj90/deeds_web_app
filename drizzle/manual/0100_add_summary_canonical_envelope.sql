-- MIGRATION: Add canonical summary envelope for Parent Atlas multihop
-- Date: 2026-06-28
-- Purpose: Establish summary_text as canonical source for packet summaries + source tracking
-- Compliance: Parent Atlas Frozen Identity Contract (multihop traversal requires summary provenance)

-- Add canonical summary envelope columns to codebase_chunk_index
ALTER TABLE codebase_chunk_index
  ADD COLUMN IF NOT EXISTS summary_text text,
  ADD COLUMN IF NOT EXISTS summary_source text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS summary_model text,
  ADD COLUMN IF NOT EXISTS summary_generated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS summary_confidence real DEFAULT 0.5;

-- Add canonical envelope tracking to atlas_packets
ALTER TABLE atlas_packets
  ADD COLUMN IF NOT EXISTS summary_text text,
  ADD COLUMN IF NOT EXISTS summary_source text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS summary_model text,
  ADD COLUMN IF NOT EXISTS summary_generated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS summary_confidence real DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS envelope_version integer DEFAULT 1;

-- Create index on summary_source for multihop provenance queries
CREATE INDEX IF NOT EXISTS idx_codebase_chunk_summary_source
ON codebase_chunk_index (summary_source)
WHERE summary_source IS NOT NULL AND summary_source != 'pending';

-- Create index on atlas_packets summary_source for multihop traversal
CREATE INDEX IF NOT EXISTS idx_atlas_packets_summary_source
ON atlas_packets (summary_source)
WHERE summary_source IS NOT NULL AND summary_source != 'pending';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON codebase_chunk_index TO legal_admin;
GRANT SELECT, INSERT, UPDATE ON atlas_packets TO legal_admin;