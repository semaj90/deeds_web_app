-- Add FK constraint on chat_metadata.case_id → cases.id
-- Non-breaking: existing rows with NULL case_id remain valid.
-- ON DELETE SET NULL: if a case is deleted, the chat remains but loses its case link.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chat_metadata_case_id_fk'
      AND table_name = 'chat_metadata'
  ) THEN
    ALTER TABLE chat_metadata
      ADD CONSTRAINT chat_metadata_case_id_fk
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL;
  END IF;
END $$;
