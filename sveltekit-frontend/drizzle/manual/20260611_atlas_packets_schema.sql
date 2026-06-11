-- Create atlas_packets table
CREATE TABLE IF NOT EXISTS atlas_packets (
  packet_id text PRIMARY KEY,
  artifact_id text NOT NULL,
  source_ref text,
  feature_id text,
  community_id integer,
  concept_ids text[],
  cluster_id integer,
  embedding vector(768),
  payload jsonb,
  summary text,
  byte_start bigint,
  byte_end bigint,
  sha256 text,
  created_at timestamp with time zone DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS atlas_packets_payload_gin ON atlas_packets USING gin (payload);
CREATE INDEX IF NOT EXISTS atlas_packets_feature_idx ON atlas_packets (feature_id, community_id, cluster_id);
