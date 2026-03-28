-- Case Note Evidence References table for linking notes to evidence items
CREATE TABLE IF NOT EXISTS "case_note_evidence_refs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "note_id" uuid NOT NULL REFERENCES "case_notes"("id") ON DELETE CASCADE,
  "evidence_id" uuid NOT NULL REFERENCES "evidence"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "case_note_refs_note_id_idx" ON "case_note_evidence_refs" ("note_id");
CREATE INDEX IF NOT EXISTS "case_note_refs_evidence_id_idx" ON "case_note_evidence_refs" ("evidence_id");

-- Unique constraint to prevent duplicate references
ALTER TABLE "case_note_evidence_refs"
ADD CONSTRAINT "case_note_refs_unique" UNIQUE ("note_id", "evidence_id");
