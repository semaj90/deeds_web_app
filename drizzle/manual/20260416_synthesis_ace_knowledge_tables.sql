-- ACE Context Cache + Knowledge Artifacts + Synthesis Runs
-- Purpose:
--   - ace_context_cache    : caches assembled ACE context per query hash (avoids repeat Qdrant/Neo4j calls)
--   - knowledge_artifacts  : unified artifact store for codebase/evidence/case/doc summaries + SOM cluster tags
--   - synthesis_runs       : persists every synthesis response for QLoRA training pair export
-- Additive and idempotent — safe to re-run

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── ACE Context Cache ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ace_context_cache (
  id              UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  query_hash      TEXT         NOT NULL,
  user_id         UUID,
  policy_tier     VARCHAR(30)  NOT NULL,
  context_json    JSONB        NOT NULL,
  chunk_count     INTEGER      NOT NULL DEFAULT 0,
  total_tokens    INTEGER      NOT NULL DEFAULT 0,
  cache_source    VARCHAR(20)  NOT NULL DEFAULT 'miss',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ace_context_cache_query_hash_idx ON ace_context_cache (query_hash);
CREATE INDEX IF NOT EXISTS ace_context_cache_user_idx       ON ace_context_cache (user_id);

-- ── Knowledge Artifacts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_artifacts (
  id              UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type     VARCHAR(30)  NOT NULL,   -- codebase|evidence|case|doc
  source_id       TEXT         NOT NULL,
  summary         TEXT,
  tags            JSONB        NOT NULL DEFAULT '[]',
  metadata        JSONB        NOT NULL DEFAULT '{}',
  embed_text      TEXT,
  som_cluster     INTEGER,
  schema_version  INTEGER      NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_artifacts_source_idx  ON knowledge_artifacts (source_type, source_id);
CREATE INDEX IF NOT EXISTS knowledge_artifacts_cluster_idx ON knowledge_artifacts (som_cluster);

-- ── Synthesis Runs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS synthesis_runs (
  id                UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID,
  query             TEXT         NOT NULL,
  answer            TEXT         NOT NULL,
  model             VARCHAR(100) NOT NULL,
  cache_hit         VARCHAR(10),
  latency_ms        INTEGER,
  confidence        REAL,
  grpo_reward_score REAL,
  policy_tier       VARCHAR(30),
  citations         JSONB        NOT NULL DEFAULT '[]',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS synthesis_runs_user_idx    ON synthesis_runs (user_id);
CREATE INDEX IF NOT EXISTS synthesis_runs_created_idx ON synthesis_runs (created_at);
