-- Validation script for 0029_align_userid sidecar
-- DO NOT APPLY. Read-only checks only.
-- If OpenCode's current working dir is `sveltekit-frontend`, use:
--   \i 'drizzle/manual/0029_align_userid_sidecar.sql'
-- NOT: \i 'sveltekit-frontend/drizzle/manual/0029_align_userid_sidecar.sql'

-- This file performs non-destructive checks for each ALTER / DROP / TYPE change
-- described in:
--   drizzle/0029_align_userid.sql
--   drizzle/manual/0029_align_userid_sidecar.sql
-- It reports current column types, row counts, null counts, possible invalid-cast
-- rows (for integer narrowing), and dependency checks (indexes, FKs, views).

-- NOTE: This file should be executed inside a READ-ONLY transaction, for example:
-- psql "${PG_CONN}" -v ON_ERROR_STOP=1 -c "BEGIN; SET TRANSACTION READ ONLY; \i 'drizzle/manual/0029_align_userid_validation.sql'; ROLLBACK;"

-- =======================================================================
-- Helper: show current column type and definition
-- =======================================================================
-- usage: replace :table and :column below for simple single checks

-- =======================================================================
-- 1) case_chunks.id -> serial            (HIGH RISK)
--    - Check current data type
SELECT 'case_chunks.id: current_type' AS probe, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'case_chunks' AND column_name = 'id';

-- Row counts & nulls
SELECT 'case_chunks: total_rows' AS probe, COUNT(*) AS cnt FROM case_chunks;
SELECT 'case_chunks.id: null_count' AS probe, COUNT(*) AS nulls FROM case_chunks WHERE id IS NULL;

-- Invalid-cast check for integer conversion: rows where id::text is not numeric
SELECT 'case_chunks.id: non_numeric_count' AS probe, COUNT(*) AS cnt
FROM case_chunks
WHERE id IS NOT NULL AND (id::text !~ '^[0-9]+$');

-- Dependency checks: indexes, constraints, views referencing the column
SELECT 'case_chunks.id: pg_indexes' AS probe, * FROM pg_indexes WHERE tablename='case_chunks';
SELECT 'case_chunks.id: constraints' AS probe,
  conname, contype, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'case_chunks';

-- App-safety note: codebase reference scan (run locally)
-- RUN SHELL: rg "case_chunks\b" --hidden --line-number || true
-- RUN SHELL: rg "case_chunks\.id\b|case_chunks\['id'\]|\bcase_chunks\..*id\b" --hidden --line-number || true

-- =======================================================================
-- 2) case_chunks DROP columns (chunk_index, section_type, section_subtype,
--    text, embedding, token_start, token_end, created_at) (HIGH RISK for text/embedding)
--    For DROP COLUMN targets we only check whether the column exists and whether
--    the application references them.

SELECT 'case_chunks: has_chunk_index' AS probe, COUNT(*) FROM information_schema.columns
WHERE table_name='case_chunks' AND column_name='chunk_index';
SELECT 'case_chunks: has_section_type' AS probe, COUNT(*) FROM information_schema.columns
WHERE table_name='case_chunks' AND column_name='section_type';
SELECT 'case_chunks: has_section_subtype' AS probe, COUNT(*) FROM information_schema.columns
WHERE table_name='case_chunks' AND column_name='section_subtype';
SELECT 'case_chunks: has_text' AS probe, COUNT(*) FROM information_schema.columns
WHERE table_name='case_chunks' AND column_name='text';
SELECT 'case_chunks: has_embedding' AS probe, COUNT(*) FROM information_schema.columns
WHERE table_name='case_chunks' AND column_name='embedding';
SELECT 'case_chunks: has_token_start' AS probe, COUNT(*) FROM information_schema.columns
WHERE table_name='case_chunks' AND column_name='token_start';
SELECT 'case_chunks: has_token_end' AS probe, COUNT(*) FROM information_schema.columns
WHERE table_name='case_chunks' AND column_name='token_end';
SELECT 'case_chunks: has_created_at' AS probe, COUNT(*) FROM information_schema.columns
WHERE table_name='case_chunks' AND column_name='created_at';

-- For each DROP target, check references in pg_catalog (views, functions, constraints)
SELECT 'case_chunks: dependent_views' AS probe, viewname, definition
FROM pg_views WHERE definition ILIKE '%case_chunks%' ;

-- App-safety note: search codebase for usage (run locally):
-- rg "case_chunks\.(text|embedding|chunk_index|token_start|token_end|created_at)" || true

-- =======================================================================
-- 3) chat_embeddings.id -> serial  (HIGH RISK)
SELECT 'chat_embeddings.id: current_type' AS probe, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'chat_embeddings' AND column_name = 'id';
SELECT 'chat_embeddings: total_rows' AS probe, COUNT(*) FROM chat_embeddings;
SELECT 'chat_embeddings.id: non_numeric_count' AS probe, COUNT(*) FROM chat_embeddings WHERE id IS NOT NULL AND (id::text !~ '^[0-9]+$');

-- 4) chat_embeddings.embedding -> vector(384)
SELECT 'chat_embeddings.embedding: current_type' AS probe, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name='chat_embeddings' AND column_name='embedding';
SELECT 'chat_embeddings.embedding: null_count' AS probe, COUNT(*) FROM chat_embeddings WHERE embedding IS NULL;

