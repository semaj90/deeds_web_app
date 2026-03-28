-- Safe Phase 4 Migration: Essential Missing Tables
-- Date: 2025-12-09
-- Purpose: Add only the critical missing tables for Phase 4
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
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add foreign key constraints (only if tables exist)
ALTER TABLE chat_turn_evidence
ADD CONSTRAINT fk_chat_turn_evidence_chat_turn
FOREIGN KEY (chat_turn_id) REFERENCES chat_turns(id) ON DELETE CASCADE;

ALTER TABLE chat_turn_evidence
ADD CONSTRAINT fk_chat_turn_evidence_evidence
FOREIGN KEY (evidence_id) REFERENCES evidence(id) ON DELETE CASCADE;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_turn_evidence_chat_turn
  ON chat_turn_evidence(chat_turn_id);
CREATE INDEX IF NOT EXISTS idx_chat_turn_evidence_evidence
  ON chat_turn_evidence(evidence_id);
CREATE INDEX IF NOT EXISTS idx_chat_turn_evidence_role
  ON chat_turn_evidence(role);

-- ===========================================
-- ENHANCE EVIDENCE TABLE
-- Add missing columns for Phase 4 functionality
-- ===========================================

-- Add new columns to evidence table (safe - nullable)
ALTER TABLE evidence
ADD COLUMN IF NOT EXISTS evidence_type text,
ADD COLUMN IF NOT EXISTS file_type varchar(50),
ADD COLUMN IF NOT EXISTS file_url text,
ADD COLUMN IF NOT EXISTS file_name varchar(255),
ADD COLUMN IF NOT EXISTS file_size integer,
ADD COLUMN IF NOT EXISTS mime_type varchar(100),
ADD COLUMN IF NOT EXISTS hash varchar(128),
ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS ai_analysis jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS ai_tags jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS ai_summary text,
ADD COLUMN IF NOT EXISTS uploaded_by uuid,
ADD COLUMN IF NOT EXISTS uploaded_at timestamptz DEFAULT now();

-- Add foreign key for uploaded_by (only if users table exists)
ALTER TABLE evidence
ADD CONSTRAINT fk_evidence_uploaded_by
FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_evidence_evidence_type ON evidence(evidence_type);
CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_by ON evidence(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_at ON evidence(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_evidence_tags ON evidence USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_evidence_ai_tags ON evidence USING gin(ai_tags);

-- ===========================================
-- MIGRATION COMPLETE
-- ===========================================