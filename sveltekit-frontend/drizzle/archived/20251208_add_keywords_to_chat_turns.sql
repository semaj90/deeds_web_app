-- Migration: Add keywords, suggestions, and image URLs to chat_turns table
-- Date: 2025-12-08
-- Purpose: Persist extracted keywords, suggestions, and image references from AI chat
-- Type: Non-breaking (additive only)

-- Add columns to chat_turns table
ALTER TABLE chat_turns
  ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS extracted_keywords text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS key_phrases text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS suggestions text[] DEFAULT '{}';

-- Create indices for keyword search
CREATE INDEX IF NOT EXISTS idx_chat_turns_keywords
  ON chat_turns USING gin(extracted_keywords);

CREATE INDEX IF NOT EXISTS idx_chat_turns_key_phrases
  ON chat_turns USING gin(key_phrases);

-- Create index for case_id + created_at for efficient history queries
CREATE INDEX IF NOT EXISTS idx_chat_turns_case_created
  ON chat_turns(case_id, created_at DESC);

-- Add comment for documentation
COMMENT ON COLUMN chat_turns.image_urls IS 'Array of MinIO image URLs from ai_chat_images bucket';
COMMENT ON COLUMN chat_turns.extracted_keywords IS 'Array of keywords extracted from uploaded documents';
COMMENT ON COLUMN chat_turns.key_phrases IS 'Array of key phrases extracted from uploaded documents';
COMMENT ON COLUMN chat_turns.suggestions IS 'Array of AI-generated suggestions for follow-up questions';
