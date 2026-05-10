-- Feature Atlas schema — HyperRAG §5
-- Maps natural-language feature names → source files + entry-point exports.
-- Survives file moves better than Qdrant ANN: the table is updated by the
-- indexing pipeline, not at query time.
-- Lane L9 (feature atlas) in fetchACPKnowledgeResults() reads this table.

-- Run: psql $DATABASE_URL -f drizzle/manual/20260510_feature_atlas.sql

CREATE TABLE IF NOT EXISTS feature_implementations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key  TEXT        NOT NULL UNIQUE,  -- e.g. 'hyperedge.search', 'ace.context_pack'
  feature_name TEXT        NOT NULL,         -- human-readable label
  description  TEXT,
  lane_ids     TEXT[]      DEFAULT '{}',     -- which HyperRAG lanes this feature populates
  status       TEXT        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'deprecated', 'wip')),
  confidence   REAL        NOT NULL DEFAULT 1.0
                           CHECK (confidence BETWEEN 0 AND 1),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fi_status_idx  ON feature_implementations(status);

-- Full-text search on feature name + description
CREATE INDEX IF NOT EXISTS fi_fts_idx ON feature_implementations
  USING GIN (to_tsvector('english', feature_name || ' ' || COALESCE(description, '')));

-- ── feature_file_edges ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_file_edges (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key  TEXT    NOT NULL
                       REFERENCES feature_implementations(feature_key) ON DELETE CASCADE,
  file_path    TEXT    NOT NULL,   -- relative from sveltekit-frontend/
  entry_export TEXT,               -- exported symbol (e.g. 'buildHypergraph4D')
  role         TEXT    NOT NULL DEFAULT 'primary'
                       CHECK (role IN ('primary', 'consumer', 'test', 'type')),
  line_start   INT,
  line_end     INT,
  stable_key   TEXT    GENERATED ALWAYS AS (
    encode(sha256((feature_key || ':' || file_path || ':' || COALESCE(entry_export, ''))::bytea), 'hex')
  ) STORED,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (feature_key, file_path, entry_export)
);

CREATE INDEX IF NOT EXISTS ffe_file_idx    ON feature_file_edges(file_path);
CREATE INDEX IF NOT EXISTS ffe_feature_idx ON feature_file_edges(feature_key);
CREATE INDEX IF NOT EXISTS ffe_role_idx    ON feature_file_edges(role);

-- ── feature_dependency_edges ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_dependency_edges (
  from_feature TEXT NOT NULL,
  to_feature   TEXT NOT NULL,
  edge_type    TEXT NOT NULL DEFAULT 'depends_on'
                    CHECK (edge_type IN ('depends_on', 'conflicts_with', 'supersedes', 'enhances')),
  notes        TEXT,
  PRIMARY KEY (from_feature, to_feature, edge_type)
);

-- ── panel_activity_log ─────────────────────────────────────────────────────────
-- Tracks panel opens + file expansions. L11 lane reads last-N by userId+route.

CREATE TABLE IF NOT EXISTS panel_activity_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL,
  session_id TEXT        NOT NULL,
  route      TEXT        NOT NULL,   -- SvelteKit route path, e.g. '/cases/[id]/evidence'
  panel_key  TEXT        NOT NULL,   -- component or panel identifier
  file_path  TEXT,                   -- if a file was expanded/viewed
  tool_used  TEXT,                   -- if an MCP tool was called from UI
  dwell_ms   INT,                    -- how long the panel was visible
  ts         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pal_user_route_idx ON panel_activity_log(user_id, route, ts DESC);
CREATE INDEX IF NOT EXISTS pal_file_idx       ON panel_activity_log(file_path)
  WHERE file_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS pal_ts_idx         ON panel_activity_log(ts DESC);
