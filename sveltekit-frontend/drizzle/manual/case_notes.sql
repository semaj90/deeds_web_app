-- Manual migration for case notes + versioning
-- Created: 2026-03-04
-- Purpose: Add case_notes and case_note_versions tables
-- Note: createdBy/editedBy use uuid (matching users.id actual type)

-- Create case_notes table
CREATE TABLE IF NOT EXISTS "case_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"title" varchar(255),
	"content" text NOT NULL,
	"is_ai" boolean DEFAULT false,
	"is_pinned" boolean DEFAULT false,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create case_note_versions table
CREATE TABLE IF NOT EXISTS "case_note_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"title" varchar(255),
	"content" text NOT NULL,
	"version_number" integer NOT NULL,
	"edited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Add foreign keys (conditional to avoid errors on re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_notes_case_id_cases_id_fk'
  ) THEN
    ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_case_id_cases_id_fk"
      FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_notes_created_by_users_id_fk'
  ) THEN
    ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_note_versions_note_id_case_notes_id_fk'
  ) THEN
    ALTER TABLE "case_note_versions" ADD CONSTRAINT "case_note_versions_note_id_case_notes_id_fk"
      FOREIGN KEY ("note_id") REFERENCES "public"."case_notes"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_note_versions_edited_by_users_id_fk'
  ) THEN
    ALTER TABLE "case_note_versions" ADD CONSTRAINT "case_note_versions_edited_by_users_id_fk"
      FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS "case_notes_case_id_idx" ON "case_notes" USING btree ("case_id");
CREATE INDEX IF NOT EXISTS "case_notes_is_pinned_idx" ON "case_notes" USING btree ("is_pinned");
CREATE INDEX IF NOT EXISTS "case_notes_created_at_idx" ON "case_notes" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "case_note_versions_note_id_idx" ON "case_note_versions" USING btree ("note_id");
CREATE INDEX IF NOT EXISTS "case_note_versions_version_idx" ON "case_note_versions" USING btree ("note_id", "version_number");
