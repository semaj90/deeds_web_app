-- Ensure foreign key constraint for document_sections.document_id -> documents(id) -- This may be redundant if earlier
migration already created it; we guard to avoid duplication errors. DO $$ BEGIN IF NOT EXISTS ( SELECT 1 FROM
information_schema.table_constraints tc WHERE tc.table_name = 'document_sections' AND tc.constraint_type = 'FOREIGN KEY'
AND tc.constraint_name = 'fk_document_sections_document_id' ) THEN ALTER TABLE document_sections ADD CONSTRAINT
fk_document_sections_document_id FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE; RAISE NOTICE
'Added missing FK fk_document_sections_document_id'; ELSE RAISE NOTICE 'FK fk_document_sections_document_id already
exists'; END IF; END $$; -- Safety: add index if missing (performance for joins / deletes) DO $$ BEGIN IF NOT EXISTS (
SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname =
'idx_document_sections_document_id' ) THEN CREATE INDEX idx_document_sections_document_id ON
document_sections(document_id); RAISE NOTICE 'Created idx_document_sections_document_id'; END IF; END $$;
