-- Manual migration: code_relations table
-- Stores semantic edges extracted by relationship-extractor.ts
-- 7 edge types: EXPORTS_SYMBOL, READS/WRITES_REDIS_KEY, QUERIES_TABLE,
--               QUERIES_QDRANT_COLLECTION, QUERIES_NEO4J_LABEL, HAS_AGENTS_SCOPE
-- Apply: psql $DATABASE_URL -f drizzle/manual/20260506_code_relations.sql

CREATE TABLE IF NOT EXISTS code_relations (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_file   TEXT    NOT NULL,
  target_key    TEXT    NOT NULL,
  relation_type TEXT    NOT NULL,
  confidence    REAL    NOT NULL DEFAULT 0.8,
  evidence      JSONB   DEFAULT '{}'::jsonb,
  run_id        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint for upsert (ON CONFLICT DO UPDATE)
CREATE UNIQUE INDEX IF NOT EXISTS code_relations_upsert_idx
  ON code_relations (source_file, target_key, relation_type);

-- Index for fast lookups by source file (used in ACE retrieval spine)
CREATE INDEX IF NOT EXISTS code_relations_source_file_idx
  ON code_relations (source_file);

-- Index for reverse lookups: "who queries this table / collection / symbol?"
CREATE INDEX IF NOT EXISTS code_relations_target_key_idx
  ON code_relations (target_key, relation_type);

-- GIN index on evidence JSONB for matchKind / snippet queries
CREATE INDEX IF NOT EXISTS code_relations_evidence_gin_idx
  ON code_relations USING GIN (evidence);
