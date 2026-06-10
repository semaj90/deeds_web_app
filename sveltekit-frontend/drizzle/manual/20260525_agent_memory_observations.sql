CREATE TABLE IF NOT EXISTS "agent_memory_observations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source" text NOT NULL DEFAULT 'claude-mem',
  "ide" text DEFAULT 'opencode',
  "session_id" text,
  "observation_id" text,
  "project_path" text,
  "summary" text NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb,
  "source_refs" jsonb DEFAULT '[]'::jsonb,
  "tool_calls" jsonb DEFAULT '[]'::jsonb,
  "raw_json" jsonb DEFAULT '{}'::jsonb,
  "embedding_model" text DEFAULT 'embeddinggemma:latest',
  "embedding_dim" integer DEFAULT 768,
  "qdrant_point_id" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "agent_memory_observations_session_idx" ON "agent_memory_observations" ("session_id");
CREATE INDEX IF NOT EXISTS "agent_memory_observations_observation_idx" ON "agent_memory_observations" ("observation_id");
CREATE INDEX IF NOT EXISTS "agent_memory_observations_qdrant_idx" ON "agent_memory_observations" ("qdrant_point_id");
CREATE INDEX IF NOT EXISTS "agent_memory_observations_created_idx" ON "agent_memory_observations" ("created_at" DESC);
