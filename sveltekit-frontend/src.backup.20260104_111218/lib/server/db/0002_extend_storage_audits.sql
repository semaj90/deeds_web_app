-- Migration: extend storage_audits with richer trace fields -- Adds ip, user_agent, and user_email to improve
traceability ALTER TABLE IF EXISTS storage_audits ADD COLUMN IF NOT EXISTS ip inet, ADD COLUMN IF NOT EXISTS user_agent
text, ADD COLUMN IF NOT EXISTS user_email text; -- Optional: index on created_at for faster admin queries CREATE INDEX
IF NOT EXISTS idx_storage_audits_created_at ON storage_audits (created_at DESC);
