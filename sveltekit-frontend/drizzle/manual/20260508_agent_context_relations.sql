-- agent_context_relations — explicit edges between AGENTS.md envelopes and
-- between AGENTS.md and the topology taxonomy.
--
-- Same shape as taxonomy_edges (one row per directed edge with an evidence
-- payload). Populated by scripts/build-agents-md-relations.mjs after the
-- envelope backfill runs.
--
-- Apply manually:
--   psql -h 127.0.0.1 -p 5434 -U legal_admin -d legal_ai_db \
--     -f drizzle/manual/20260508_agent_context_relations.sql
--
-- Idempotent. NOT auto-applied on folder open.

CREATE TABLE IF NOT EXISTS agent_context_relations (
  id            bigserial   PRIMARY KEY,
  source_key    text        NOT NULL,
  target_key    text        NOT NULL,
  relation      text        NOT NULL,
  weight        real        NOT NULL DEFAULT 1.0,
  evidence      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_key, target_key, relation)
);

CREATE INDEX IF NOT EXISTS agent_context_relations_source_idx
  ON agent_context_relations (source_key, relation);
CREATE INDEX IF NOT EXISTS agent_context_relations_target_idx
  ON agent_context_relations (target_key, relation);
CREATE INDEX IF NOT EXISTS agent_context_relations_relation_idx
  ON agent_context_relations (relation);
CREATE INDEX IF NOT EXISTS agent_context_relations_evidence_gin_idx
  ON agent_context_relations USING gin (evidence);

COMMENT ON TABLE agent_context_relations IS
  'Edges between AGENTS.md envelopes (PARENT_OF, OVERRIDES, SHARES_TAGS) and bridges to the topology taxonomy (COVERS_TOPO_CLASS, COVERS_CLUSTER) and KAG notes (MIRRORS_KAG_NOTE). Built by build-agents-md-relations.mjs.';
