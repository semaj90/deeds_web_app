-- P1 Phase 2D: Summary Layers Table
-- Pre-computed summaries at multiple levels (chunk, file, folder, feature, community, system)
-- Summaries are NEVER generated synchronously; always offline via npm run atlas:summary:generate
-- Created: June 15, 2026

CREATE TABLE IF NOT EXISTS atlas_summary_layers (
  summary_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key      VARCHAR(255) NOT NULL,

  summary_level   VARCHAR(50),
  summary_text    TEXT,

  embedding       vector(768),
  keywords        TEXT[],
  metadata        JSONB DEFAULT '{}',

  generated_at    TIMESTAMP,
  model_name      VARCHAR(100),

  created_at      TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (packet_key) REFERENCES atlas_codebase_packets(packet_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_summary_packet ON atlas_summary_layers(packet_key);
CREATE INDEX IF NOT EXISTS idx_summary_level ON atlas_summary_layers(summary_level);
CREATE INDEX IF NOT EXISTS idx_summary_embedding
  ON atlas_summary_layers USING HNSW(embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_summary_keywords
  ON atlas_summary_layers USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_summary_generated_at ON atlas_summary_layers(generated_at);
