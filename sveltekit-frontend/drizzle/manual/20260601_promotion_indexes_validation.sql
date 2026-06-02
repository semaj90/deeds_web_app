-- 20260601_promotion_indexes_validation.sql
-- READ-ONLY validation queries. Run manually to confirm state before promotion.
-- DO NOT apply via drizzle-kit migrate — this file is for human inspection only.

-- 1. Postgres version
SELECT version();

-- 2. Target table existence + row counts
SELECT
  table_name,
  (SELECT count(*) FROM information_schema.columns c
   WHERE c.table_schema='public' AND c.table_name=t.table_name) AS col_count
FROM information_schema.tables t
WHERE table_schema='public'
  AND table_name IN (
    'task_semantic_packets','parent_atlas_documents','parent_atlas_vectors',
    'code_llm_index','nes_chrom_packets'
  )
ORDER BY table_name;

-- 3. alias_id column exists on task_semantic_packets
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name='task_semantic_packets'
  AND column_name = 'alias_id';

-- 4. parent_atlas_documents exists (expect 0 rows — it is missing)
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema='public' AND table_name='parent_atlas_documents'
) AS parent_atlas_documents_exists;

-- 5. Duplicate source_ref candidates in task_semantic_packets
SELECT source_ref, count(*) AS n
FROM task_semantic_packets
WHERE source_ref IS NOT NULL
GROUP BY source_ref
HAVING count(*) > 1
ORDER BY n DESC
LIMIT 10;

-- 6. Index list for task_semantic_packets
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='public' AND tablename='task_semantic_packets'
ORDER BY indexname;

-- 7. pgvector extension
SELECT extname, extversion FROM pg_extension WHERE extname='vector';

-- 8. JSONB payload fields in task_semantic_packets (sample)
SELECT id, semantic_path, related_feature_ids
FROM task_semantic_packets
LIMIT 3;

-- 9. Vector extension dimensions check on parent_atlas_vectors
SELECT column_name, udt_name
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name='parent_atlas_vectors'
  AND udt_name LIKE 'vector%'
ORDER BY column_name;
