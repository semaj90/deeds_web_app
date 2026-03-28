-- Case Notes table for storing user notes attached to cases
CREATE TABLE IF NOT EXISTS "case_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "title" varchar(255),
  "content" text NOT NULL,
  "is_ai" boolean DEFAULT false,
  "is_pinned" boolean DEFAULT false,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "case_notes_case_id_idx" ON "case_notes" ("case_id");
CREATE INDEX IF NOT EXISTS "case_notes_is_pinned_idx" ON "case_notes" ("is_pinned");
CREATE INDEX IF NOT EXISTS "case_notes_created_at_idx" ON "case_notes" ("created_at");
