-- File Understanding Labels Schema
-- Adds four columns to atlas_packets for labeling file purpose, quality, criticality, and test coverage
-- July 19, 2026

-- Purpose enum: what is this file for?
CREATE TYPE file_purpose_enum AS ENUM (
  'audit',           -- Auditing, reporting, analysis
  'config',          -- Configuration, constants, settings
  'utility',         -- Helper functions, shared logic
  'core',            -- Core business logic, critical path
  'test',            -- Test files, specs, fixtures
  'demo',            -- Examples, demos, proof-of-concept
  'deprecated',      -- No longer used, scheduled for removal
  'archived',        -- Historical, cold storage
  'infrastructure',  -- Build, deploy, CI/CD
  'other'            -- Unclassified
);

-- Thoroughness enum: how complete is this file?
CREATE TYPE thoroughness_enum AS ENUM (
  'stub',               -- 1: empty or <20 lines, bare outline only
  'outline',            -- 2: basic structure, comments indicate intent, <40% implemented
  'partial',            -- 3: feature-level implementation, 40-80% complete, may have TODOs
  'feature_complete',   -- 4: implements documented features, >80%, ready for use
  'battle_tested'       -- 5: production-hardened, >90%, has tests/docs/monitoring
);

-- Criticality enum: how important is this to the app?
CREATE TYPE app_criticality_enum AS ENUM (
  'core',           -- Core functionality, app breaks without this
  'high_risk',      -- High-value feature, breaks important workflows
  'mid_tier',       -- Useful feature, app works without it but worse
  'optional',       -- Nice-to-have feature, optional enhancement
  'experimental'    -- Research/prototype, may be removed
);

ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS file_purpose file_purpose_enum DEFAULT 'other';
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS thoroughness thoroughness_enum DEFAULT 'stub';
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS app_criticality app_criticality_enum DEFAULT 'optional';
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS test_coverage_pct integer CHECK (test_coverage_pct >= 0 AND test_coverage_pct <= 100) DEFAULT 0;
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS file_understanding_computed_at timestamp with time zone;
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS file_understanding_method text; -- 'heuristic' | 'gemma4' | 'training_data'

-- Index for filtering by labels
CREATE INDEX IF NOT EXISTS idx_atlas_packets_file_purpose ON atlas_packets(file_purpose);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_thoroughness ON atlas_packets(thoroughness);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_criticality ON atlas_packets(app_criticality);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_test_coverage ON atlas_packets(test_coverage_pct);

-- Audit table for tracking label changes over time
CREATE TABLE IF NOT EXISTS file_understanding_audit (
  audit_id SERIAL PRIMARY KEY,
  packet_key TEXT NOT NULL,
  source_ref TEXT,
  labeled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  labeling_method TEXT, -- 'heuristic' | 'gemma4' | 'human' | 'training_data'
  previous_purpose file_purpose_enum,
  new_purpose file_purpose_enum,
  previous_thoroughness thoroughness_enum,
  new_thoroughness thoroughness_enum,
  previous_criticality app_criticality_enum,
  new_criticality app_criticality_enum,
  previous_test_coverage integer,
  new_test_coverage integer,
  confidence_score real,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_file_understanding_audit_packet_key ON file_understanding_audit(packet_key);
CREATE INDEX IF NOT EXISTS idx_file_understanding_audit_method ON file_understanding_audit(labeling_method);
