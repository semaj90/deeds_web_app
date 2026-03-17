-- Add unique index on source_hash so ON CONFLICT (source_hash) works in indexer scripts.
-- Safe to run multiple times (IF NOT EXISTS).
CREATE UNIQUE INDEX IF NOT EXISTS library_docs_source_hash_uidx
  ON library_documents(source_hash)
  WHERE source_hash IS NOT NULL;
