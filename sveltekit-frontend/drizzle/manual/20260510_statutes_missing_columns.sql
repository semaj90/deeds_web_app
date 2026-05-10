-- Migration: align statutes columns with Drizzle schema declaration.
--
-- Surfaced 2026-05-10 by /api/statutes routes returning 500 with:
--   error: column "category" does not exist
-- triggered by `SELECT DISTINCT category FROM statutes WHERE category IS NOT NULL`.
--
-- The Drizzle schema (schema-postgres.ts) declares `section`, `category`, and
-- `source_url` on the statutes table — none of which existed in the DB.
--
-- Apply: psql $DATABASE_URL -f drizzle/manual/20260510_statutes_missing_columns.sql
-- Idempotent — safe to re-run.

ALTER TABLE statutes
  ADD COLUMN IF NOT EXISTS section    varchar(100),  -- e.g., §187(a)
  ADD COLUMN IF NOT EXISTS category   varchar(100),  -- criminal, civil, probate, etc.
  ADD COLUMN IF NOT EXISTS source_url text;
