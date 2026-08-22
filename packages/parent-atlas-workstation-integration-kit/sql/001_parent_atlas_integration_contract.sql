BEGIN;

-- Identity and revision fields required for cross-store parity.
ALTER TABLE public.atlas_packets
  ADD COLUMN IF NOT EXISTS workspace_revision text,
  ADD COLUMN IF NOT EXISTS source_revision text,
  ADD COLUMN IF NOT EXISTS representation_id text,
  ADD COLUMN IF NOT EXISTS representation_revision text,
  ADD COLUMN IF NOT EXISTS schema_version text DEFAULT 'atlas.packet.v1',
  ADD COLUMN IF NOT EXISTS projection_revision text,
  ADD COLUMN IF NOT EXISTS evidence_state text,
  ADD COLUMN IF NOT EXISTS domain_class text,
  ADD COLUMN IF NOT EXISTS artifact_kind text;

-- Do not enforce packet_key uniqueness until coverage and duplicate audits pass.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS atlas_packets_packet_id_uidx
  ON public.atlas_packets (packet_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_packets_packet_key_idx
  ON public.atlas_packets (packet_key)
  WHERE packet_key IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_packets_source_ref_idx
  ON public.atlas_packets (source_ref)
  WHERE source_ref IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_packets_revision_idx
  ON public.atlas_packets (workspace_revision, source_revision, packet_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_packets_domain_artifact_idx
  ON public.atlas_packets (domain_class, artifact_kind);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_packets_tags_gin
  ON public.atlas_packets USING gin (tags);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_packets_concept_ids_gin
  ON public.atlas_packets USING gin (concept_ids);

CREATE TABLE IF NOT EXISTS public.atlas_representation_records (
  packet_id text NOT NULL,
  workspace_revision text NOT NULL,
  source_revision text NOT NULL,
  content_hash text NOT NULL,
  representation_id text NOT NULL,
  representation_revision text NOT NULL,
  model_id text NOT NULL,
  model_revision text NOT NULL,
  dimensions integer NOT NULL CHECK (dimensions > 0),
  normalization text NOT NULL,
  runtime text NOT NULL,
  fallback boolean NOT NULL DEFAULT false,
  vector_hash text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (packet_id, representation_id, representation_revision)
);

CREATE TABLE IF NOT EXISTS public.atlas_projection_ledger (
  packet_id text NOT NULL,
  store text NOT NULL CHECK (store IN ('qdrant', 'neo4j', 'valkey', 'ace')),
  workspace_revision text NOT NULL,
  content_hash text NOT NULL,
  projection_revision text NOT NULL,
  representation_id text,
  external_id text,
  readback_verified_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (packet_id, store, projection_revision)
);

CREATE TABLE IF NOT EXISTS public.atlas_graph_feature_runs (
  packet_id text NOT NULL,
  graph_run_id text NOT NULL,
  graph_revision text NOT NULL,
  algorithm_version text NOT NULL,
  pagerank real,
  betweenness real,
  eigenvector real,
  community_id integer,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (packet_id, graph_run_id)
);

COMMIT;
