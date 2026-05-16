-- Phase 9C: Production Identity & Schema Reconciliation
-- Migrates serial integers to UUIDs for users and related FKs to align with Drizzle standardization.
-- Resolved 10+ High-severity drifts detected on 2026-05-16.

BEGIN;

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. HELPER FUNCTION for predictable UUID mapping (integer -> padded UUID)
-- This ensures referential integrity is preserved during the cast.
CREATE OR REPLACE FUNCTION int_to_uuid(i integer) RETURNS uuid AS $$
BEGIN
    IF i IS NULL THEN RETURN NULL; END IF;
    RETURN (('00000000-0000-0000-0000-' || lpad(to_hex(i), 12, '0'))::uuid);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. USERS TABLE MIGRATION
-- Drop PK constraint and default temporarily to allow type change
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey CASCADE;
ALTER TABLE users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE users ALTER COLUMN id SET DATA TYPE uuid USING int_to_uuid(id);
ALTER TABLE users ADD PRIMARY KEY (id);
ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 4. REFERENCING TABLES MIGRATION
-- Cases
ALTER TABLE cases ALTER COLUMN user_id SET DATA TYPE uuid USING int_to_uuid(user_id);
-- Chat Messages
ALTER TABLE chat_messages ALTER COLUMN user_id SET DATA TYPE uuid USING int_to_uuid(user_id);
-- Audit Log
ALTER TABLE audit_log ALTER COLUMN user_id SET DATA TYPE uuid USING int_to_uuid(user_id);
-- Analytics Events
ALTER TABLE user_analytics_events ALTER COLUMN user_id SET DATA TYPE uuid USING int_to_uuid(user_id);
ALTER TABLE analytics_events ALTER COLUMN user_id SET DATA TYPE uuid USING int_to_uuid(user_id);
-- Chunk Hit Log
ALTER TABLE chunk_hit_log ALTER COLUMN user_id SET DATA TYPE uuid USING int_to_uuid(user_id);
-- Synthesis Runs
ALTER TABLE synthesis_runs ALTER COLUMN user_id SET DATA TYPE uuid USING int_to_uuid(user_id);
-- Persons of Interest
ALTER TABLE persons_of_interest ALTER COLUMN created_by SET DATA TYPE uuid USING int_to_uuid(created_by);

-- Additional tables detected by cascade
ALTER TABLE ai_reports ALTER COLUMN created_by SET DATA TYPE uuid USING int_to_uuid(created_by);
ALTER TABLE case_scores ALTER COLUMN calculated_by SET DATA TYPE uuid USING int_to_uuid(calculated_by);
ALTER TABLE llm_outputs ALTER COLUMN user_id SET DATA TYPE uuid USING int_to_uuid(user_id);
ALTER TABLE admin_telemetry ALTER COLUMN user_id SET DATA TYPE uuid USING int_to_uuid(user_id);
ALTER TABLE rg_search_runs ALTER COLUMN user_id SET DATA TYPE uuid USING int_to_uuid(user_id);

-- Chat Embeddings
ALTER TABLE chat_embeddings ALTER COLUMN id SET DATA TYPE uuid USING gen_random_uuid();

-- 5. TYPE ALIGNMENT (Non-identity drifts)
-- Evidence
ALTER TABLE evidence ALTER COLUMN file_size SET DATA TYPE bigint;
-- Cases
ALTER TABLE cases ALTER COLUMN status SET DATA TYPE text;
ALTER TABLE cases ALTER COLUMN priority SET DATA TYPE text;
-- Route Metadata
ALTER TABLE route_metadata ALTER COLUMN path SET DATA TYPE text;
-- LLM Output Chunks
ALTER TABLE llm_output_chunks ALTER COLUMN role SET DATA TYPE text;
-- Document Chunks
ALTER TABLE document_chunks ALTER COLUMN document_id SET DATA TYPE uuid USING (CASE WHEN document_id ~ '^[0-9a-fA-F-]{36}$' THEN document_id::uuid ELSE gen_random_uuid() END);

-- 6. MISSING INFRASTRUCTURE COLUMNS
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS file_key text;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS size_bytes bigint;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS hash_algorithm text;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS uploaded_by_user_id uuid;

ALTER TABLE jurisdictions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE jurisdictions ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

ALTER TABLE cases ADD COLUMN IF NOT EXISTS case_embedding vector(768);
ALTER TABLE cases ADD COLUMN IF NOT EXISTS case_embedding_384 vector(384);

-- 7. CLEANUP
DROP FUNCTION IF EXISTS int_to_uuid(integer);

COMMIT;
