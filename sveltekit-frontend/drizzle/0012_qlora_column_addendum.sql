-- Migration 0012: Add missing columns to qlora_examples
--
-- These columns were referenced by /api/analytics/qlora-dataset but absent
-- from the 0011 migration.  All use ADD COLUMN IF NOT EXISTS so this is safe
-- to run even if any column was added manually.

--> statement-breakpoint
ALTER TABLE "qlora_examples"
  ADD COLUMN IF NOT EXISTS "query"         text,
  ADD COLUMN IF NOT EXISTS "entity_tags"   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "model_version" varchar(50),
  ADD COLUMN IF NOT EXISTS "dataset_split" varchar(10);
