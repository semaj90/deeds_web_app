-- Add case_id FK column to chat_messages table
-- Non-breaking: existing rows get NULL (non-case chats)
-- Case-bound sessions populate this on insert via SSE chat handler

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS case_id UUID;

-- FK constraint to cases table (set null on case deletion)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chat_messages_case_id_fk'
      AND table_name = 'chat_messages'
  ) THEN
    ALTER TABLE chat_messages
      ADD CONSTRAINT chat_messages_case_id_fk
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- Index for case-scoped message queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_case_id
  ON chat_messages (case_id)
  WHERE case_id IS NOT NULL;
