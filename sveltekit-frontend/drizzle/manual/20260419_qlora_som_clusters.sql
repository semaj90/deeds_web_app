-- Add som_clusters column to qlora_examples
-- Propagates SOM topology context alongside GPU k-means clusters
-- for topology-aware QLoRA fine-tuning dataset generation.
ALTER TABLE qlora_examples
  ADD COLUMN IF NOT EXISTS som_clusters jsonb NOT NULL DEFAULT '[]'::jsonb;
