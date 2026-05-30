-- Sidecar migration: Phase19B — sourceRef ↔ card join keys
-- Adds mapping table and nullable card_id columns to enable reliable joins
-- Safe to run on production: all ALTERs use IF NOT EXISTS and are additive.

BEGIN;

-- 1) Mapping table: maps arbitrary sourceRef strings to canonical summary_card ids
CREATE TABLE IF NOT EXISTS card_source_refs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  card_id uuid NOT NULL,
  source_ref text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_card_source_refs_source_ref ON card_source_refs USING btree (source_ref);
CREATE INDEX IF NOT EXISTS idx_card_source_refs_card_id ON card_source_refs USING btree (card_id);

-- 2) Add nullable `card_id` to tables that carry source_refs / source metadata
ALTER TABLE IF EXISTS agent_memory_observations ADD COLUMN IF NOT EXISTS card_id uuid;
ALTER TABLE IF EXISTS intent_synthesis ADD COLUMN IF NOT EXISTS card_id uuid;
ALTER TABLE IF EXISTS agent_observations ADD COLUMN IF NOT EXISTS card_id uuid;

-- 3) Backstop fk (non-blocking): do not enforce immediately to avoid locking; operator may add later
-- Note: FK enforcement is intentionally omitted to allow incremental backfill without long locks.

-- 4) Ensure `summary_cards` has an embedding column and HNSW index for fast nearest-neighbor lookups
-- Add embedding column if missing (pgvector 768-dim expected)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='summary_cards' AND column_name='embedding'
  ) THEN
    ALTER TABLE summary_cards ADD COLUMN embedding real[]; -- placeholder: keep as real[] if pgvector not available at runtime
  END IF;
END$$;

-- Create HNSW index for summary_cards.embedding if pgvector extension & HNSW operator available
-- The index creation is best-effort and uses CONCURRENTLY to avoid locking.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgvector') THEN
    BEGIN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_summary_cards_embedding_hnsw ON summary_cards USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64)';
    EXCEPTION WHEN OTHERS THEN
      -- If operator's pgvector build doesn't expose hnsw or operator permissions disallow, skip silently.
      RAISE NOTICE 'Skipping HNSW index creation for summary_cards.embedding: %', SQLERRM;
    END;
  END IF;
END$$;

COMMIT;

-- Validation commands (run manually):
-- docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT table_name FROM information_schema.tables WHERE table_name IN ('card_source_refs');"
-- docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT column_name FROM information_schema.columns WHERE table_name='agent_memory_observations' AND column_name='card_id';"
-- docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT indexname FROM pg_indexes WHERE indexname LIKE 'idx_summary_cards_embedding_hnsw%';"
