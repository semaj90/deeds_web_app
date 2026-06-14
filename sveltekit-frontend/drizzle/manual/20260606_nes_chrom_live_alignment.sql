-- Sidecar migration: align live NES/CHROM tables with the Drizzle contract mirror.
-- Additive only. Safe to re-run.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE IF EXISTS public.nes_chrom_kag_dag_hits
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_lane_ids_gin
  ON public.nes_chrom_packets USING gin (lane_ids);

CREATE INDEX IF NOT EXISTS nes_chrom_packets_embedding_hnsw
  ON public.nes_chrom_packets USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS nes_chrom_packets_source_ref_trgm_idx
  ON public.nes_chrom_packets USING gin (source_ref gin_trgm_ops);

CREATE INDEX IF NOT EXISTS nes_chrom_packets_norm_source_ref_trgm_idx
  ON public.nes_chrom_packets USING gin (lower(source_ref) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS nes_chrom_packets_summary_trgm_idx
  ON public.nes_chrom_packets USING gin (summary gin_trgm_ops);

CREATE INDEX IF NOT EXISTS nes_chrom_kag_dag_hits_chunk_idx
  ON public.nes_chrom_kag_dag_hits USING btree (chunk_id);

CREATE INDEX IF NOT EXISTS nes_chrom_kag_dag_hits_source_ref_idx
  ON public.nes_chrom_kag_dag_hits USING btree (source_ref);

CREATE INDEX IF NOT EXISTS nes_chrom_kag_dag_hits_node_key_idx
  ON public.nes_chrom_kag_dag_hits USING btree (node_key);

CREATE INDEX IF NOT EXISTS nes_chrom_kag_dag_hits_evidence_gin
  ON public.nes_chrom_kag_dag_hits USING gin (evidence);

CREATE INDEX IF NOT EXISTS nes_chrom_kag_dag_hits_metadata_gin
  ON public.nes_chrom_kag_dag_hits USING gin (metadata);
