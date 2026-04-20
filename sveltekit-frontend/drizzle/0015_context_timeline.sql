-- Migration: 0015_context_timeline
-- Durable write-path for the RL self-modification feedback loop.
-- Every user interaction that influences rlpolicy:pipeline_weights or triggers
-- a hypergraph rebuild is recorded here, closing the loop:
--
--   user signal → adaptFromAnalytics
--     → Redis rlpolicy:pipeline_weights update + context_timeline row
--     → hg:adapt:pending counter → threshold (8) → buildHypergraph4D()
--     → X_prime centroids recomputed → selectAdaptiveMemory returns updated anchors
--     → LLM system prompt shaped by accumulated user feedback
--
-- event_type:
--   research    — web crawler / deep-research query completed
--   feedback    — explicit user thumbs/dwell signal (populates signal column)
--   citation    — user saved a citation from a research summary
--   graph_edge  — Neo4j edge promoted/created by a signal (e.g. SIMILAR_RESEARCH)
--   rl_adapt    — periodic RL policy flush / weight snapshot
--   tool_call   — FastMCP tool invocation that affected the knowledge graph
--   summary     — new research_summary row created and embedded
--
-- signal (feedback events only):
--   thumbs_up | thumbs_down | dwell_long | dwell_short | citation_saved
--
-- Rows are append-only — no UPDATE path. The table is the audit trail for the
-- self-modification loop and the seed dataset for QLoRA distillation pipelines.

CREATE TABLE IF NOT EXISTS context_timeline (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               INTEGER      REFERENCES users(id)                ON DELETE SET NULL,
  session_id            TEXT         NOT NULL DEFAULT '',
  event_type            TEXT         NOT NULL,
  pipeline              TEXT         NOT NULL DEFAULT 'ace',
  summary_id            UUID,
  hyperedge_hash        VARCHAR(8),
  signal                TEXT,
  grpo_reward           REAL,
  pipeline_weight_after REAL,
  triggered_rebuild     BOOLEAN      NOT NULL DEFAULT false,
  payload               JSONB        NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Per-user chronological timeline (pagination, user dashboard)
CREATE INDEX IF NOT EXISTS ctx_user_created    ON context_timeline (user_id,       created_at DESC);
-- Session-scoped replay (anonymous users, context window reconstruction)
CREATE INDEX IF NOT EXISTS ctx_session_created ON context_timeline (session_id,    created_at DESC);
-- Analytics by event class (training data slicing, pipeline audits)
CREATE INDEX IF NOT EXISTS ctx_event_type      ON context_timeline (event_type,    created_at DESC);
-- Reward signal aggregation (pipeline health, QLoRA distillation weight)
CREATE INDEX IF NOT EXISTS ctx_pipeline_reward ON context_timeline (pipeline,      grpo_reward);
-- Hyperedge join (LoRA adapter selection, memory checkpoint lookup)
CREATE INDEX IF NOT EXISTS ctx_hyperedge       ON context_timeline (hyperedge_hash);