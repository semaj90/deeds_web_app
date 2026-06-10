-- Migration: add agent_observations table for OpenCode / Claude-mem ingest
CREATE TABLE IF NOT EXISTS agent_observations (
  id serial PRIMARY KEY NOT NULL,
  session_type text NOT NULL,
  file_path text,
  observation_text text NOT NULL,
  char_interval_start integer,
  som_cluster_id integer,
  timestamp timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_observations_som_cluster ON agent_observations (som_cluster_id);
CREATE INDEX IF NOT EXISTS idx_agent_observations_timestamp ON agent_observations (timestamp);
