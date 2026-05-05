-- code_llm_index: durable persistence for the path-level LLM-output cache.
--
-- Mirrors Redis keyspace `code:llm_output:*` (cache/code-llm-index.ts):
--   redis: code:llm_output:path:<sha1>           → table row keyed by path_hash
--   redis: code:llm_output:hot   ZSET            → SUM(hit_count) DESC
--   redis: code:llm_output:recent ZSET           → last_hit_at DESC
--   redis: code:llm_output:by-cluster:<n> SET    → WHERE glyph_cluster_id = n
--
-- Why a Postgres mirror?
--   - Redis 6h TTL means cluster→paths sets vanish after a flush; SQL is durable
--   - Lets the analytics/admin UI query "top dirs by cluster + LLM hit density"
--     without touching Redis (faster batch joins + SQL aggregations)
--   - Future pgvector column can be added for cross-output semantic search
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS + indexes IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS code_llm_index (
  path_hash         varchar(16)  PRIMARY KEY,
  path              text         NOT NULL,
  is_dir            boolean      NOT NULL DEFAULT false,
  llm_output        text         NOT NULL,
  source            varchar(32)  NOT NULL DEFAULT 'ace',
  query             text,
  glyph_cluster_id  integer,
  som_bmu_row       integer,
  som_bmu_col       integer,
  hit_count         integer      NOT NULL DEFAULT 0,
  token_count       integer,
  generated_at      timestamptz  NOT NULL DEFAULT now(),
  last_hit_at       timestamptz  NOT NULL DEFAULT now(),
  refreshed_at      timestamptz  NOT NULL DEFAULT now()
);

-- Hot path indexes: cluster lookup + recent-hits + hot-paths
CREATE INDEX IF NOT EXISTS code_llm_index_cluster_idx     ON code_llm_index (glyph_cluster_id);
CREATE INDEX IF NOT EXISTS code_llm_index_last_hit_idx    ON code_llm_index (last_hit_at DESC);
CREATE INDEX IF NOT EXISTS code_llm_index_hit_count_idx   ON code_llm_index (hit_count DESC);
CREATE INDEX IF NOT EXISTS code_llm_index_source_idx      ON code_llm_index (source);
CREATE INDEX IF NOT EXISTS code_llm_index_path_trgm_idx   ON code_llm_index USING gin (path gin_trgm_ops);

-- Composite for SOM-cell aggregations (4D topology integration with manifold4 RL pipeline)
CREATE INDEX IF NOT EXISTS code_llm_index_som_idx         ON code_llm_index (som_bmu_row, som_bmu_col)
  WHERE som_bmu_row IS NOT NULL;

-- Constraint: source must match the union type in code-llm-index.ts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'code_llm_index_source_check'
  ) THEN
    ALTER TABLE code_llm_index
      ADD CONSTRAINT code_llm_index_source_check
      CHECK (source IN ('ace', 'gemma4-summary', 'kag', 'rag', 'agent', 'other'));
  END IF;
END
$$;

COMMENT ON TABLE code_llm_index IS
  'Path-level LLM output cache mirror. Source of truth is Redis (6h TTL); this table is durable backup + analytics surface for cluster+SOM aggregations.';
