-- PROPOSED MIGRATION — Task Semantic Packet layer
--
-- Purpose: turn a Kanban task into an agent-ready semantic work packet.
-- Postgres = relational truth + Kanban state ledger
-- Qdrant   = semantic lookup + cluster metadata (mirrored via qdrant_point_id)
-- Redis    = hot queue (agent_pickup_queue.status drives this)
-- Langfuse = trace history (joined via task_id / feature_id / cluster_id)
-- Neo4j    = TASK -> FEATURE -> FILE -> CLUSTER graph edges
-- SeaweedFS = large artifacts (raw outputs, snapshots; referenced via artifact_url)

BEGIN;

-- 1. Feature registry (stable feature IDs that survive directory reorgs)
CREATE TABLE IF NOT EXISTS feature_registry (
  id              text PRIMARY KEY,                  -- e.g., "evidence-pipeline", "ai-retrieval"
  display_name    varchar(200) NOT NULL,
  description     text,
  pillar          varchar(100),                      -- e.g., "ai-retrieval", "evidence", "cases-legal"
  semantic_path   text[] DEFAULT '{}',               -- e.g., ['evidence', 'ocr', 'embedding']
  parent_feature  text REFERENCES feature_registry(id) ON DELETE SET NULL,
  status          varchar(40) DEFAULT 'active',      -- active | deprecated | experimental
  confidence      real DEFAULT 0.5,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feature_registry_pillar ON feature_registry(pillar);
CREATE INDEX IF NOT EXISTS idx_feature_registry_semantic_path ON feature_registry USING GIN (semantic_path);

-- 2. Workspace tasks (Kanban cards)
CREATE TABLE IF NOT EXISTS workspace_tasks (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id      text NOT NULL,                   -- e.g., "deeds-web-app"
  title             text NOT NULL,
  description       text,
  status            varchar(40) DEFAULT 'todo' NOT NULL,  -- todo | doing | blocked | done
  priority          varchar(20) DEFAULT 'medium',         -- low | medium | high | critical
  risk              varchar(20) DEFAULT 'low',
  feature_id        text REFERENCES feature_registry(id) ON DELETE SET NULL,
  created_by        integer REFERENCES users(id) ON DELETE SET NULL,
  assigned_to       integer REFERENCES users(id) ON DELETE SET NULL,
  source            varchar(80),                     -- "opencode" | "operator" | "audit" | "gemma4"
  source_ref        text,                            -- e.g., recommendation_id, file:line
  created_at        timestamp with time zone DEFAULT now() NOT NULL,
  updated_at        timestamp with time zone DEFAULT now() NOT NULL,
  completed_at      timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_workspace_tasks_status ON workspace_tasks(status);
CREATE INDEX IF NOT EXISTS idx_workspace_tasks_workspace ON workspace_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_tasks_feature ON workspace_tasks(feature_id);

-- 3. Task semantic packets (the Postgres mirror of Qdrant points)
CREATE TABLE IF NOT EXISTS task_semantic_packets (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_task_id   uuid NOT NULL REFERENCES workspace_tasks(id) ON DELETE CASCADE,
  qdrant_point_id     text NOT NULL UNIQUE,          -- the deterministic chunk ID in Qdrant
  qdrant_collection   varchar(80) NOT NULL,          -- e.g., "task_semantic_packets" or "codebase_chunks_768"
  point_kind          varchar(40) NOT NULL,          -- "task_summary" | "code_chunk" | "feature_summary" | "centroid"
  summary_llm         text,                          -- Gemma4 summary
  summary_model       varchar(80),                   -- "gemma4-rotorquant:latest"
  summary_hash        char(64),                      -- SHA-256 of summary text
  confidence          real DEFAULT 0.0,
  embedding_dims      integer DEFAULT 768,
  cluster_id          text,                          -- joined with task_cluster_links
  centroid_id         text,
  parent_centroid_id  text,
  observed_at         timestamp with time zone DEFAULT now() NOT NULL,
  updated_at          timestamp with time zone DEFAULT now() NOT NULL,
  valid_from          timestamp with time zone DEFAULT now() NOT NULL,
  valid_to            timestamp with time zone,
  deleted             boolean DEFAULT false NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tsp_task ON task_semantic_packets(workspace_task_id);
CREATE INDEX IF NOT EXISTS idx_tsp_cluster ON task_semantic_packets(cluster_id);
CREATE INDEX IF NOT EXISTS idx_tsp_centroid ON task_semantic_packets(centroid_id);
CREATE INDEX IF NOT EXISTS idx_tsp_kind ON task_semantic_packets(point_kind);
CREATE INDEX IF NOT EXISTS idx_tsp_active ON task_semantic_packets(deleted, valid_to) WHERE deleted = false;

-- 4. Task file links (which files an agent should touch for this task)
CREATE TABLE IF NOT EXISTS task_file_links (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_task_id   uuid NOT NULL REFERENCES workspace_tasks(id) ON DELETE CASCADE,
  file_path           text NOT NULL,
  source_ref          text,                          -- e.g., "file.ts:123:funcName"
  link_type           varchar(40) DEFAULT 'related', -- related | primary | reference | output
  relevance_score     real DEFAULT 0.0,
  attached_by         varchar(80) DEFAULT 'qdrant',  -- "qdrant" | "operator" | "gemma4" | "graph"
  attached_at         timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tfl_task ON task_file_links(workspace_task_id);
CREATE INDEX IF NOT EXISTS idx_tfl_file ON task_file_links(file_path);
CREATE INDEX IF NOT EXISTS idx_tfl_type ON task_file_links(link_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tfl_unique ON task_file_links(workspace_task_id, file_path, link_type);

-- 5. Task cluster links (which Qdrant cluster the task lives in)
CREATE TABLE IF NOT EXISTS task_cluster_links (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_task_id   uuid NOT NULL REFERENCES workspace_tasks(id) ON DELETE CASCADE,
  cluster_id          text NOT NULL,
  centroid_id         text,
  distance            real,                          -- distance to centroid
  source              varchar(40) DEFAULT 'qdrant',  -- "qdrant" | "neo4j" | "graphify"
  attached_at         timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tcl_task ON task_cluster_links(workspace_task_id);
CREATE INDEX IF NOT EXISTS idx_tcl_cluster ON task_cluster_links(cluster_id);

-- 6. Agent pickup queue (Redis is the runtime queue; this is the durable mirror)
CREATE TABLE IF NOT EXISTS agent_pickup_queue (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_task_id   uuid NOT NULL REFERENCES workspace_tasks(id) ON DELETE CASCADE,
  agent_name          varchar(80),                   -- "opencode" | "gemma4-agent" | "langgraph"
  status              varchar(40) DEFAULT 'ready' NOT NULL, -- ready | running | done | failed | skipped
  priority_score      real DEFAULT 0.0,
  picked_up_at        timestamp with time zone,
  finished_at         timestamp with time zone,
  error_message       text,
  attempt_count       integer DEFAULT 0,
  last_attempt_at     timestamp with time zone,
  langfuse_trace_id   text,                          -- joins with Langfuse traces
  created_at          timestamp with time zone DEFAULT now() NOT NULL,
  updated_at          timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_apq_status ON agent_pickup_queue(status, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_apq_task ON agent_pickup_queue(workspace_task_id);
CREATE INDEX IF NOT EXISTS idx_apq_trace ON agent_pickup_queue(langfuse_trace_id);

-- 7. Agent run events (every agent action gets a row — Langfuse-joinable)
CREATE TABLE IF NOT EXISTS agent_run_events (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_task_id   uuid REFERENCES workspace_tasks(id) ON DELETE CASCADE,
  pickup_id           uuid REFERENCES agent_pickup_queue(id) ON DELETE SET NULL,
  agent_name          varchar(80),
  event_type          varchar(80) NOT NULL,          -- "task_received" | "summary_generated" | "files_attached" | "patch_proposed" | "validation_run" | "completed" | "failed"
  payload             jsonb,
  langfuse_trace_id   text,
  observed_at         timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_are_task ON agent_run_events(workspace_task_id);
CREATE INDEX IF NOT EXISTS idx_are_pickup ON agent_run_events(pickup_id);
CREATE INDEX IF NOT EXISTS idx_are_event_type ON agent_run_events(event_type);
CREATE INDEX IF NOT EXISTS idx_are_trace ON agent_run_events(langfuse_trace_id);
CREATE INDEX IF NOT EXISTS idx_are_observed ON agent_run_events(observed_at DESC);

COMMIT;

-- POST-MIGRATION: run scripts/qdrant/create-payload-indexes-task-semantic-packets.mjs
-- to create matching Qdrant payload indexes.