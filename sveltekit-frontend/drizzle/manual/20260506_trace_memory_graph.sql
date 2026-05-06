-- Unified Memory Graph schema — Dynamic Trace Analysis layer
-- Adds runtime trace infrastructure alongside the existing static code graph.
-- All tables use IF NOT EXISTS so this is safe to re-run.
--
-- Layer contract:
--   trace_runs          = one row per npm/vitest/playwright/svelte-check run
--   trace_events        = one row per span/error/cache event within a run
--   code_relations      = static + dynamic code dependency edges (import/call/test)
--   agent_actions       = audit log of every agent tool call or proposal
--   symbol_runtime_stats = aggregated runtime stats per symbol/function
--   file_hotness_scores  = combined static+dynamic importance per file

-- ── trace_runs ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trace_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type        TEXT NOT NULL,          -- vitest | svelte-check | playwright | graphify | agent | ollama
  command         TEXT,                   -- exact command string that was run
  status          TEXT NOT NULL DEFAULT 'running',  -- running | passed | failed | error
  exit_code       INTEGER,
  duration_ms     INTEGER,
  peak_memory_mb  REAL,
  failure_count   INTEGER DEFAULT 0,
  pass_count      INTEGER DEFAULT 0,
  error_summary   TEXT,                   -- short human-readable summary of failure
  triggered_by    TEXT,                   -- user | cron | agent | webhook | vs-code-task
  metadata        JSONB DEFAULT '{}',     -- arbitrary structured data (e.g. test suite name, model used)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trace_runs_type_created
  ON trace_runs (run_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trace_runs_status
  ON trace_runs (status, created_at DESC);

-- ── trace_events ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trace_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID REFERENCES trace_runs(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,          -- span | error | cache_hit | cache_miss | tool_call | db_query | qdrant_query
  file_path       TEXT,                   -- relative path, e.g. src/lib/server/ace/context-assembler.ts
  symbol_name     TEXT,                   -- function/class/variable name
  duration_ms     INTEGER,
  memory_mb       REAL,
  error_hash      TEXT,                   -- fingerprint for dedup
  cache_key       TEXT,                   -- Redis/Qdrant cache key if relevant
  score           REAL,                   -- relevance score for qdrant/retrieval events
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trace_events_run_id
  ON trace_events (run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trace_events_file_path
  ON trace_events (file_path, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trace_events_error_hash
  ON trace_events (error_hash, created_at DESC)
  WHERE error_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trace_events_symbol
  ON trace_events (symbol_name, file_path)
  WHERE symbol_name IS NOT NULL;

-- ── code_relations ───────────────────────────────────────────────────────────
-- Static AND dynamic edges. source_kind distinguishes origin.

CREATE TABLE IF NOT EXISTS code_relations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file     TEXT NOT NULL,          -- relative path of the importing/calling file
  target_file     TEXT,                   -- relative path of imported/called file (nullable for unresolved)
  source_symbol   TEXT,                   -- exporting symbol or function
  target_symbol   TEXT,
  relation_type   TEXT NOT NULL,          -- import | re-export | call | test_covers | route_loads | api_fetches
  source_kind     TEXT NOT NULL DEFAULT 'static',  -- static | dynamic | runtime | inferred
  weight          REAL DEFAULT 1.0,       -- runtime hit count normalised 0-1, or 1 for static
  metadata        JSONB DEFAULT '{}',
  discovered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_code_relations_unique
  ON code_relations (source_file, target_file, relation_type, source_kind)
  WHERE target_file IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_code_relations_target
  ON code_relations (target_file, relation_type);

CREATE INDEX IF NOT EXISTS idx_code_relations_source
  ON code_relations (source_file, relation_type);

-- ── agent_actions ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      TEXT,                   -- agent session or VS Code task run ID
  user_id         TEXT,
  action_type     TEXT NOT NULL,          -- propose_patch | run_test | search_symbol | read_file | grep | explain | plan
  tool_name       TEXT,                   -- MCP tool name or script name
  target_file     TEXT,
  target_symbol   TEXT,
  query           TEXT,                   -- prompt or query that triggered this action
  result_summary  TEXT,                   -- short outcome summary
  result_code     INTEGER,                -- exit code or HTTP status
  accepted        BOOLEAN,               -- did the user accept/apply this action?
  duration_ms     INTEGER,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_actions_session
  ON agent_actions (session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_actions_file
  ON agent_actions (target_file, action_type, created_at DESC)
  WHERE target_file IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_actions_tool
  ON agent_actions (tool_name, created_at DESC)
  WHERE tool_name IS NOT NULL;

-- ── symbol_runtime_stats ─────────────────────────────────────────────────────
-- Materialised per-symbol performance summary, rebuilt from trace_events.

CREATE TABLE IF NOT EXISTS symbol_runtime_stats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path       TEXT NOT NULL,
  symbol_name     TEXT NOT NULL,
  period_hours    INTEGER NOT NULL DEFAULT 24,    -- rolling window this row covers
  call_count      INTEGER DEFAULT 0,
  error_count     INTEGER DEFAULT 0,
  p50_latency_ms  REAL,
  p95_latency_ms  REAL,
  max_memory_mb   REAL,
  cache_hit_rate  REAL,                   -- 0-1
  last_seen_at    TIMESTAMPTZ,
  rebuilt_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_symbol_runtime_stats_unique
  ON symbol_runtime_stats (file_path, symbol_name, period_hours);

CREATE INDEX IF NOT EXISTS idx_symbol_runtime_stats_error
  ON symbol_runtime_stats (error_count DESC, file_path);

-- ── file_hotness_scores ──────────────────────────────────────────────────────
-- Combined static+dynamic importance score per file, rebuilt by graphify.

CREATE TABLE IF NOT EXISTS file_hotness_scores (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path           TEXT NOT NULL UNIQUE,
  static_centrality   REAL DEFAULT 0,    -- import/export graph betweenness
  runtime_hotness     REAL DEFAULT 0,    -- normalised call/trace hit count
  recent_error_weight REAL DEFAULT 0,   -- recent error rate from trace_events
  test_coverage_score REAL DEFAULT 0,   -- fraction of lines covered by vitest
  user_focus_weight   REAL DEFAULT 0,   -- recent IDE opens or agent queries
  agent_history_weight REAL DEFAULT 0,  -- recent agent_actions touching this file
  composite_score     REAL GENERATED ALWAYS AS (
    static_centrality * 0.25
    + runtime_hotness * 0.25
    + recent_error_weight * 0.20
    + test_coverage_score * 0.15
    + user_focus_weight * 0.10
    + agent_history_weight * 0.05
  ) STORED,
  rebuilt_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_file_hotness_composite
  ON file_hotness_scores (composite_score DESC);
