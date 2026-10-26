-- Legal corpus (library_documents -> legal_nodes -> legal_chunks) indexes.
-- Manual sidecar migration, not in drizzle/meta/_journal.json. Idempotent and additive:
-- no DROP, no data rewrite beyond the generated tsv columns.
-- Apply: docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < drizzle/manual/legal_corpus_indexes.sql

BEGIN;

-- legal_chunks has no tsv, but /api/statutes/search fallback queries lc.tsv.
ALTER TABLE legal_chunks
  ADD COLUMN IF NOT EXISTS tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(chunk_text, ''))) STORED;

-- legal_nodes.tsv exists but is unpopulated and has no trigger; keep it current.
CREATE OR REPLACE FUNCTION legal_nodes_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.tsv :=
    setweight(to_tsvector('english', coalesce(NEW.citation_label, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.heading, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.text_clean, '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS legal_nodes_tsv_trg ON legal_nodes;
CREATE TRIGGER legal_nodes_tsv_trg
  BEFORE INSERT OR UPDATE OF citation_label, heading, text_clean ON legal_nodes
  FOR EACH ROW EXECUTE FUNCTION legal_nodes_tsv_update();

UPDATE legal_nodes SET text_clean = text_clean WHERE tsv IS NULL;

-- Full-text
CREATE INDEX IF NOT EXISTS legal_nodes_tsv_gin ON legal_nodes USING gin (tsv);
CREATE INDEX IF NOT EXISTS legal_chunks_tsv_gin ON legal_chunks USING gin (tsv);

-- Vector (canonical semantic_768, cosine; same params as codebase_chunk_index HNSW)
CREATE INDEX IF NOT EXISTS legal_chunks_embedding_hnsw
  ON legal_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);

-- Joins / lookups
CREATE INDEX IF NOT EXISTS legal_nodes_document_idx ON legal_nodes (document_id);
CREATE INDEX IF NOT EXISTS legal_nodes_parent_idx ON legal_nodes (parent_node_id) WHERE parent_node_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS legal_nodes_citation_idx ON legal_nodes (citation_label) WHERE citation_label IS NOT NULL;
CREATE INDEX IF NOT EXISTS legal_nodes_citation_trgm ON legal_nodes USING gin (citation_label gin_trgm_ops) WHERE citation_label IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS legal_nodes_doc_path_uniq ON legal_nodes (document_id, node_path);
CREATE INDEX IF NOT EXISTS library_documents_jurisdiction_idx ON library_documents (jurisdiction_id, corpus_type);
CREATE INDEX IF NOT EXISTS library_documents_source_hash_idx ON library_documents (source_hash) WHERE source_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS jurisdictions_code_uniq ON jurisdictions (code);

-- Jurisdiction seed
INSERT INTO jurisdictions (code, name, level) VALUES
  ('federal', 'United States', 'federal'),
  ('ca', 'California', 'state')
ON CONFLICT (code) DO NOTHING;

COMMIT;
