-- Migration for Feature Evidence Tracking (Schema: atlas_feature_evidence)
-- Dependencies: Requires existing tables/functions for packet_key, content_hash, extractor_version to be populated or available.

-- 1. Create the table structure
CREATE TABLE IF NOT EXISTS atlas_feature_evidence (
  packet_key text NOT NULL,
  content_hash text NOT NULL,
  source_revision text,
  extractor_version text NOT NULL,

  source_ref text,
  language text,
  modality text,

  ast_evidence jsonb,
  lsp_evidence jsonb,
  document_evidence jsonb,
  ontology_evidence jsonb,
  ml_evidence jsonb,
  placeholder_findings jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (
    packet_key,
    content_hash,
    extractor_version
  )
);

-- 2. Create indexes for query performance
CREATE INDEX IF NOT EXISTS atlas_feature_evidence_packet_idx
ON atlas_feature_evidence (packet_key);

CREATE INDEX IF NOT EXISTS atlas_feature_evidence_title_idx
ON atlas_feature_evidence (
  (ast_evidence ->> 'primaryFunctionalSymbol')
);