-- 9999_create_task_semantic_packets.sql
-- Manual sidecar migration: Create task_semantic_packets table
-- Safe to run idempotently (IF NOT EXISTS guarded)

CREATE TABLE IF NOT EXISTS task_semantic_packets (
  id bigserial PRIMARY KEY,
  qdrant_point_id text,
  workspace_task_id integer NOT NULL,
  feature_id integer,
  summary_model varchar(200),
  summary_hash varchar(128),
  confidence numeric(5,4) DEFAULT 0.0,
  status varchar(40) DEFAULT 'idle' NOT NULL,
  agent_pickup_ready boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted boolean DEFAULT false NOT NULL
);

-- Indexes to support common queries
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_workspace_task_id ON task_semantic_packets (workspace_task_id);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_feature_id ON task_semantic_packets (feature_id);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_status ON task_semantic_packets (status);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_agent_pickup_ready ON task_semantic_packets (agent_pickup_ready);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_created_at ON task_semantic_packets (created_at);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_updated_at ON task_semantic_packets (updated_at);

-- Optional FK: uncomment if workspace_tasks exists and you want referential integrity
-- ALTER TABLE task_semantic_packets
--   ADD CONSTRAINT fk_task_semantic_packets_workspace_tasks
--   FOREIGN KEY (workspace_task_id) REFERENCES workspace_tasks(id) ON DELETE CASCADE;
