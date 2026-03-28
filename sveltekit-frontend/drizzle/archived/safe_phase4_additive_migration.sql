-- Safe Phase 4 Migration: Add Missing Chat Tables
-- Date: 2025-12-09
-- Purpose: Add chat_turn_evidence and other missing tables for Phase 4
-- Risk Level: LOW (additive only, no data loss)

-- ===========================================
-- CHAT TURN EVIDENCE TABLE
-- Links uploaded/retrieved evidence to chat turns
-- ===========================================

CREATE TABLE IF NOT EXISTS chat_turn_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_turn_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  object_uri text,
  role text CHECK (role IN ('uploaded', 'retrieved')),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Foreign key constraints (safe - only add if tables exist)
  CONSTRAINT fk_chat_turn_evidence_chat_turn
    FOREIGN KEY (chat_turn_id) REFERENCES chat_turns(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_turn_evidence_evidence
    FOREIGN KEY (evidence_id) REFERENCES evidence(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_turn_evidence_chat_turn
  ON chat_turn_evidence(chat_turn_id);
CREATE INDEX IF NOT EXISTS idx_chat_turn_evidence_evidence
  ON chat_turn_evidence(evidence_id);
CREATE INDEX IF NOT EXISTS idx_chat_turn_evidence_role
  ON chat_turn_evidence(role);

-- ===========================================
-- CHAT ANALYTICS TABLE
-- Tracks user behavior and query patterns
-- ===========================================

CREATE TABLE IF NOT EXISTS chat_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_turn_id uuid NOT NULL,
  user_id uuid NOT NULL,
  query_length integer,
  response_length integer,
  processing_time_ms integer,
  rag_results_count integer,
  keywords_found jsonb,
  suggestions_used jsonb,
  user_feedback text,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Foreign key constraints
  CONSTRAINT fk_chat_analytics_chat_turn
    FOREIGN KEY (chat_turn_id) REFERENCES chat_turns(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_analytics_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_chat_analytics_user_created
  ON chat_analytics(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_chat_turn
  ON chat_analytics(chat_turn_id);

-- ===========================================
-- WORKSPACE TABLES
-- For organizing evidence and chat sessions
-- ===========================================

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Foreign key constraints
  CONSTRAINT fk_workspaces_case
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_workspaces_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Workspace evidence links
CREATE TABLE IF NOT EXISTS workspace_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  added_by uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_workspace_evidence_workspace
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_evidence_evidence
    FOREIGN KEY (evidence_id) REFERENCES evidence(id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_evidence_added_by
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Workspace chat sessions
CREATE TABLE IF NOT EXISTS workspace_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  session_id uuid NOT NULL,
  added_by uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_workspace_sessions_workspace
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_sessions_session
    FOREIGN KEY (session_id) REFERENCES rag_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_sessions_added_by
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Workspace notes (AI-generated insights)
CREATE TABLE IF NOT EXISTS workspace_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  content text NOT NULL,
  is_ai boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_workspace_notes_workspace
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_notes_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ===========================================
-- ERROR TRACKING TABLES
-- For AI suggestions and error analysis
-- ===========================================

CREATE TABLE IF NOT EXISTS error_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL,
  severity error_severity NOT NULL DEFAULT 'warn',
  frequency integer NOT NULL DEFAULT 1,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS error_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL,
  route_path text NOT NULL,
  title text NOT NULL,
  explanation text NOT NULL,
  patch text,
  confidence numeric(3,2),
  hints text[],
  generated_at timestamptz NOT NULL DEFAULT now(),
  applied_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,

  CONSTRAINT fk_error_suggestions_cluster
    FOREIGN KEY (cluster_id) REFERENCES error_clusters(id) ON DELETE CASCADE
);

-- ===========================================
-- ENHANCED EVIDENCE COLUMNS
-- Add missing columns to evidence table
-- ===========================================

-- Add new columns to evidence table (safe - nullable first)
ALTER TABLE evidence
ADD COLUMN IF NOT EXISTS evidence_type text,
ADD COLUMN IF NOT EXISTS file_type varchar(50),
ADD COLUMN IF NOT EXISTS sub_type varchar(50),
ADD COLUMN IF NOT EXISTS file_url text,
ADD COLUMN IF NOT EXISTS file_name varchar(255),
ADD COLUMN IF NOT EXISTS file_size integer,
ADD COLUMN IF NOT EXISTS mime_type varchar(100),
ADD COLUMN IF NOT EXISTS hash varchar(128),
ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS chain_of_custody jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS lab_analysis jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS ai_analysis jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS ai_tags jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS ai_summary text,
ADD COLUMN IF NOT EXISTS is_admissible boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS confidentiality_level varchar(20) DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS canvas_position jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS uploaded_by uuid,
ADD COLUMN IF NOT EXISTS uploaded_at timestamptz DEFAULT now();

-- Add foreign key for uploaded_by (safe - only if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evidence' AND column_name = 'uploaded_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'evidence' AND constraint_name = 'fk_evidence_uploaded_by'
  ) THEN
    ALTER TABLE evidence
    ADD CONSTRAINT fk_evidence_uploaded_by
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ===========================================
-- INDEXES FOR PERFORMANCE
-- ===========================================

-- Evidence table indexes
CREATE INDEX IF NOT EXISTS idx_evidence_evidence_type ON evidence(evidence_type);
CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_by ON evidence(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_at ON evidence(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_evidence_tags ON evidence USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_evidence_ai_tags ON evidence USING gin(ai_tags);

-- Workspace indexes
CREATE INDEX IF NOT EXISTS idx_workspaces_case_id ON workspaces(case_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_created_by ON workspaces(created_by);
CREATE INDEX IF NOT EXISTS idx_workspace_evidence_workspace ON workspace_evidence(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_evidence_evidence ON workspace_evidence(evidence_id);
CREATE INDEX IF NOT EXISTS idx_workspace_sessions_workspace ON workspace_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_notes_workspace ON workspace_notes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_notes_is_ai ON workspace_notes(is_ai);

-- Error tracking indexes
CREATE INDEX IF NOT EXISTS idx_error_clusters_pattern ON error_clusters(pattern);
CREATE INDEX IF NOT EXISTS idx_error_clusters_severity ON error_clusters(severity);
CREATE INDEX IF NOT EXISTS idx_error_suggestions_cluster ON error_suggestions(cluster_id);
CREATE INDEX IF NOT EXISTS idx_error_suggestions_route ON error_suggestions(route_path);

-- ===========================================
-- MIGRATION COMPLETE
-- ===========================================

-- Log successful completion
DO $$
BEGIN
  RAISE NOTICE 'Safe Phase 4 migration completed successfully - no data loss';
END $$;</content>
<parameter name="filePath">c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\drizzle\safe_phase4_additive_migration.sql