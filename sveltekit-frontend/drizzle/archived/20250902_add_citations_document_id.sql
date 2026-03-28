-- Add document_id column to citations table -- Links citations to their source documents DO $$ BEGIN -- Add document_id
column if it doesn't exist IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='citations' AND
column_name='document_id') THEN ALTER TABLE citations ADD COLUMN document_id UUID; RAISE NOTICE 'Added document_id
column to citations table'; -- Add foreign key constraint ALTER TABLE citations ADD CONSTRAINT fk_citations_document_id
FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL; RAISE NOTICE 'Added foreign key constraint for
citations.document_id'; -- Create index for performance CREATE INDEX idx_citations_document_id ON
citations(document_id); RAISE NOTICE 'Created index on citations.document_id'; ELSE RAISE NOTICE 'document_id column
already exists in citations table'; END IF; END $$;
