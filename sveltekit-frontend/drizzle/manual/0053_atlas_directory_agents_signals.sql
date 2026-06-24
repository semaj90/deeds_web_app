-- Atlas Directory Agents Signals — Parent Atlas Table of Contents
-- Guidance signals from llms.md / AGENTS.md for canonical file registry classification
-- Created: 2026-06-23, Session 75
-- Status: Guidance signals (NOT truth) for file classification hints

CREATE TABLE IF NOT EXISTS atlas_directory_agents_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  directory_path text NOT NULL UNIQUE,

  -- Snapshot metadata from llms.md
  file_count int DEFAULT 0,
  handler_count int DEFAULT 0,

  -- Audit gate signals (G17, G18, etc.)
  hardcoded_localhost_count int DEFAULT 0,  -- G17: hardcoded localhost failures
  paired_test_count int DEFAULT 0,
  som_cluster int,  -- GPU audit SOM assignment (nullable)

  -- MCP tool surface (which tools are available in this directory)
  available_tools text[] DEFAULT '{}',

  -- Audit gates JSONB: { "G17": "FAIL", "G18": "PASS", ... }
  audit_gates jsonb DEFAULT '{}',

  -- TODOs JSONB: [{ "priority": "HIGH", "label": "G17", "description": "..." }]
  todos jsonb DEFAULT '[]',

  -- Export/class/function/interface counts (authoritative code signal)
  export_count int DEFAULT 0,
  class_count int DEFAULT 0,
  function_count int DEFAULT 0,
  interface_count int DEFAULT 0,

  -- Timestamps
  ingested_at timestamp with time zone DEFAULT now(),
  last_updated timestamp with time zone DEFAULT now(),

  CONSTRAINT valid_directory CHECK (directory_path ~ '^[a-zA-Z0-9/_.-]+$')
);

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_atlas_directory_signals_path
  ON atlas_directory_agents_signals(directory_path);
CREATE INDEX IF NOT EXISTS idx_atlas_directory_signals_updated
  ON atlas_directory_agents_signals(last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_atlas_directory_signals_export
  ON atlas_directory_agents_signals(export_count DESC);
CREATE INDEX IF NOT EXISTS idx_atlas_directory_signals_som
  ON atlas_directory_agents_signals(som_cluster) WHERE som_cluster IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_atlas_directory_signals_g17
  ON atlas_directory_agents_signals(hardcoded_localhost_count DESC) WHERE hardcoded_localhost_count > 0;

-- Comments for clarity
COMMENT ON TABLE atlas_directory_agents_signals IS
  'Parent Atlas table of contents: directory-level guidance signals from llms.md/AGENTS.md, used as hints (NOT truth) for canonical file registry classification, audit gates, and production-readiness recommendations.';

COMMENT ON COLUMN atlas_directory_agents_signals.audit_gates IS
  'Example: {"G17": "FAIL", "G17_detail": "49/319 files have hardcoded localhost"}';

COMMENT ON COLUMN atlas_directory_agents_signals.todos IS
  'Example: [{"priority": "HIGH", "label": "G17", "description": "Fix hardcoded localhost URLs"}]';

COMMENT ON COLUMN atlas_directory_agents_signals.hardcoded_localhost_count IS
  'G17 audit gate: count of files with hardcoded localhost/127.0.0.1 (should use env.server.ts getters instead)';
