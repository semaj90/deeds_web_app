-- Parent Atlas Plugin: PostgreSQL Extensions Setup
-- Created: 2026-06-15 (Session 66 continued)
-- Purpose: Ensure all required extensions for semantic indexing + JSONB queries

-- Already installed (verified 2026-06-15):
-- pgcrypto v1.4
-- vector v0.8.2
-- pg_trgm v1.6

-- Missing extensions (install below):
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Optional (not yet used):
-- CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
-- CREATE EXTENSION IF NOT EXISTS cube;

-- Verify installation
SELECT extname, extversion FROM pg_extension WHERE extname IN ('pgcrypto', 'vector', 'pg_trgm', 'btree_gin', 'unaccent') ORDER BY extname;