-- 5) chat_embeddings DROP columns (rag_message_id, model)
SELECT 'chat_embeddings: has_rag_message_id' AS probe, COUNT(*) FROM information_schema.columns
WHERE table_name='chat_embeddings' AND column_name='rag_message_id';
SELECT 'chat_embeddings: has_model' AS probe, COUNT(*) FROM information_schema.columns
WHERE table_name='chat_embeddings' AND column_name='model';

-- App-safety note: search for usages in codebase (local):
-- rg "chat_embeddings\.(model|rag_message_id)" || true

-- =======================================================================
-- 6) agent_memory_observations.source/ide/embedding_model -> text
SELECT 'agent_memory_observations.source: current_type' AS probe, column_name, data_type
FROM information_schema.columns WHERE table_name='agent_memory_observations' AND column_name='source';
SELECT 'agent_memory_observations.ide: current_type' AS probe, column_name, data_type
FROM information_schema.columns WHERE table_name='agent_memory_observations' AND column_name='ide';
SELECT 'agent_memory_observations.embedding_model: current_type' AS probe, column_name, data_type
FROM information_schema.columns WHERE table_name='agent_memory_observations' AND column_name='embedding_model';

-- Row counts and nulls
SELECT 'agent_memory_observations: total_rows' AS probe, COUNT(*) FROM agent_memory_observations;
SELECT 'agent_memory_observations.source: null_count' AS probe, COUNT(*) FROM agent_memory_observations WHERE source IS NULL;

-- =======================================================================
-- 7) persons_of_interest.created_by -> integer
SELECT 'persons_of_interest.created_by: current_type' AS probe, column_name, data_type
FROM information_schema.columns WHERE table_name='persons_of_interest' AND column_name='created_by';
SELECT 'persons_of_interest: total_rows' AS probe, COUNT(*) FROM persons_of_interest;
SELECT 'persons_of_interest.created_by: null_count' AS probe, COUNT(*) FROM persons_of_interest WHERE created_by IS NULL;
-- If current type is uuid/text, check numeric-cast viability
SELECT 'persons_of_interest.created_by: non_numeric_count' AS probe, COUNT(*) FROM persons_of_interest
WHERE created_by IS NOT NULL AND (created_by::text !~ '^[0-9]+$');

-- =======================================================================
-- 8) document_chunks.document_id -> text
SELECT 'document_chunks.document_id: current_type' AS probe, column_name, data_type
FROM information_schema.columns WHERE table_name='document_chunks' AND column_name='document_id';
SELECT 'document_chunks: total_rows' AS probe, COUNT(*) FROM document_chunks;

-- =======================================================================
-- 9) intent_synthesis.reward_score -> numeric
SELECT 'intent_synthesis.reward_score: current_type' AS probe, column_name, data_type
FROM information_schema.columns WHERE table_name='intent_synthesis' AND column_name='reward_score';
SELECT 'intent_synthesis: total_rows' AS probe, COUNT(*) FROM intent_synthesis;

-- =======================================================================
-- Summary PASS/WARN/FAIL per column change
-- PASS = no non-numeric rows and no nulls for NOT NULL narrowing candidates
-- WARN = numeric rows OK but some NULLs (requires backfill)
-- FAIL = non-numeric rows present (requires manual cleanup)

WITH
  cc_id AS (
    SELECT
      (SELECT COUNT(*) FROM case_chunks) AS total,
      (SELECT COUNT(*) FROM case_chunks WHERE id IS NULL) AS nulls,
      (SELECT COUNT(*) FROM case_chunks WHERE id IS NOT NULL AND (id::text !~ '^[0-9]+$')) AS non_numeric
  ),
  po_created_by AS (
    SELECT
      (SELECT COUNT(*) FROM persons_of_interest) AS total,
      (SELECT COUNT(*) FROM persons_of_interest WHERE created_by IS NULL) AS nulls,
      (SELECT COUNT(*) FROM persons_of_interest WHERE created_by IS NOT NULL AND (created_by::text !~ '^[0-9]+$')) AS non_numeric
  ),
  chat_id AS (
    SELECT
      (SELECT COUNT(*) FROM chat_embeddings) AS total,
      (SELECT COUNT(*) FROM chat_embeddings WHERE id IS NULL) AS nulls,
      (SELECT COUNT(*) FROM chat_embeddings WHERE id IS NOT NULL AND (id::text !~ '^[0-9]+$')) AS non_numeric
  )

SELECT 'case_chunks.id' AS target,
  CASE WHEN cc_id.non_numeric > 0 THEN 'FAIL'
       WHEN cc_id.nulls > 0 THEN 'WARN'
       ELSE 'PASS' END AS status,
  cc_id.*
FROM cc_id

UNION ALL

SELECT 'persons_of_interest.created_by' AS target,
  CASE WHEN po_created_by.non_numeric > 0 THEN 'FAIL'
       WHEN po_created_by.nulls > 0 THEN 'WARN'
       ELSE 'PASS' END AS status,
  po_created_by.*
FROM po_created_by

UNION ALL

SELECT 'chat_embeddings.id' AS target,
  CASE WHEN chat_id.non_numeric > 0 THEN 'FAIL'
       WHEN chat_id.nulls > 0 THEN 'WARN'
       ELSE 'PASS' END AS status,
  chat_id.*
FROM chat_id;

-- =======================================================================
-- End of validation script. Review results, then plan manual remediation per table.
