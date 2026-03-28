-- Case Reporter Schema Migration
-- Creates tables for case summaries, charges, and audit logging

-- Create case_reports table
CREATE TABLE IF NOT EXISTS case_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL,
  summary_text TEXT NOT NULL,
  citations JSONB,
  holding TEXT,
  version INTEGER DEFAULT 1 NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  is_current BOOLEAN DEFAULT TRUE NOT NULL
);

-- Create indexes for case_reports
CREATE INDEX IF NOT EXISTS idx_case_reports_case_id ON case_reports(case_id);
CREATE INDEX IF NOT EXISTS idx_case_reports_created_by ON case_reports(created_by);
CREATE INDEX IF NOT EXISTS idx_case_reports_created_at ON case_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_case_reports_is_current ON case_reports(is_current);

-- Create case_charges table
CREATE TABLE IF NOT EXISTS case_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL,
  statute_code VARCHAR(50) NOT NULL,
  jurisdiction VARCHAR(12) NOT NULL,
  severity VARCHAR(20),
  victim_class VARCHAR(50),
  bundling JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create indexes for case_charges
CREATE INDEX IF NOT EXISTS idx_case_charges_case_id ON case_charges(case_id);
CREATE INDEX IF NOT EXISTS idx_case_charges_statute_code ON case_charges(statute_code);
CREATE INDEX IF NOT EXISTS idx_case_charges_jurisdiction ON case_charges(jurisdiction);

-- Create audit_log table
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create indexes for audit_log
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource_type ON audit_log(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

-- Add pgvector extension if not exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Create statute_embeddings table for pgvector
CREATE TABLE IF NOT EXISTS statute_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statute_code VARCHAR(50) NOT NULL UNIQUE,
  jurisdiction VARCHAR(12) NOT NULL,
  title TEXT,
  text TEXT,
  embedding vector(768),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create index for statute_embeddings
CREATE INDEX IF NOT EXISTS idx_statute_embeddings_statute_code ON statute_embeddings(statute_code);
CREATE INDEX IF NOT EXISTS idx_statute_embeddings_embedding ON statute_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create case_embeddings table for pgvector
CREATE TABLE IF NOT EXISTS case_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL,
  summary_id UUID NOT NULL,
  embedding vector(768),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create index for case_embeddings
CREATE INDEX IF NOT EXISTS idx_case_embeddings_case_id ON case_embeddings(case_id);
CREATE INDEX IF NOT EXISTS idx_case_embeddings_summary_id ON case_embeddings(summary_id);
CREATE INDEX IF NOT EXISTS idx_case_embeddings_embedding ON case_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
