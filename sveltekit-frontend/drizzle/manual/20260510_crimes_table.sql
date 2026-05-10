-- Migration: create crimes table to match schema/legal-cases.ts declaration.
--
-- Surfaced 2026-05-10 by /api/search/filters returning 500 with:
--   error: relation "crimes" does not exist
-- triggered by `SELECT DISTINCT crime_category FROM crimes WHERE crime_category IS NOT NULL`.
--
-- The Drizzle schema (src/lib/server/db/schema/legal-cases.ts) declares this table,
-- but it lives in a sub-schema not picked up by drizzle-kit's main config (which reads
-- ./src/lib/server/db/schema.ts → schema-postgres.ts), so it was never auto-created.
--
-- Apply: psql $DATABASE_URL -f drizzle/manual/20260510_crimes_table.sql
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS crimes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                  uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  crime_code               text NOT NULL,                        -- e.g. "PC 211"
  crime_category           text NOT NULL,                        -- "robbery" | "drug" | "homicide" | ...
  crime_classification     text NOT NULL,                        -- "felony" | "misdemeanor" | "infraction" | "wobbler"
  attempted                boolean DEFAULT false,
  sentencing_year          integer,
  sentence_length_months   integer,
  enhancements             jsonb,                                -- array of enhancement strings
  created_at               timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crimes_case_id_idx        ON crimes (case_id);
CREATE INDEX IF NOT EXISTS crimes_category_idx       ON crimes (crime_category);
CREATE INDEX IF NOT EXISTS crimes_classification_idx ON crimes (crime_classification);
