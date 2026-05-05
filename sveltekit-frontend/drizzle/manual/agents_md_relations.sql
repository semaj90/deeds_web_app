-- AGENTS.md relationship spine — ties the path-first NES-arch memory bank to
-- the directory graph, retrieval scoring, and ACE source-of-truth audit.
--
-- Three tables:
--   1. agent_context_files          one row per AGENTS.md, parsed envelope
--   2. directory_context_bindings   AGENTS.md → directory walk-up resolution
--   3. ace_context_sources          which sources fed each ACE retrieval run
--
-- Idempotent — uses CREATE TABLE IF NOT EXISTS + indexes IF NOT EXISTS.

-- ── 1. agent_context_files ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_context_files (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- agents:src/lib/server/ai/AGENTS.md  (stable across re-indexing)
  stable_key      text          NOT NULL UNIQUE,
  file_path       text          NOT NULL,
  directory_path  text          NOT NULL,
  -- sha256 of normalised content; lets us skip re-indexing unchanged files
  content_hash    text          NOT NULL,
  title           text,
  summary         text,
  -- Structured envelope (per AgentsMdEnvelopeSchema in agents-md/schema.ts)
  rules           jsonb         NOT NULL DEFAULT '[]'::jsonb,
  tools           jsonb         NOT NULL DEFAULT '[]'::jsonb,
  constraints     jsonb         NOT NULL DEFAULT '[]'::jsonb,
  semantic_tags   text[]        NOT NULL DEFAULT ARRAY[]::text[],
  qdrant_tags     text[]        NOT NULL DEFAULT ARRAY[]::text[],
  -- Bumped when the parser shape changes (forces re-index of older rows)
  schema_version  integer       NOT NULL DEFAULT 1,
  confidence      real          NOT NULL DEFAULT 0.75,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  indexed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS agent_context_files_dir_idx
  ON agent_context_files (directory_path);

CREATE INDEX IF NOT EXISTS agent_context_files_tags_gin
  ON agent_context_files USING GIN (semantic_tags);

CREATE INDEX IF NOT EXISTS agent_context_files_qdrant_tags_gin
  ON agent_context_files USING GIN (qdrant_tags);

CREATE INDEX IF NOT EXISTS agent_context_files_rules_gin
  ON agent_context_files USING GIN (rules jsonb_path_ops);

CREATE INDEX IF NOT EXISTS agent_context_files_indexed_at_idx
  ON agent_context_files (indexed_at DESC NULLS LAST);

-- ── 2. directory_context_bindings ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS directory_context_bindings (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- references agent_context_files.stable_key (no FK to allow Redis-only entries)
  agent_context_key    text         NOT NULL,
  directory_path       text         NOT NULL,
  -- exact = AGENTS.md lives in this dir; nearest-parent = walked up; inherited
  -- = depth>0 ancestor; override = explicit override against parent
  binding_type         text         NOT NULL DEFAULT 'nearest-parent',
  -- 0 = AGENTS.md is in this dir; >0 = ancestor depth
  depth                integer      NOT NULL DEFAULT 0,
  applies_to_children  boolean      NOT NULL DEFAULT true,
  -- lower = stronger; ordered for resolver tie-breaks
  priority             integer      NOT NULL DEFAULT 100,
  confidence           real         NOT NULL DEFAULT 1.0,
  metadata             jsonb        NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (agent_context_key, directory_path, binding_type)
);

CREATE INDEX IF NOT EXISTS directory_context_bindings_dir_idx
  ON directory_context_bindings (directory_path);

CREATE INDEX IF NOT EXISTS directory_context_bindings_agent_idx
  ON directory_context_bindings (agent_context_key);

-- Constraint: binding_type matches the resolver's enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'directory_context_bindings_type_check'
  ) THEN
    ALTER TABLE directory_context_bindings
      ADD CONSTRAINT directory_context_bindings_type_check
      CHECK (binding_type IN ('exact', 'nearest-parent', 'inherited', 'override'));
  END IF;
END
$$;

-- ── 3. ace_context_sources ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ace_context_sources (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  retrieval_run_id  uuid,
  -- agents_md, qdrant_chunk, wiki_note, code_llm_cache, prior_answer, graph_neighbor, fast_ast
  source_kind       text         NOT NULL,
  -- Stable identifier — agents:dir:foo, code:llm_output:path:HASH, etc.
  stable_key        text         NOT NULL,
  file_path         text,
  directory_path    text,
  score             real,
  reason            text,
  metadata          jsonb        NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ace_context_sources_run_idx
  ON ace_context_sources (retrieval_run_id);

CREATE INDEX IF NOT EXISTS ace_context_sources_kind_idx
  ON ace_context_sources (source_kind);

CREATE INDEX IF NOT EXISTS ace_context_sources_stable_key_idx
  ON ace_context_sources (stable_key);

CREATE INDEX IF NOT EXISTS ace_context_sources_created_at_idx
  ON ace_context_sources (created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ace_context_sources_kind_check'
  ) THEN
    ALTER TABLE ace_context_sources
      ADD CONSTRAINT ace_context_sources_kind_check
      CHECK (source_kind IN ('agents_md', 'qdrant_chunk', 'wiki_note', 'code_llm_cache',
                             'prior_answer', 'graph_neighbor', 'fast_ast'));
  END IF;
END
$$;

COMMENT ON TABLE agent_context_files IS
  'Parsed envelope per AGENTS.md file (NES-arch memory bank). Mirrored to Redis agents:dir:* for sub-5ms reads.';
COMMENT ON TABLE directory_context_bindings IS
  'Walk-up resolution map: which AGENTS.md governs which directory tree.';
COMMENT ON TABLE ace_context_sources IS
  'Audit trail: which retrieval sources fed each ACE run. Powers yorha.agentsMdFiles transparency.';
