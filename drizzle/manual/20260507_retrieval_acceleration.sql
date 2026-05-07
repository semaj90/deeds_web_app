-- Retrieval acceleration tables
-- Created: 2026-05-07
-- Adds: retrieval_rank_cache, llm_summaries, tool_call_stats

-- ── retrieval_rank_cache ─────────────────────────────────────────────────────
-- Per-query caching of scored+ranked hits across retrieval runs.
-- Key: (query_hash, pipeline, hmm_section) — tuple uniquely identifies a
-- retrieval context. Expires via TTL in application; DB column for audit only.

CREATE TABLE IF NOT EXISTS retrieval_rank_cache (
  id              text        PRIMARY KEY,
  query_hash      text        NOT NULL,
  pipeline        text        NOT NULL,
  hmm_section     text        NOT NULL,
  hmm_confidence  double precision NOT NULL DEFAULT 0,
  ranked_hits     jsonb       NOT NULL DEFAULT '[]',
  manifold4_q     double precision[],
  som_row         integer,
  som_col         integer,
  hit_count       integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz
);

CREATE INDEX IF NOT EXISTS retrieval_rank_cache_query_pipeline_idx
  ON retrieval_rank_cache (query_hash, pipeline, hmm_section);

CREATE INDEX IF NOT EXISTS retrieval_rank_cache_expires_idx
  ON retrieval_rank_cache (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS retrieval_rank_cache_ranked_hits_gin
  ON retrieval_rank_cache USING gin (ranked_hits jsonb_path_ops);

-- ── llm_summaries ─────────────────────────────────────────────────────────────
-- Accepted LLM outputs stored as prefetch memory.  Every high-gain Gemma
-- generation that passes the acceptance gate is written here so future
-- retrieval can surface it as a prior answer (source_kind='llm_summary').
--
-- manifold4   = [som_x, som_y, semantic_z, grpo_w] — raw coords from pipeline
-- manifold4_q = unit-quaternion form [w, x, y, z]  — for fast dot-product

CREATE TABLE IF NOT EXISTS llm_summaries (
  id          text        PRIMARY KEY,
  source_kind text        NOT NULL,   -- 'gemma4' | 'turboQuant' | 'bifrost' | other
  source_id   text,                   -- chunkId / caseId / traceId that seeded this
  summary     text        NOT NULL,
  tags        text[]      NOT NULL DEFAULT '{}',
  manifold4   double precision[],
  manifold4_q double precision[],
  hmm_section text,
  gain_score  double precision NOT NULL DEFAULT 0,
  accepted    boolean     NOT NULL DEFAULT false,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS llm_summaries_hmm_section_idx
  ON llm_summaries (hmm_section)
  WHERE hmm_section IS NOT NULL;

CREATE INDEX IF NOT EXISTS llm_summaries_gain_score_idx
  ON llm_summaries (gain_score DESC)
  WHERE accepted = true;

CREATE INDEX IF NOT EXISTS llm_summaries_tags_gin
  ON llm_summaries USING gin (tags);

CREATE INDEX IF NOT EXISTS llm_summaries_metadata_gin
  ON llm_summaries USING gin (metadata jsonb_path_ops);

CREATE INDEX IF NOT EXISTS llm_summaries_source_idx
  ON llm_summaries (source_kind, source_id)
  WHERE source_id IS NOT NULL;

-- ── tool_call_stats ────────────────────────────────────────────────────────────
-- Per-tool execution history used by tool-ranker EMA updates.
-- Each row is one tool invocation: latency, gain, success, HMM context.
-- tool-ranker.ts updateToolStats() writes here asynchronously.

CREATE TABLE IF NOT EXISTS tool_call_stats (
  id          bigserial   PRIMARY KEY,
  tool_name   text        NOT NULL,
  hmm_section text        NOT NULL DEFAULT 'UNKNOWN',
  latency_ms  integer     NOT NULL DEFAULT 0,
  gain_score  double precision NOT NULL DEFAULT 0,
  succeeded   boolean     NOT NULL DEFAULT true,
  trace_id    text,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  called_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tool_call_stats_tool_name_idx
  ON tool_call_stats (tool_name, called_at DESC);

CREATE INDEX IF NOT EXISTS tool_call_stats_hmm_section_idx
  ON tool_call_stats (hmm_section, called_at DESC);

CREATE INDEX IF NOT EXISTS tool_call_stats_gain_idx
  ON tool_call_stats (gain_score DESC)
  WHERE succeeded = true;
