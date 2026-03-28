-- Repair citations table foreign key constraints -- This migration ensures proper foreign key relationships for
citations -- Check if citations table exists and add missing constraints DO $$ BEGIN -- Add document_id column if it
doesn't exist IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='citations' AND
column_name='document_id') THEN ALTER TABLE citations ADD COLUMN document_id UUID; RAISE NOTICE 'Added document_id
column to citations table'; END IF; -- Add foreign key constraint if it doesn't exist IF NOT EXISTS (SELECT 1 FROM
information_schema.table_constraints WHERE constraint_name='fk_citations_document_id') THEN ALTER TABLE citations ADD
CONSTRAINT fk_citations_document_id FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE; RAISE NOTICE
'Added foreign key constraint for citations.document_id'; END IF; END $$;
