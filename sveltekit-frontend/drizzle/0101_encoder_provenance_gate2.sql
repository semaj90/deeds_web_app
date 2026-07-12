-- Gate 2: Autoencoder Provenance Storage & Policy
-- Tracks encoder identity, training metadata, validation gates, and checkpoint history
-- Enables recovery from encoder changes and validation of latent vectors

-- Create encoder_provenance table (single canonical encoder per output dimension)
CREATE TABLE IF NOT EXISTS encoder_provenance (
  -- Encoder identity
  id SERIAL PRIMARY KEY,
  encoder_id TEXT NOT NULL UNIQUE,                -- e.g., "ae_768_to_64_v1"
  encoder_type VARCHAR(50) NOT NULL,              -- 'autoencoder', 'pca', 'vae', 'ae_mlp', 'ae_cnn'
  input_dimension SMALLINT NOT NULL,              -- 768
  output_dimension SMALLINT NOT NULL,             -- 64

  -- Training metadata
  model_id VARCHAR(255) NOT NULL,                 -- e.g., "gemma4_768_ae_20260601"
  checkpoint_hash VARCHAR(64) NOT NULL,           -- SHA-256 of .pt weights
  trained_at TIMESTAMP WITH TIME ZONE NOT NULL,  -- When training completed
  training_duration_seconds INTERVAL,             -- How long training took
  training_loss_final REAL,                       -- Final loss value
  validation_loss_final REAL,                     -- Val loss at completion

  -- Normalization & preprocessing (CRITICAL for validation)
  normalization VARCHAR(50) NOT NULL DEFAULT 'l2', -- 'l2', 'minmax', 'zscore', 'none'
  normalization_params JSONB,                      -- e.g., { "mean": [...], "std": [...] }

  -- Reconstruction accuracy (quality signal)
  reconstruction_mse REAL NOT NULL,                -- Mean squared error on val set
  reconstruction_mae REAL,                         -- Mean absolute error on val set
  reconstruction_percentile_95 REAL,               -- 95th percentile error

  -- Validation gates (8 gates, all must pass for "approved" status)
  validation_gates JSONB NOT NULL DEFAULT '{}',   -- { "gate1": {...}, "gate2": {...}, ... }
  -- Computed at training time:
  --   gate1_input_output_dims: dimension sanity check
  --   gate2_finite_values: no NaN/Infinity
  --   gate3_norm_distribution: check norm != all 1.0 or 0.0 (data leakage)
  --   gate4_reconstruction_error: MSE < threshold (encoder quality)
  --   gate5_neighbor_preservation: top-k neighbors in 64-dim close to 768-dim
  --   gate6_cluster_stability: AE centroids vs original centroids (Silhouette)
  --   gate7_version_checkpoint: checkpoint hash consistency
  --   gate8_training_metadata: all metadata fields non-null

  validation_passed BOOLEAN DEFAULT FALSE,        -- Only set true after all 8 gates pass
  validation_passed_at TIMESTAMP WITH TIME ZONE,  -- When validation occurred

  -- Status & lifecycle
  status VARCHAR(50) NOT NULL DEFAULT 'candidate', -- 'candidate', 'active', 'deprecated', 'archived'
  approved_by VARCHAR(255),                       -- Operator who approved (manual gate)
  approved_at TIMESTAMP WITH TIME ZONE,

  -- Version tracking
  version SMALLINT NOT NULL DEFAULT 1,            -- Encoder version (increment on retrain)
  previous_encoder_id TEXT,                       -- Link to prior version if exists

  -- Metadata
  notes TEXT,                                     -- Operator notes on training/validation
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT encoder_provenance_dims_valid CHECK (input_dimension > 0 AND output_dimension > 0),
  CONSTRAINT encoder_provenance_mse_valid CHECK (reconstruction_mse >= 0),
  CONSTRAINT encoder_provenance_validation_consistent
    CHECK (validation_passed = FALSE OR validation_passed_at IS NOT NULL)
);

CREATE INDEX idx_encoder_provenance_id ON encoder_provenance(encoder_id);
CREATE INDEX idx_encoder_provenance_status ON encoder_provenance(status);
CREATE INDEX idx_encoder_provenance_validated ON encoder_provenance(validation_passed);
CREATE INDEX idx_encoder_provenance_active ON encoder_provenance(status, validation_passed);
CREATE INDEX idx_encoder_provenance_version ON encoder_provenance(encoder_id, version);

-- Add encoder_id to codebase_chunk_index (foreign key to active encoder)
ALTER TABLE IF EXISTS codebase_chunk_index
  ADD COLUMN IF NOT EXISTS encoder_id TEXT REFERENCES encoder_provenance(encoder_id) ON DELETE SET NULL;

-- Add latent_embedding_valid flag (result of validation gate checks)
ALTER TABLE IF EXISTS codebase_chunk_index
  ADD COLUMN IF NOT EXISTS latent_embedding_valid BOOLEAN DEFAULT NULL;

