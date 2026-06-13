-- @file drizzle/manual/0099_git_mutation_provenance.sql
-- @description Create git_mutation_provenance table for tracking mutations with full git diff context
-- @date 2026-06-13
-- @step Step 4 - Git Diff Provenance Storage

CREATE TABLE IF NOT EXISTS git_mutation_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Git context
  diff_hash varchar(64) NOT NULL UNIQUE, -- SHA-256 of the diff
  before_commit varchar(40) NOT NULL, -- Git commit SHA before mutation
  after_commit varchar(40) NOT NULL, -- Git commit SHA after mutation
  branch_name varchar(255) DEFAULT 'main',
  created_at timestamp with time zone DEFAULT now(),

  -- Affected artifacts
  packet_keys text[] NOT NULL DEFAULT ARRAY[]::text[], -- array of affected packet_key values
  feature_ids text[] NOT NULL DEFAULT ARRAY[]::text[], -- array of affected feature_id values
  source_refs text[] NOT NULL DEFAULT ARRAY[]::text[], -- array of affected source_ref (file paths)
  community_ids text[] NOT NULL DEFAULT ARRAY[]::text[], -- array of affected community_id values

  -- Mutation details
  changed_files text[] NOT NULL DEFAULT ARRAY[]::text[], -- files modified by this mutation
  added_lines int DEFAULT 0, -- lines added
  removed_lines int DEFAULT 0, -- lines removed
  diff_size_bytes int DEFAULT 0, -- size of diff in bytes

  -- Smoke test results
  smoke_results jsonb, -- { passed: boolean, tests_run: int, tests_failed: int, duration_ms: int }
  ace_kag_dag_hit boolean DEFAULT false, -- whether mutation touched critical ACE/KAG/DAG paths
  lineage_violations int DEFAULT 0, -- count of lineage chain violations detected
  placeholder_violations int DEFAULT 0, -- count of placeholder violations detected

  -- Recovery information
  rollback_hash varchar(64), -- git commit hash to rollback to if needed
  rollback_approved boolean DEFAULT false, -- whether rollback has been approved
  rollback_reason varchar(500), -- reason for rollback if needed

  -- Metadata
  mutation_source varchar(100), -- 'parent-atlas-mutation-gate', 'opencode', 'manual', etc.
  description varchar(1000), -- human-readable description of the mutation
  applied_by varchar(255), -- user or process that applied the mutation

  CONSTRAINT valid_diff_hash CHECK (length(diff_hash) = 64),
  CONSTRAINT valid_before_commit CHECK (length(before_commit) >= 7),
  CONSTRAINT valid_after_commit CHECK (length(after_commit) >= 7),
  CONSTRAINT valid_rollback_hash CHECK (rollback_hash IS NULL OR length(rollback_hash) >= 7)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_git_mutation_diff_hash ON git_mutation_provenance(diff_hash);
CREATE INDEX IF NOT EXISTS idx_git_mutation_before_commit ON git_mutation_provenance(before_commit);
CREATE INDEX IF NOT EXISTS idx_git_mutation_after_commit ON git_mutation_provenance(after_commit);
CREATE INDEX IF NOT EXISTS idx_git_mutation_created_at ON git_mutation_provenance(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_git_mutation_packet_keys ON git_mutation_provenance USING GIN(packet_keys);
CREATE INDEX IF NOT EXISTS idx_git_mutation_feature_ids ON git_mutation_provenance USING GIN(feature_ids);
CREATE INDEX IF NOT EXISTS idx_git_mutation_source_refs ON git_mutation_provenance USING GIN(source_refs);

-- Table comment
COMMENT ON TABLE git_mutation_provenance IS 'Stores complete git diff provenance for every mutation, enabling rollback, audit trail, and impact analysis';
COMMENT ON COLUMN git_mutation_provenance.diff_hash IS 'SHA-256 hash of the mutation diff for idempotent re-detection';
COMMENT ON COLUMN git_mutation_provenance.before_commit IS 'Git commit SHA immediately before the mutation';
COMMENT ON COLUMN git_mutation_provenance.after_commit IS 'Git commit SHA immediately after the mutation';
COMMENT ON COLUMN git_mutation_provenance.packet_keys IS 'All atlas_packets.packet_key values affected by this mutation';
COMMENT ON COLUMN git_mutation_provenance.feature_ids IS 'All atlas_packets.feature_id values affected by this mutation';
COMMENT ON COLUMN git_mutation_provenance.source_refs IS 'All atlas_packets.source_ref (file paths) affected by this mutation';
COMMENT ON COLUMN git_mutation_provenance.community_ids IS 'All atlas_packets.community_id values affected by this mutation';
COMMENT ON COLUMN git_mutation_provenance.smoke_results IS 'Results from smoke test suite: {passed: bool, tests_run: int, tests_failed: int, duration_ms: int}';
COMMENT ON COLUMN git_mutation_provenance.ace_kag_dag_hit IS 'TRUE if mutation touched any ACE/KAG/DAG critical infrastructure (context assembly, knowledge graph, task DAGs)';
COMMENT ON COLUMN git_mutation_provenance.rollback_hash IS 'Git commit SHA of the previous known-good state (for manual rollback)';
COMMENT ON COLUMN git_mutation_provenance.mutation_source IS 'Source system that triggered the mutation (parent-atlas-mutation-gate, opencode-agent, manual-edit, etc.)';
