-- Create atlas_packets table
CREATE TABLE IF NOT EXISTS atlas_packets (
  packet_id text PRIMARY KEY,
  artifact_id text NOT NULL,
  source_ref text,
  packet_key text,
  feature_id text,
  community_id integer,
  concept_ids text[],
  cluster_id integer,
  embedding vector(768),
  payload jsonb,
  metadata jsonb,
  summary text,
  byte_start bigint,
  byte_end bigint,
  sha256 text,
  source_kind text,
  source_path text,
  source_ref_key text,
  community_source text,
  community_confidence double precision,
  reward_prior double precision DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE IF EXISTS atlas_packets
  ADD COLUMN IF NOT EXISTS packet_key text,
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS source_kind text,
  ADD COLUMN IF NOT EXISTS source_path text,
  ADD COLUMN IF NOT EXISTS reward_prior double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Create indexes
CREATE INDEX IF NOT EXISTS atlas_packets_payload_gin ON atlas_packets USING gin (payload);
CREATE INDEX IF NOT EXISTS atlas_packets_feature_idx ON atlas_packets (feature_id, community_id, cluster_id);
CREATE INDEX IF NOT EXISTS atlas_packets_identity_idx ON atlas_packets (packet_key, source_ref, feature_id, community_id);
CREATE INDEX IF NOT EXISTS atlas_packets_metadata_gin_idx ON atlas_packets USING gin (metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS atlas_packets_metadata_path_idx ON atlas_packets ((metadata->>'path'));
CREATE INDEX IF NOT EXISTS atlas_packets_metadata_hash_idx ON atlas_packets ((metadata->>'hash'));
CREATE INDEX IF NOT EXISTS atlas_packets_payload_hash_idx ON atlas_packets ((payload->>'hash'));
CREATE INDEX IF NOT EXISTS idx_atlas_packets_feature_id ON atlas_packets (feature_id);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_community_id ON atlas_packets (community_id);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_ref_key ON atlas_packets (source_ref_key);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_ref ON atlas_packets (source_ref);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_packet_key ON atlas_packets (packet_key);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_kind ON atlas_packets (source_kind);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_concept_ids ON atlas_packets USING gin (concept_ids);
CREATE INDEX IF NOT EXISTS idx_atlas_packets_summary_fts ON atlas_packets USING gin (to_tsvector('english', coalesce(summary, '')));
CREATE INDEX IF NOT EXISTS idx_atlas_packets_payload_path ON atlas_packets ((payload->>'path'));
CREATE INDEX IF NOT EXISTS idx_atlas_packets_payload_file_url ON atlas_packets ((payload->>'file_url'));
CREATE INDEX IF NOT EXISTS idx_packet_payload_path ON atlas_packets (((payload->>'path')));
CREATE INDEX IF NOT EXISTS idx_packet_payload_feature ON atlas_packets (((payload->>'feature_id')));