-- Add latent_embedding_validation_date (when validation last ran)
ALTER TABLE IF EXISTS codebase_chunk_index
  ADD COLUMN IF NOT EXISTS latent_embedding_validated_at TIMESTAMP WITH TIME ZONE;

-- Create index on encoder_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_codebase_chunk_encoder_id ON codebase_chunk_index(encoder_id);
CREATE INDEX IF NOT EXISTS idx_codebase_chunk_latent_valid ON codebase_chunk_index(latent_embedding_valid);

-- Insert bootstrap record for the existing latent_64 autoencoder
-- This is the reference encoder that current latent vectors use
INSERT INTO encoder_provenance
  (encoder_id, encoder_type, input_dimension, output_dimension,
   model_id, checkpoint_hash, trained_at, training_loss_final, validation_loss_final,
   normalization, reconstruction_mse, reconstruction_mae, reconstruction_percentile_95,
   status, version, validation_gates, validation_passed)
VALUES
  ('ae_768_to_64_v0',
   'autoencoder',
   768, 64,
   'unknown_checkpoint',
   'legacy_checkpoint_hash_placeholder',
   NOW() - INTERVAL '90 days',  -- Approximate training date
   0.000735,  -- From Session 121 actual validation loss
   0.000735,
   'l2',
   0.000735,  -- MSE
   NULL,      -- MAE not tracked in original training
   0.001,     -- Approximate 95th percentile
   'active',  -- Current active encoder
   0,
   jsonb_build_object(
     'gate1_input_output_dims', jsonb_build_object('passed', true, 'note', 'input=768, output=64'),
     'gate2_finite_values', jsonb_build_object('passed', true, 'note', 'no NaN/Infinity'),
     'gate3_norm_distribution', jsonb_build_object('passed', false, 'note', 'pending verification'),
     'gate4_reconstruction_error', jsonb_build_object('passed', true, 'mse', 0.000735, 'threshold', 0.05),
     'gate5_neighbor_preservation', jsonb_build_object('passed', false, 'note', 'Spearman 0.712 << 0.85 target'),
     'gate6_cluster_stability', jsonb_build_object('passed', false, 'note', 'pending verification'),
     'gate7_version_checkpoint', jsonb_build_object('passed', true, 'note', 'v0 legacy baseline'),
     'gate8_training_metadata', jsonb_build_object('passed', true, 'note', 'metadata reconstructed from session notes')
   ),
   FALSE  -- Not validated yet (legacy bootstrap); validation will run at startup
)
ON CONFLICT (encoder_id) DO NOTHING;

-- Trigger to update updated_at on changes
CREATE OR REPLACE FUNCTION update_encoder_provenance_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_encoder_provenance_timestamp ON encoder_provenance;
CREATE TRIGGER update_encoder_provenance_timestamp
  BEFORE UPDATE ON encoder_provenance
  FOR EACH ROW
  EXECUTE FUNCTION update_encoder_provenance_timestamp();

-- View: encoder_validation_summary (for quick status checks)
CREATE OR REPLACE VIEW v_encoder_validation_summary AS
SELECT
  ep.encoder_id,
  ep.encoder_type,
  ep.status,
  ep.validation_passed,
  COUNT(DISTINCT cci.id) as packets_using_encoder,
  COUNT(DISTINCT CASE WHEN cci.latent_embedding_valid = TRUE THEN cci.id END) as packets_validated,
  COUNT(DISTINCT CASE WHEN cci.latent_embedding_valid = FALSE THEN cci.id END) as packets_invalid,
  COUNT(DISTINCT CASE WHEN cci.latent_embedding_valid IS NULL THEN cci.id END) as packets_unchecked,
  ep.reconstruction_mse,
  ep.validation_passed_at
FROM encoder_provenance ep
LEFT JOIN codebase_chunk_index cci ON ep.encoder_id = cci.encoder_id
WHERE ep.status != 'archived'
GROUP BY ep.encoder_id, ep.encoder_type, ep.status, ep.validation_passed, ep.reconstruction_mse, ep.validation_passed_at
ORDER BY ep.status DESC, ep.validation_passed DESC, ep.updated_at DESC;

-- View: latent_vector_validation_gap (for finding unvalidated vectors)
CREATE OR REPLACE VIEW v_latent_vector_validation_gap AS
SELECT
  encoder_id,
  COUNT(*) as total_packets,
  COUNT(CASE WHEN latent_embedding_valid = TRUE THEN 1 END) as validated,
  COUNT(CASE WHEN latent_embedding_valid = FALSE THEN 1 END) as invalid,
  COUNT(CASE WHEN latent_embedding_valid IS NULL THEN 1 END) as unchecked,
  ROUND(100.0 * COUNT(CASE WHEN latent_embedding_valid = TRUE THEN 1 END) / COUNT(*), 2) as validation_coverage_pct
FROM codebase_chunk_index
WHERE latent_64 IS NOT NULL
GROUP BY encoder_id
ORDER BY encoder_id;
