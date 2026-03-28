-- Migration: Add chat_uploads table for Docling-processed documents
-- Date: 2025-12-08
-- Purpose: Store uploaded documents processed with Docling OCR for contextual chat
-- Type: Additive (new table)

-- Create chat_uploads table
CREATE TABLE IF NOT EXISTS chat_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  minio_url TEXT NOT NULL,
  docling_result JSONB,
  extracted_keywords TEXT[] DEFAULT '{}',
  key_phrases TEXT[] DEFAULT '{}',
  suggestions TEXT[] DEFAULT '{}',
  file_size_bytes INTEGER,
  processing_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_uploads_user_id ON chat_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_uploads_case_id ON chat_uploads(case_id);
CREATE INDEX IF NOT EXISTS idx_chat_uploads_created_at ON chat_uploads(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_uploads_keywords ON chat_uploads USING gin(extracted_keywords);
CREATE INDEX IF NOT EXISTS idx_chat_uploads_key_phrases ON chat_uploads USING gin(key_phrases);

-- Add comments for documentation
COMMENT ON TABLE chat_uploads IS 'Stores uploaded documents processed with Docling OCR for contextual chat';
COMMENT ON COLUMN chat_uploads.minio_url IS 'MinIO URL in ai_chat_images bucket';
COMMENT ON COLUMN chat_uploads.docling_result IS 'Full Docling OCR and layout analysis result';
COMMENT ON COLUMN chat_uploads.extracted_keywords IS 'Keywords extracted from OCR text';
COMMENT ON COLUMN chat_uploads.key_phrases IS 'Key phrases extracted from OCR text';
COMMENT ON COLUMN chat_uploads.suggestions IS 'AI-generated suggestions based on document content';