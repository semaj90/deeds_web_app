-- Evidence CRUD + RAG Integration Migration
-- Requirements: 2.1-2.3, 3.1-3.5, 6.1-6.5, 7.1-7.5

-- Create enums
DO $$ BEGIN
  CREATE TYPE jurisdiction AS ENUM ('CA', 'NY', 'TX', 'Fed-US', 'Other');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE audit_operation AS ENUM ('CREATE', 'UPDATE', 'DELETE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE audit_resource_type AS ENUM ('Evidence', 'Tag', 'EvidenceTag', 'RAGIndex');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Citation Tags Table
CREATE TABLE IF NOT EXISTS citation_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  jurisdiction jurisdiction NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT citation_tags_name_jurisdiction_unique UNIQUE (name, jurisdiction)
);

CREATE INDEX IF NOT EXISTS citation_tags_jurisdiction_idx ON citation_tags (jurisdiction);
CREATE INDEX IF NOT EXISTS citation_tags_name_idx ON citation_tags (name);

-- Evidence Tags M2M Table
CREATE TABLE IF NOT EXISTS evidence_tags (
  evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES citation_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (evidence_id, tag_id)
);

CREATE INDEX IF NOT EXISTS evidence_tags_evidence_id_idx ON evidence_tags (evidence_id);
CREATE INDEX IF NOT EXISTS evidence_tags_tag_id_idx ON evidence_tags (tag_id);

-- RAG Index Metadata Table
CREATE TABLE IF NOT EXISTS rag_index_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL,
  evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  tags TEXT[] DEFAULT '{}' NOT NULL,
  tag_weight REAL DEFAULT 1.0 NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS rag_index_metadata_chunk_id_idx ON rag_index_metadata (chunk_id);
CREATE INDEX IF NOT EXISTS rag_index_metadata_evidence_id_idx ON rag_index_metadata (evidence_id);
CREATE INDEX IF NOT EXISTS rag_index_metadata_tags_idx ON rag_index_metadata USING GIN (tags);

-- Audit Log Table (Immutable)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  resource_type audit_resource_type NOT NULL,
  resource_id UUID NOT NULL,
  operation audit_operation NOT NULL,
  old_values JSONB,
  new_values JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_log_resource_idx ON audit_log (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS audit_log_user_id_idx ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS audit_log_timestamp_idx ON audit_log (timestamp);

-- Prevent updates/deletes on audit_log
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log entries are immutable and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_immutable_trigger ON audit_log;
CREATE TRIGGER audit_log_immutable_trigger
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();

-- Add updated_at trigger for citation_tags
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS citation_tags_updated_at ON citation_tags;
CREATE TRIGGER citation_tags_updated_at
  BEFORE UPDATE ON citation_tags
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS rag_index_metadata_updated_at ON rag_index_metadata;
CREATE TRIGGER rag_index_metadata_updated_at
  BEFORE UPDATE ON rag_index_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
