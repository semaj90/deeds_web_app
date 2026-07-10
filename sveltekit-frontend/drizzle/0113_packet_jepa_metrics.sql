-- Session 124: Packet-JEPA derived metrics
-- Additive only. Identity remains in atlas_packets; learned outputs live in atlas_packet_metrics.

ALTER TABLE atlas_packet_metrics
ADD COLUMN IF NOT EXISTS pca_latent real[],
ADD COLUMN IF NOT EXISTS pca_latent_dim integer,
ADD COLUMN IF NOT EXISTS jepa_latent real[],
ADD COLUMN IF NOT EXISTS jepa_latent_dim integer,
ADD COLUMN IF NOT EXISTS packet_jepa_similarity real,
ADD COLUMN IF NOT EXISTS jepa_model_version text,
ADD COLUMN IF NOT EXISTS jepa_trained_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS jepa_scored_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS jepa_evaluation jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_atlas_packet_metrics_packet_jepa_similarity
  ON atlas_packet_metrics (packet_jepa_similarity DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_atlas_packet_metrics_jepa_model_version
  ON atlas_packet_metrics (jepa_model_version);

CREATE INDEX IF NOT EXISTS idx_atlas_packet_metrics_jepa_eval_gin
  ON atlas_packet_metrics USING gin (jepa_evaluation);

COMMENT ON COLUMN atlas_packet_metrics.pca_latent IS
  'PCA baseline latent for packet retrieval experiments. Derived only.';
COMMENT ON COLUMN atlas_packet_metrics.jepa_latent IS
  'Packet-JEPA latent representation. Derived only.';
COMMENT ON COLUMN atlas_packet_metrics.packet_jepa_similarity IS
  'Mean cosine similarity against deterministic positive packet neighbors in Packet-JEPA latent space.';
