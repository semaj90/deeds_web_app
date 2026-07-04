-- Agentic Error-Fixing Schema
-- Apply via: docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < scripts/atlas/create-agentic-error-tables.sql

-- 1. Error signal ingestion (from logs/analytics)
CREATE TABLE IF NOT EXISTS error_signal_stream (
  id SERIAL PRIMARY KEY,
  packet_key TEXT NOT NULL,
  task_id TEXT NOT NULL,
  error_class TEXT NOT NULL,
  model_name TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}',
  ingested_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_signal_packet_task_class
  ON error_signal_stream (packet_key, task_id, error_class);

CREATE INDEX IF NOT EXISTS idx_error_signal_ingested_at
  ON error_signal_stream (ingested_at DESC);

-- 2. MapReduce grouping output (reduced cluster state)
CREATE TABLE IF NOT EXISTS error_cluster_groups (
  id SERIAL PRIMARY KEY,
  error_class TEXT NOT NULL,
  model_name TEXT NOT NULL,
  task_id TEXT NOT NULL,
  packet_keys TEXT[] NOT NULL DEFAULT '{}',
  failure_count INT NOT NULL DEFAULT 0,
  last_seen TIMESTAMP NOT NULL DEFAULT NOW(),
  recovery_packet_key TEXT,
  recovery_confidence REAL,
  UNIQUE (error_class, model_name, task_id)
);

CREATE INDEX IF NOT EXISTS idx_error_cluster_class_model_seen
  ON error_cluster_groups (error_class, model_name, last_seen DESC);

-- 3. Binary DAG-hit landing zone (temporary, TTL-based)
CREATE TABLE IF NOT EXISTS dag_hit_envelope_cache (
  packet_key TEXT PRIMARY KEY,
  binary_payload BYTEA NOT NULL,
  packet_shape_hash TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('dag_hit', 'cache_swap', 'repair'))
);

CREATE INDEX IF NOT EXISTS idx_dag_hit_expires_at
  ON dag_hit_envelope_cache (expires_at);

-- 4. (Optional) If memory_registry table exists, add backlink to dag-hit blob:
-- ALTER TABLE memory_registry ADD COLUMN IF NOT EXISTS
--   dag_hit_blob_key TEXT REFERENCES dag_hit_envelope_cache(packet_key) ON DELETE SET NULL;
