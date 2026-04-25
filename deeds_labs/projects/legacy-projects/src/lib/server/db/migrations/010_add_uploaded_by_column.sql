-- Add uploaded_by column to documents table
-- This column tracks which user uploaded the document

ALTER TABLE documents ADD COLUMN uploaded_by UUID DEFAULT '00000000-0000-0000-0000-000000000000'::UUID;

-- Create index for uploaded_by for efficient queries
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);

-- Add NOT NULL constraint (already has default so existing rows will use default)
ALTER TABLE documents ALTER COLUMN uploaded_by SET NOT NULL;

COMMENT ON COLUMN documents.uploaded_by IS 'UUID of the user who uploaded this document. Uses system default UUID if not provided.';
