-- Enable pgvector extension (idempotent) CREATE EXTENSION IF NOT EXISTS vector; -- Add embedding column to
legal_documents if it does not exist yet DO $$ BEGIN IF NOT EXISTS ( SELECT 1 FROM information_schema.columns WHERE
table_name = 'legal_documents' AND column_name = 'embedding' ) THEN ALTER TABLE legal_documents ADD COLUMN embedding
vector(384); RAISE NOTICE 'Added embedding vector(384) column to legal_documents'; END IF; END $$; -- Create IVFFLAT
cosine index on legal_documents.embedding (only after column exists) DO $$ BEGIN IF EXISTS ( SELECT 1 FROM
information_schema.columns WHERE table_name = 'legal_documents' AND column_name = 'embedding' ) THEN IF NOT EXISTS (
SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname =
'idx_legal_documents_embedding_cosine' ) THEN CREATE INDEX idx_legal_documents_embedding_cosine ON legal_documents USING
ivfflat (embedding vector_cosine_ops) WITH (lists = 100); RAISE NOTICE 'Created ivfflat index on
legal_documents.embedding (cosine, lists=100)'; END IF; END IF; END $$; -- (Optional) ANALYZE legal_documents; --
Uncomment after initial backfill to improve planner stats -- NOTE: -- 1. Populate embedding values before relying on the
IVFFLAT index for recall quality. -- 2. Ensure `SET enable_seqscan = off;` is NOT forced; allow planner to choose. -- 3.
After bulk insert: REINDEX / VACUUM (ANALYZE) as needed for performance.
