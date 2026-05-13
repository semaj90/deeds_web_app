-- Manual migration to add gpu_cluster to embedded_summaries
ALTER TABLE embedded_summaries ADD COLUMN IF NOT EXISTS gpu_cluster INTEGER;
CREATE INDEX IF NOT EXISTS embedded_summaries_gpu_cluster_idx ON embedded_summaries (gpu_cluster);
