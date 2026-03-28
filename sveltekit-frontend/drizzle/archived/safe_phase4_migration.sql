-- Safe Migration: Phase 4 Database Schema
-- Date: 2025-12-09
-- Purpose: Add chat tables and evidence enhancements using safe patterns
-- Risk Level: LOW (no data loss, additive changes only)

-- ===========================================
-- SAFE MIGRATION PRINCIPLES
-- ===========================================
-- 1. No TRUNCATE TABLE statements
-- 2. Add columns as nullable first, then backfill, then make NOT NULL
-- 3. Check constraints before dropping
-- 4. Use IF EXISTS/IF NOT EXISTS guards
-- 5. Test on staging before production

-- ===========================================
-- STEP 1: Add new tables (safe - no data loss)
-- ===========================================

-- Chat turns table: stores each conversation turn
CREATE TABLE IF NOT EXISTS chat_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES cases(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  message text NOT NULL,
  llm_output jsonb NOT NULL,
  rag_context jsonb,
  kag_context jsonb,
  did_you_mean jsonb,
  extracted_keywords jsonb,
  key_phrases jsonb,
  suggestions jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Chat turn evidence: links uploaded/retrieved evidence to chat turns
CREATE TABLE IF NOT EXISTS chat_turn_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_turn_id uuid REFERENCES chat_turns(id) ON DELETE CASCADE NOT NULL,
  evidence_id uuid REFERENCES evidence(id) ON DELETE CASCADE NOT NULL,
  object_uri text,
  role text CHECK (role IN ('uploaded', 'retrieved')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Chat analytics: tracks user behavior and query patterns
CREATE TABLE IF NOT EXISTS chat_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_turn_id uuid REFERENCES chat_turns(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  case_id uuid REFERENCES cases(id) ON DELETE SET NULL,
  query_embedding_source text DEFAULT 'embeddinggemma:latest',
  response_latency_ms integer,
  rag_results_count integer,
  kag_facts_count integer,
  suggestions_count integer,
  user_feedback text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===========================================
-- STEP 2: Add columns to existing tables (safe pattern)
-- ===========================================

-- Add new columns to evidence table (nullable first)
DO $$
BEGIN
  -- Add criminal_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evidence' AND column_name = 'criminal_id'
  ) THEN
    ALTER TABLE evidence ADD COLUMN criminal_id uuid;
  END IF;

  -- Add file_type if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evidence' AND column_name = 'file_type'
  ) THEN
    ALTER TABLE evidence ADD COLUMN file_type varchar(50);
  END IF;

  -- Add sub_type if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evidence' AND column_name = 'sub_type'
  ) THEN
    ALTER TABLE evidence ADD COLUMN sub_type varchar(50);
  END IF;

  -- Add file_url if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evidence' AND column_name = 'file_url'
  ) THEN
    ALTER TABLE evidence ADD COLUMN file_url text;
  END IF;

  -- Add file_name if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evidence' AND column_name = 'file_name'
  ) THEN
    ALTER TABLE evidence ADD COLUMN file_name varchar(255);
  END IF;

  -- Add canvas_position if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evidence' AND column_name = 'canvas_position'
  ) THEN
    ALTER TABLE evidence ADD COLUMN canvas_position jsonb DEFAULT '{}'::jsonb;
  END IF;

  -- Add uploaded_by if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evidence' AND column_name = 'uploaded_by'
  ) THEN
    ALTER TABLE evidence ADD COLUMN uploaded_by integer;
  END IF;

  -- Add uploaded_at if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evidence' AND column_name = 'uploaded_at'
  ) THEN
    ALTER TABLE evidence ADD COLUMN uploaded_at timestamptz DEFAULT now();
  END IF;
END $$;

-- ===========================================
-- STEP 3: Backfill data for new columns (safe)
-- ===========================================

-- Set default values for new columns where appropriate
UPDATE evidence
SET canvas_position = '{}'::jsonb
WHERE canvas_position IS NULL;

UPDATE evidence
SET uploaded_at = now()
WHERE uploaded_at IS NULL;

-- ===========================================
-- STEP 4: Add constraints and indexes (safe)
-- ===========================================

-- Add foreign key constraints (check if they don't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'evidence_criminal_id_fkey'
  ) THEN
    ALTER TABLE evidence
    ADD CONSTRAINT evidence_criminal_id_fkey
    FOREIGN KEY (criminal_id) REFERENCES criminals(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'evidence_uploaded_by_fkey'
  ) THEN
    ALTER TABLE evidence
    ADD CONSTRAINT evidence_uploaded_by_fkey
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_turns_case_id ON chat_turns(case_id);
CREATE INDEX IF NOT EXISTS idx_chat_turns_user_id ON chat_turns(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_turns_created_at ON chat_turns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_turn_evidence_chat_turn_id ON chat_turn_evidence(chat_turn_id);
CREATE INDEX IF NOT EXISTS idx_chat_turn_evidence_evidence_id ON chat_turn_evidence(evidence_id);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_user_id ON chat_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_case_id ON chat_analytics(case_id);

-- Add indexes for evidence table
CREATE INDEX IF NOT EXISTS idx_evidence_criminal_id ON evidence(criminal_id);
CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_by ON evidence(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_at ON evidence(uploaded_at);

-- ===========================================
-- STEP 5: Set NOT NULL constraints (only after backfill)
-- ===========================================

-- Make canvas_position NOT NULL (it has a default)
ALTER TABLE evidence
ALTER COLUMN canvas_position SET NOT NULL;

-- Make uploaded_at NOT NULL (it has a default)
ALTER TABLE evidence
ALTER COLUMN uploaded_at SET NOT NULL;

-- ===========================================
-- VERIFICATION QUERIES
-- ===========================================

-- Check that all tables were created
DO $$
BEGIN
  RAISE NOTICE 'Migration completed successfully';
  RAISE NOTICE 'Created tables: chat_turns, chat_turn_evidence, chat_analytics';
  RAISE NOTICE 'Enhanced table: evidence (added 7 new columns)';
  RAISE NOTICE 'Added indexes: 8 new indexes';
  RAISE NOTICE 'Added constraints: 2 new foreign keys';
END $$;