-- Retrieval spine tables: chunk rank cache, accepted LLM summaries, tool-call stats
-- Migration: 2026-05-07

-- ── 1. Compact chunk ranking cache ──────────────────────────────────────────────
-- Stores the scored results of a ranked retrieval pass so the same query hash
-- can skip full reranking on repeat calls (TTL enforced by application, not DB).

CREATE TABLE IF NOT EXISTS retrieval_rank_cache (
  query_hash   text        NOT NULL,
  chunk_id     text        NOT NULL,
  score        double precision NOT NULL,
  score_parts  jsonb,
  hmm_section  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (query_hash, chunk_id)
);

CREATE INDEX IF NOT EXISTS retrieval_rank_cache_score_idx
  ON retrieval_rank_cache (query_hash, score DESC);

-- ── 2. Accepted LLM summaries — memory layer ────────────────────────────────────
-- Stores accepted high-gain Gemma outputs as a searchable memory layer.
-- Tags + manifold4_q enable hybrid semantic+topological retrieval.

CREATE TABLE IF NOT EXISTS llm_summaries (
  id            text        PRIMARY KEY,
  source_kind   text        NOT NULL,  -- 'chunk', 'evidence', 'query', 'tool_result'
  source_id     text,                  -- FK hint (not enforced — sources vary)
  summary       text        NOT NULL,
  tags          text[]      NOT NULL DEFAULT '{}',
  manifold4     double precision[],    -- raw [som_x, som_y, semantic_z, grpo_w]
  manifold4_q   double precision[],    -- normalised unit quaternion [w, x, y, z]
  hmm_section   text,
  gain_score    double precision,
  accepted      boolean     NOT NULL DEFAULT false,
  metadata      jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS llm_summaries_tags_gin
  ON llm_summaries USING gin (tags);

CREATE INDEX IF NOT EXISTS llm_summaries_metadata_gin
  ON llm_summaries USING gin (metadata jsonb_path_ops);

CREATE INDEX IF NOT EXISTS llm_summaries_hmm_gain_idx
  ON llm_summaries (hmm_section, gain_score DESC);

CREATE INDEX IF NOT EXISTS llm_summaries_accepted_idx
  ON llm_summaries (accepted, hmm_section, gain_score DESC)
  WHERE accepted = true;

-- ── 3. Tool-call performance memory ─────────────────────────────────────────────
-- Tracks per-(tool, hmm_section) success rates and latencies.
-- tool-ranker.ts loads these at startup and applies EMA merge into in-memory registry.

CREATE TABLE IF NOT EXISTS tool_call_stats (
  tool_name      text        NOT NULL,
  hmm_section    text        NOT NULL,
  success_count  integer     NOT NULL DEFAULT 0,
  failure_count  integer     NOT NULL DEFAULT 0,
  avg_latency_ms double precision,
  avg_gain_score double precision,
  last_used_at   timestamptz,
  PRIMARY KEY (tool_name, hmm_section)
);

CREATE INDEX IF NOT EXISTS tool_call_stats_section_gain_idx
  ON tool_call_stats (hmm_section, avg_gain_score DESC);
