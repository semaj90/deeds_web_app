-- Manual migration: create lora_training_runs table for tracking adapter checkpoints
-- Dry-run file; do NOT run without review
CREATE TABLE IF NOT EXISTS lora_training_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id text UNIQUE NOT NULL,
  model_id text NOT NULL,
  base_model text,
  dataset_uri text,
  checkpoint_uri text,
  seaweed_object_key text,
  status text NOT NULL DEFAULT 'planned',
  metrics_json jsonb DEFAULT '{}'::jsonb,
  config_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common query paths
CREATE INDEX IF NOT EXISTS lora_runs_run_id_idx ON lora_training_runs(run_id);
CREATE INDEX IF NOT EXISTS lora_runs_model_id_idx ON lora_training_runs(model_id);
CREATE INDEX IF NOT EXISTS lora_runs_checkpoint_idx ON lora_training_runs(checkpoint_uri);
CREATE INDEX IF NOT EXISTS lora_runs_created_at_idx ON lora_training_runs(created_at);

-- Column comments
COMMENT ON COLUMN lora_training_runs.model_id IS 'Logical model identifier for this run (e.g. gemma4-rotorquant:latest)';
COMMENT ON COLUMN lora_training_runs.checkpoint_uri IS 'URI to SeaweedFS or object storage for adapter weights';
COMMENT ON COLUMN lora_training_runs.seaweed_object_key IS 'SeaweedFS object key (bucket/key)';
