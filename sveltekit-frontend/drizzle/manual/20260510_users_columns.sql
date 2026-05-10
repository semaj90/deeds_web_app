-- Add missing users columns to match Drizzle schema
-- Run: psql "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db" -f drizzle/manual/20260510_users_columns.sql

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "is_active"                BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "avatar_url"               VARCHAR(2048),
  ADD COLUMN IF NOT EXISTS "has_completed_onboarding" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "onboarding_step"          INTEGER NOT NULL DEFAULT 0;
