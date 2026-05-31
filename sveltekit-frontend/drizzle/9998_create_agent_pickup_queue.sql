-- 9998_create_agent_pickup_queue.sql
-- Manual sidecar migration: durable agent_pickup_queue

CREATE TABLE IF NOT EXISTS agent_pickup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id text NOT NULL,
  packet_id text,
  status text NOT NULL DEFAULT 'queued',
  lane text NOT NULL DEFAULT 'semantic_packet',
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  error text,
  available_at timestamptz NOT NULL DEFAULT now(),
  picked_up_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_pickup_queue_status_available
  ON agent_pickup_queue(status, available_at);

CREATE INDEX IF NOT EXISTS idx_agent_pickup_queue_task_id
  ON agent_pickup_queue(task_id);
