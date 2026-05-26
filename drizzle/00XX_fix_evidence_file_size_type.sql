-- Migration for evidence.file_size type mismatch: Drizzle expects BIGINT, live DB has INTEGER.
-- This migration assumes the target type in Drizzle should be BIGINT for consistency.
ALTER TABLE evidence ALTER COLUMN file_size TYPE BIGINT USING file_size::bigint;