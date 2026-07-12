-- Session 124: Semantic topK rerank ledger
-- Additive only. Identity remains in atlas_packets; feature-level topK analysis
-- is persisted in atlas_packet_metrics as a derived projection.

ALTER TABLE atlas_packet_metrics
ADD COLUMN IF NOT EXISTS semantic_topk_rank integer,
ADD COLUMN IF NOT EXISTS semantic_topk_score real,
ADD COLUMN IF NOT EXISTS semantic_topk_feature_id text,
ADD COLUMN IF NOT EXISTS semantic_topk_domain_class text,
ADD COLUMN IF NOT EXISTS semantic_topk_title_id text,
ADD COLUMN IF NOT EXISTS semantic_topk_source text DEFAULT 'semantic-fanout-topk',
ADD COLUMN IF NOT EXISTS semantic_topk_generated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS semantic_topk_analysis jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_atlas_packet_metrics_semantic_topk_score
  ON atlas_packet_metrics (semantic_topk_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_atlas_packet_metrics_semantic_topk_feature_id
  ON atlas_packet_metrics (semantic_topk_feature_id);

CREATE INDEX IF NOT EXISTS idx_atlas_packet_metrics_semantic_topk_domain_class
  ON atlas_packet_metrics (semantic_topk_domain_class);

CREATE INDEX IF NOT EXISTS idx_atlas_packet_metrics_semantic_topk_analysis_gin
  ON atlas_packet_metrics USING gin (semantic_topk_analysis);

COMMENT ON COLUMN atlas_packet_metrics.semantic_topk_analysis IS
  'Derived topK rerank evidence for a packet or representative feature cluster. Append-only via refresh-semantic-fanout-topk.';
