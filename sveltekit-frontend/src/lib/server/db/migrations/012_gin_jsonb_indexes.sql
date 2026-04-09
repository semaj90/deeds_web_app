-- ============================================================================
-- Migration 012: GIN Indexes on Actively-Queried JSONB Columns
-- ============================================================================
-- Production DB audit (April 8, 2026):
--   60 JSONB columns across 38 tables, only 3 GIN indexes exist:
--     1. document_chunks.metadata (jsonb_path_ops) — created this session
--     2. legal_chunks.tsv (full-text) — pre-existing
--     3. legal_nodes.tags_json — pre-existing
--
-- This migration adds GIN indexes for the most-queried JSONB columns.
-- All use IF NOT EXISTS — safe to run multiple times.
-- Uses DO blocks with dynamic EXECUTE since plain DDL can't check column existence.
-- ============================================================================

-- ── 1. evidence.metadata (HIGH) ─────────────────────────────────────────────
-- Used by: /api/evidence/search, evidence upload pipeline, QLora training
-- Queries: metadata->>'summary', metadata->'entities', metadata->'tags'
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evidence' AND column_name = 'metadata'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_evidence_metadata_gin
      ON evidence USING GIN (metadata jsonb_path_ops)';
    RAISE NOTICE '✅ Created GIN index on evidence.metadata';
  END IF;
END $$;

-- ── 2. evidence.ai_tags (HIGH) ──────────────────────────────────────────────
-- Used by: evidence filtering, POI photo cross-reference
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evidence' AND column_name = 'ai_tags'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_evidence_ai_tags_gin
      ON evidence USING GIN (ai_tags jsonb_path_ops)';
    RAISE NOTICE '✅ Created GIN index on evidence.ai_tags';
  END IF;
END $$;

-- ── 3. evidence.tags (HIGH) ─────────────────────────────────────────────────
-- Used by: /api/tags endpoint, evidence filtering
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evidence' AND column_name = 'tags'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_evidence_tags_gin
      ON evidence USING GIN (tags jsonb_path_ops)';
    RAISE NOTICE '✅ Created GIN index on evidence.tags';
  END IF;
END $$;

-- ── 4. cases.metadata (HIGH) ────────────────────────────────────────────────
-- Used by: case queries, recommendation engine
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cases' AND column_name = 'metadata'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cases_metadata_gin
      ON cases USING GIN (metadata jsonb_path_ops)';
    RAISE NOTICE '✅ Created GIN index on cases.metadata';
  END IF;
END $$;

-- ── 5. legal_documents.metadata (MEDIUM) ────────────────────────────────────
-- Used by: /api/recommendations (metadata->>'tags' IS NOT NULL)
--          jsonb-legal-schema.ts (practiceArea, jurisdiction, caseType filtering)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'legal_documents' AND column_name = 'metadata'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_legal_documents_metadata_gin
      ON legal_documents USING GIN (metadata jsonb_path_ops)';
    RAISE NOTICE '✅ Created GIN index on legal_documents.metadata';
  END IF;
END $$;

-- ── 6. criminals.ai_tags (MEDIUM) ───────────────────────────────────────────
-- Used by: POI profile queries, AI-generated tag filtering
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'criminals' AND column_name = 'ai_tags'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_criminals_ai_tags_gin
      ON criminals USING GIN (ai_tags jsonb_path_ops)';
    RAISE NOTICE '✅ Created GIN index on criminals.ai_tags';
  END IF;
END $$;

-- ── 7. poi_photos.forensic_data (MEDIUM) ────────────────────────────────────
-- Used by: forensic analysis pipeline, VLM photo analysis
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'poi_photos' AND column_name = 'forensic_data'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_poi_photos_forensic_data_gin
      ON poi_photos USING GIN (forensic_data jsonb_path_ops)';
    RAISE NOTICE '✅ Created GIN index on poi_photos.forensic_data';
  END IF;
END $$;

-- ── 8. poi_photos.ai_tags (MEDIUM) ──────────────────────────────────────────
-- Used by: VLM photo tagging, photo search
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'poi_photos' AND column_name = 'ai_tags'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_poi_photos_ai_tags_gin
      ON poi_photos USING GIN (ai_tags jsonb_path_ops)';
    RAISE NOTICE '✅ Created GIN index on poi_photos.ai_tags';
  END IF;
END $$;

-- ── 9. yorha_evidence_nodes.ai_tags + key_entities (MEDIUM) ─────────────────
-- Used by: graph queries, evidence node filtering
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yorha_evidence_nodes' AND column_name = 'ai_tags'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_yorha_evidence_nodes_ai_tags_gin
      ON yorha_evidence_nodes USING GIN (ai_tags jsonb_path_ops)';
    RAISE NOTICE '✅ Created GIN index on yorha_evidence_nodes.ai_tags';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'yorha_evidence_nodes' AND column_name = 'key_entities'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_yorha_evidence_nodes_entities_gin
      ON yorha_evidence_nodes USING GIN (key_entities jsonb_path_ops)';
    RAISE NOTICE '✅ Created GIN index on yorha_evidence_nodes.key_entities';
  END IF;
END $$;

-- ── 10. persons_of_interest.ai_profile (MEDIUM) ─────────────────────────────
-- Used by: POI analysis, risk assessment queries
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'persons_of_interest' AND column_name = 'ai_profile'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_poi_ai_profile_gin
      ON persons_of_interest USING GIN (ai_profile jsonb_path_ops)';
    RAISE NOTICE '✅ Created GIN index on persons_of_interest.ai_profile';
  END IF;
END $$;

-- ── 11. evidence_chunks.metadata (MEDIUM) ───────────────────────────────────
-- Used by: RAG chunk retrieval with metadata filtering
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evidence_chunks' AND column_name = 'metadata'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_evidence_chunks_metadata_gin
      ON evidence_chunks USING GIN (metadata jsonb_path_ops)';
    RAISE NOTICE '✅ Created GIN index on evidence_chunks.metadata';
  END IF;
END $$;

-- ============================================================================
-- Verify all GIN indexes
-- ============================================================================
SELECT tablename, indexname
FROM pg_indexes
WHERE indexdef LIKE '%gin%' OR indexdef LIKE '%GIN%'
ORDER BY tablename, indexname;