-- HyperRAG Feature Atlas + Panel Activity Log
-- §5 + §6 of docs/architecture/hyperrag-feature-atlas-runtime.md
-- Run once: psql $DATABASE_URL -f drizzle/migrations/20260510_feature_atlas.sql

-- ── feature_implementations ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_implementations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key  TEXT NOT NULL UNIQUE,  -- e.g. 'hyperedge.search', 'ace.context_pack'
  feature_name TEXT NOT NULL,         -- human readable display name
  description  TEXT,
  lane_ids     TEXT[] DEFAULT '{}',   -- which HyperRAG lanes this feature populates
  status       TEXT NOT NULL DEFAULT 'active',  -- active | deprecated | wip
  confidence   REAL NOT NULL DEFAULT 1.0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feat_impl_status_idx ON feature_implementations(status);
CREATE INDEX IF NOT EXISTS feat_impl_lane_ids_idx ON feature_implementations USING GIN(lane_ids);

-- ── feature_file_edges ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_file_edges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key  TEXT NOT NULL REFERENCES feature_implementations(feature_key) ON DELETE CASCADE,
  file_path    TEXT NOT NULL,       -- relative from sveltekit-frontend/
  entry_export TEXT,                -- exported symbol name (e.g. 'buildHypergraph4D')
  role         TEXT NOT NULL,       -- 'primary' | 'consumer' | 'test' | 'type'
  line_start   INT,
  line_end     INT,
  stable_key   TEXT GENERATED ALWAYS AS (
    encode(sha256((feature_key || ':' || file_path || ':' || COALESCE(entry_export,''))::bytea), 'hex')
  ) STORED,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(feature_key, file_path, entry_export)
);

CREATE INDEX IF NOT EXISTS feat_file_path_idx   ON feature_file_edges(file_path);
CREATE INDEX IF NOT EXISTS feat_key_idx         ON feature_file_edges(feature_key);
CREATE INDEX IF NOT EXISTS feat_role_idx        ON feature_file_edges(role);

-- ── panel_activity_log ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS panel_activity_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  session_id TEXT NOT NULL,
  route      TEXT NOT NULL,       -- SvelteKit route path, e.g. '/cases/[id]/evidence'
  panel_key  TEXT NOT NULL,       -- component or panel identifier
  file_path  TEXT,                -- if file was expanded / viewed
  tool_used  TEXT,                -- if MCP tool was called from UI
  dwell_ms   INT,                 -- how long panel was visible
  ts         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pal_user_route_idx ON panel_activity_log(user_id, route, ts DESC);
CREATE INDEX IF NOT EXISTS pal_file_idx       ON panel_activity_log(file_path) WHERE file_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS pal_ts_idx         ON panel_activity_log(ts DESC);
