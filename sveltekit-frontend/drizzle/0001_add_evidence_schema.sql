-- !! ALREADY APPLIED — DO NOT RE-RUN !!
-- Contains DROP TABLE evidence CASCADE.
-- Re-running will destroy evidence data.

-- Phase 14: Evidence Board Schema
-- Created: 2025-12-06
-- Purpose: Add evidence tables for YoRHa Detective UI

-- Create enums
DO $$ BEGIN
  CREATE TYPE evidence_type AS ENUM ('video', 'document', 'photo', 'note', 'audio', 'forensic');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE relationship_strength AS ENUM ('strong', 'medium', 'weak');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE node_type AS ENUM ('person', 'evidence', 'location', 'case');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE timeline_event_type AS ENUM ('evidence', 'person', 'location', 'action');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Evidence table: Clean slate for MVP (Drop legacy incomplete table)
DROP TABLE IF EXISTS evidence CASCADE;

CREATE TABLE IF NOT EXISTS evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL,
  evidence_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  type evidence_type NOT NULL,
  summary TEXT NOT NULL,
  description TEXT,

  -- Board position
  pos_x INTEGER,
  pos_y INTEGER,

  -- Metadata
  collected_at TIMESTAMP,
  collected_by TEXT,
  verified_at TIMESTAMP,
  verified BOOLEAN DEFAULT false,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_case_id ON evidence(case_id);
CREATE INDEX IF NOT EXISTS idx_evidence_number ON evidence(evidence_number);

-- Evidence relationships (connections)
CREATE TABLE IF NOT EXISTS evidence_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  to_evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  label TEXT,
  strength relationship_strength DEFAULT 'medium',
  notes TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_evidence_rel_from ON evidence_relationships(from_evidence_id);
CREATE INDEX IF NOT EXISTS idx_evidence_rel_to ON evidence_relationships(to_evidence_id);

-- Timeline events
CREATE TABLE IF NOT EXISTS timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type timeline_event_type NOT NULL,

  -- JSON arrays of related IDs
  evidence_ids JSONB DEFAULT '[]'::jsonb,
  person_ids JSONB DEFAULT '[]'::jsonb,
  location_ids JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_timeline_case_id ON timeline_events(case_id);
CREATE INDEX IF NOT EXISTS idx_timeline_timestamp ON timeline_events(timestamp);

-- Graph nodes
CREATE TABLE IF NOT EXISTS graph_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL,
  node_id TEXT NOT NULL,
  label TEXT NOT NULL,
  type node_type NOT NULL,

  -- Position on graph
  pos_x INTEGER NOT NULL,
  pos_y INTEGER NOT NULL,

  -- Reference to actual entity
  entity_id UUID,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_nodes_case_id ON graph_nodes(case_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_node_id ON graph_nodes(node_id);

-- Graph edges
CREATE TABLE IF NOT EXISTS graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL,
  from_node_id UUID NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  to_node_id UUID NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  label TEXT,
  strength relationship_strength DEFAULT 'medium',

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_edges_case_id ON graph_edges(case_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_from ON graph_edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_to ON graph_edges(to_node_id);

-- Comments for documentation
COMMENT ON TABLE evidence IS 'Evidence items for cases (videos, documents, photos, etc.)';
COMMENT ON TABLE evidence_relationships IS 'Connections between evidence items shown on the board';
COMMENT ON TABLE timeline_events IS 'Chronological events in case investigation';
COMMENT ON TABLE graph_nodes IS 'Nodes for relationship graph visualization';
COMMENT ON TABLE graph_edges IS 'Edges connecting nodes in relationship graph';
