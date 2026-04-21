-- Manual migration: create route_metadata table
-- Matches schema in sveltekit-frontend/src/lib/db/schema/route-health-tables.ts

CREATE TABLE IF NOT EXISTS route_metadata (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id          varchar(255) UNIQUE NOT NULL,
  path              varchar(255) NOT NULL,
  kind              varchar(50)  NOT NULL DEFAULT 'page',
  "group"           varchar(100),
  status            varchar(50)  DEFAULT 'healthy',
  priority          integer      DEFAULT 50,
  badges            jsonb        DEFAULT '[]',
  description       text,
  tags              jsonb        DEFAULT '[]',
  metadata          jsonb        DEFAULT '{}',
  last_accessed_at  timestamp,
  access_count      integer      DEFAULT 0,
  error_count       integer      DEFAULT 0,
  health_score      integer      DEFAULT 100,
  created_at        timestamp    NOT NULL DEFAULT now(),
  updated_at        timestamp    NOT NULL DEFAULT now(),
  archived_at       timestamp
);

CREATE INDEX IF NOT EXISTS idx_route_metadata_route_id          ON route_metadata (route_id);
CREATE INDEX IF NOT EXISTS idx_route_metadata_status            ON route_metadata (status);
CREATE INDEX IF NOT EXISTS idx_route_metadata_archived_at       ON route_metadata (archived_at);
CREATE INDEX IF NOT EXISTS idx_route_metadata_last_accessed_at  ON route_metadata (last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_route_metadata_health_score      ON route_metadata (health_score);
CREATE INDEX IF NOT EXISTS idx_route_metadata_error_count       ON route_metadata (error_count);
