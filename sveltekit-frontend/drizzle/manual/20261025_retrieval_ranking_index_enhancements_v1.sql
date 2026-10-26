-- Applied additive index migration; no table, column, or row changes.
--
-- Pre-image (verified by read-only catalog census, 2026-10-25):
--   * atlas_nes_lut_v1: PK (lut_revision, domain_key); UNIQUE (lut_revision, lut_byte).
--     No index serves the inverse lookup nes_byte -> domain within a revision.
--   * retrieval_rank_cache was absent in the initial catalog census. The base DDL was later
--     applied; its indexes below are guarded so this migration remains replay-safe.
--   * kag_dag_runs: id PK only. No query_hash index for cache-style lookup by query.
--   * Already indexed, NOT touched here: nes_chrom_kag_dag_hits (run, packet, chunk,
--     source_ref, node_key, GIN evidence/metadata), ace_retrieval_hits/runs, chunk_hit_log,
--     retrieval_promotion_decisions, retrieval_eval_times.
--
-- Rehearsal (optional, ends in ROLLBACK):
--   BEGIN; \i <this file>; \d atlas_nes_lut_v1; ROLLBACK;
-- Post-check after an approved apply:
--   SELECT indexname FROM pg_indexes WHERE indexname IN (
--     'atlas_nes_lut_v1_inverse_idx','retrieval_rank_cache_created_at_idx',
--     'retrieval_rank_cache_chunk_id_idx','kag_dag_runs_query_hash_created_idx');
--
-- All statements use IF NOT EXISTS. Plain CREATE INDEX takes a SHARE lock; these tables are
-- small, but for a live large table, build each index CONCURRENTLY outside a transaction.

-- Inverse lookup: NES byte -> domain, within one LUT revision (non-unique: the palette
-- may reuse a NES byte across domains, so no uniqueness is asserted here).
CREATE INDEX IF NOT EXISTS atlas_nes_lut_v1_inverse_idx
  ON atlas_nes_lut_v1 (lut_revision, nes_byte);

-- retrieval_rank_cache is NOT present in the live database (its DDL lives in the unapplied
-- 20260507_retrieval_spine.sql). Guard the two indexes so this draft still applies cleanly;
-- they are created only once that table exists.
DO $$
BEGIN
  IF to_regclass('public.retrieval_rank_cache') IS NOT NULL THEN
    -- Cache expiry and eviction scans on the rank cache.
    CREATE INDEX IF NOT EXISTS retrieval_rank_cache_created_at_idx
      ON retrieval_rank_cache (created_at);

    -- Reverse lookup: chunk -> cached query hashes (the PK leads with query_hash).
    CREATE INDEX IF NOT EXISTS retrieval_rank_cache_chunk_id_idx
      ON retrieval_rank_cache (chunk_id);
  ELSE
    RAISE NOTICE 'retrieval_rank_cache absent; skipping its two indexes';
  END IF;
END;
$$;

-- Cache-style lookup of the latest run for a query.
CREATE INDEX IF NOT EXISTS kag_dag_runs_query_hash_created_idx
  ON kag_dag_runs (query_hash, created_at DESC);
