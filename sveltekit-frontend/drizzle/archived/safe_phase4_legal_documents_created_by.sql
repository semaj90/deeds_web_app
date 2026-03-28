-- Safe Phase 4 Migration: Add created_by column + FK to legal_documents
-- This is idempotent and handles both missing column and existing FK gracefully

-- Ensure created_by column exists on legal_documents
ALTER TABLE "legal_documents"
  ADD COLUMN IF NOT EXISTS "created_by" uuid;

-- Add the FK constraint in an idempotent way
DO $do$ BEGIN
  BEGIN
    ALTER TABLE "legal_documents"
      ADD CONSTRAINT "legal_documents_created_by_users_id_fk"
      FOREIGN KEY ("created_by")
      REFERENCES "public"."users"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
  END;
END; $do$;

-- Verify the column and constraint exist
-- Run: \d "legal_documents" to see the result
