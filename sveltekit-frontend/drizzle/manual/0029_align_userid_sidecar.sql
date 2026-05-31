-- Sidecar migration: 0029_align_userid_sidecar.sql
-- This file contains destructive or potentially data-changing statements extracted
-- from the auto-generated migration `drizzle/0029_align_userid.sql`.
--
-- Purpose: keep potentially destructive operations out of the automated migration
-- so they are applied manually after operator review and sign-off.
-- The statements below are idempotent where possible (guarded with checks).

-- === Guarded DROP COLUMN statements ===
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='case_chunks' AND column_name='chunk_index'
  ) THEN
    ALTER TABLE case_chunks DROP COLUMN chunk_index;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='case_chunks' AND column_name='section_type'
  ) THEN
    ALTER TABLE case_chunks DROP COLUMN section_type;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='case_chunks' AND column_name='section_subtype'
  ) THEN
    ALTER TABLE case_chunks DROP COLUMN section_subtype;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='case_chunks' AND column_name='text'
  ) THEN
    ALTER TABLE case_chunks DROP COLUMN text;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='case_chunks' AND column_name='embedding'
  ) THEN
    ALTER TABLE case_chunks DROP COLUMN embedding;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='case_chunks' AND column_name='token_start'
  ) THEN
    ALTER TABLE case_chunks DROP COLUMN token_start;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='case_chunks' AND column_name='token_end'
  ) THEN
    ALTER TABLE case_chunks DROP COLUMN token_end;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='case_chunks' AND column_name='created_at'
  ) THEN
    ALTER TABLE case_chunks DROP COLUMN created_at;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='chat_embeddings' AND column_name='rag_message_id'
  ) THEN
    ALTER TABLE chat_embeddings DROP COLUMN rag_message_id;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='chat_embeddings' AND column_name='model'
  ) THEN
    ALTER TABLE chat_embeddings DROP COLUMN model;
  END IF;
END$$;

-- === Type changes & other ALTERs that require manual review ===
-- The following ALTER COLUMN ... SET DATA TYPE statements can be data-destructive
-- if the existing data does not cast cleanly. Review and run manually. Suggested
-- safe pattern for type change:
-- 1) CREATE TEMP COLUMN with new type (e.g. id_tmp bigint);
-- 2) UPDATE ... SET id_tmp = (CASE WHEN <safe_cast_condition> THEN <casted_value> ELSE NULL END);
-- 3) Validate data in id_tmp; fix or backfill as needed.
-- 4) ALTER TABLE ... DROP COLUMN old; ALTER TABLE ... RENAME COLUMN id_tmp TO old;

-- Examples extracted from generated migration (do NOT run automatically):
-- ALTER TABLE case_chunks ALTER COLUMN id SET DATA TYPE serial;
-- ALTER TABLE agent_memory_observations ALTER COLUMN source SET DATA TYPE text;
-- ALTER TABLE agent_memory_observations ALTER COLUMN ide SET DATA TYPE text;
-- ALTER TABLE agent_memory_observations ALTER COLUMN embedding_model SET DATA TYPE text;
-- ALTER TABLE chat_embeddings ALTER COLUMN id SET DATA TYPE serial;
-- ALTER TABLE chat_embeddings ALTER COLUMN embedding SET DATA TYPE vector(384);
-- ALTER TABLE document_chunks ALTER COLUMN document_id SET DATA TYPE text;
-- ALTER TABLE intent_synthesis ALTER COLUMN reward_score SET DATA TYPE numeric;
-- ALTER TABLE persons_of_interest ALTER COLUMN created_by SET DATA TYPE integer;

-- Operator checklist before applying this sidecar:
-- - Backup the database or ensure you have a recent snapshot.
-- - Review each type-change and DROP above; run the safe pattern described.
-- - Confirm there are no dependent objects (indexes, FK constraints) that require update.
-- - Apply sidecar in a maintenance window and verify application behavior.

-- End of sidecar
