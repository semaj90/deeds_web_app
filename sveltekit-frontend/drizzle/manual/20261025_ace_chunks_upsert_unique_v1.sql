-- DRAFT, NOT APPLIED. Adds the unique index that the ace_chunks upsert needs.
--
-- Pre-image (read-only, 2026-10-25):
--   * ace_chunks: 0 rows; only unique index is ace_chunks_pkey (id).
--   * context-assembler.ts upserts with ON CONFLICT (case_id, content_hash, chunk_type),
--     which has no matching unique index, so PostgreSQL rejects it at runtime.
--
-- Safe to create because the table is empty. Re-check the row count before applying:
--   SELECT count(*) FROM ace_chunks;   -- must still be 0, or check for duplicate keys first.
--
-- Rehearsal (ends in ROLLBACK):
--   BEGIN; \i <this file>; SELECT indexname FROM pg_indexes WHERE indexname='ace_chunks_case_content_type_uq'; ROLLBACK;
-- Post-check after an approved apply:
--   SELECT indisunique, indisvalid FROM pg_index WHERE indexrelid = 'ace_chunks_case_content_type_uq'::regclass;

CREATE UNIQUE INDEX IF NOT EXISTS ace_chunks_case_content_type_uq
  ON ace_chunks (case_id, content_hash, chunk_type);
