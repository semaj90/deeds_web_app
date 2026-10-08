CREATE TABLE IF NOT EXISTS public.atlas_packet_incidence (
  lineage_checksum text PRIMARY KEY CHECK (lineage_checksum ~ '^sha256:[0-9a-f]{64}$'),
  input_checksum text NOT NULL CHECK (input_checksum ~ '^sha256:[0-9a-f]{64}$'),
  packet_key text NOT NULL,
  canonical_id text NOT NULL,
  source_revision text NOT NULL,
  neighbor_packet_key text NOT NULL,
  neighbor_canonical_id text NOT NULL,
  neighbor_source_revision text NOT NULL,
  edge_type text NOT NULL,
  workspace_revision text NOT NULL,
  graph_revision text NOT NULL,
  producer_id text NOT NULL,
  producer_revision text NOT NULL,
  evidence_refs text[] NOT NULL CHECK (cardinality(evidence_refs) > 0),
  lineage jsonb NOT NULL CHECK (jsonb_typeof(lineage) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atlas_packet_incidence_distinct_endpoints_v1
    CHECK (packet_key <> neighbor_packet_key AND canonical_id <> neighbor_canonical_id),
  CONSTRAINT atlas_packet_incidence_lineage_columns_v1
    CHECK (
      lineage->>'schema' = 'atlas.packet-incidence-lineage.v1'
      AND lineage->>'lineageChecksum' = lineage_checksum
      AND lineage->>'inputChecksum' = input_checksum
      AND lineage->>'packetKey' = packet_key
      AND lineage->>'canonicalId' = canonical_id
      AND lineage->>'sourceRevision' = source_revision
      AND lineage->>'neighborPacketKey' = neighbor_packet_key
      AND lineage->>'neighborCanonicalId' = neighbor_canonical_id
      AND lineage->>'neighborSourceRevision' = neighbor_source_revision
      AND lineage->>'edgeType' = edge_type
      AND lineage->>'workspaceRevision' = workspace_revision
      AND lineage->>'graphRevision' = graph_revision
      AND lineage->>'producerId' = producer_id
      AND lineage->>'producerRevision' = producer_revision
    )
);

CREATE INDEX IF NOT EXISTS atlas_packet_incidence_subject_revision_v1
  ON public.atlas_packet_incidence (canonical_id, workspace_revision, graph_revision);

CREATE INDEX IF NOT EXISTS atlas_packet_incidence_neighbor_revision_v1
  ON public.atlas_packet_incidence (neighbor_canonical_id, workspace_revision, graph_revision);
