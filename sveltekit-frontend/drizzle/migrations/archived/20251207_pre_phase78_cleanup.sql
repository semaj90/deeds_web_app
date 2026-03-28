-- Phase 78 Pre-Migration Cleanup
-- Run this BEFORE the main Drizzle push to prevent constraint errors

-- 1. Ensure legal_documents.evidence_id column exists
ALTER TABLE "legal_documents"
ADD COLUMN IF NOT EXISTS "evidence_id" uuid;

-- 2. Truncate user_embeddings to allow NOT NULL model column
TRUNCATE TABLE "user_embeddings" CASCADE;

-- 3. These truncates will be done by Drizzle, but listing here for clarity:
-- TRUNCATE TABLE "evidence" CASCADE;
-- TRUNCATE TABLE "users" CASCADE;

-- Note: This is a HARD RESET for Phase 78. All data in these tables will be lost.
-- Only run this in local dev environments where data loss is acceptable.
