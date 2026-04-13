-- Migration: Add chat_document_attachments table
-- Date: 2026-04-12
-- Sprint 4B.5: Chat document upload integration

CREATE TABLE IF NOT EXISTS chat_document_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_session_id UUID NOT NULL REFERENCES yorha_chat_sessions(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER NOT NULL,
  file_type VARCHAR(100),
  minio_path VARCHAR(500),
  upload_timestamp TIMESTAMPTZ DEFAULT NOW(),
  embedding_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  qdrant_id UUID, -- ID in Qdrant chat_documents collection
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS chat_attachments_session_idx ON chat_document_attachments(chat_session_id);
CREATE INDEX IF NOT EXISTS chat_attachments_status_idx ON chat_document_attachments(embedding_status);
CREATE INDEX IF NOT EXISTS chat_attachments_document_idx ON chat_document_attachments(document_id);

-- Comments
COMMENT ON TABLE chat_document_attachments IS 'Files uploaded to chat sessions for context augmentation';
COMMENT ON COLUMN chat_document_attachments.embedding_status IS 'Tracks document chunking/embedding progress: pending → processing → completed/failed';
COMMENT ON COLUMN chat_document_attachments.qdrant_id IS 'UUID in Qdrant chat_documents collection for semantic search';