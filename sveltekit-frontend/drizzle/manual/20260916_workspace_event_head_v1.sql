-- Parent Atlas incremental workspace head/event storage.
-- Planned sidecar only: do not apply until migration-owner review and a
-- disposable Postgres readback canary are explicitly authorized.

CREATE TABLE IF NOT EXISTS public.atlas_workspace_events (
  event_id uuid PRIMARY KEY,
  workspace_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  base_snapshot_revision text NOT NULL,
  previous_head_revision text NOT NULL,
  workspace_head_revision text NOT NULL,
  delta_root_checksum text NOT NULL CHECK (delta_root_checksum ~ '^(sha256:)?[0-9a-f]{64}$'),
  event_type text NOT NULL CHECK (event_type IN (
    'SOURCE_CREATED', 'SOURCE_UPDATED', 'SOURCE_DELETED', 'SOURCE_RENAMED',
    'PACKET_ADMITTED', 'CHUNK_CHANGED', 'REPRESENTATION_UPDATED',
    'GRAPH_EDGE_CHANGED', 'CLASSIFIER_EVIDENCE_UPDATED'
  )),
  occurred_at timestamptz NOT NULL,
  correlation_id uuid NOT NULL,
  causation_id uuid,
  producer_revision text NOT NULL,
  before_state_checksum text CHECK (before_state_checksum IS NULL OR before_state_checksum ~ '^(sha256:)?[0-9a-f]{64}$'),
  after_state_checksum text NOT NULL CHECK (after_state_checksum ~ '^(sha256:)?[0-9a-f]{64}$'),
  event_checksum text NOT NULL CHECK (event_checksum ~ '^(sha256:)?[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, base_snapshot_revision, sequence),
  UNIQUE (event_checksum)
);

CREATE TABLE IF NOT EXISTS public.atlas_workspace_event_participants (
  event_id uuid NOT NULL,
  participant_ordinal integer NOT NULL CHECK (participant_ordinal >= 0),
  role text NOT NULL CHECK (role IN ('WORKSPACE', 'SOURCE', 'PACKET', 'CHUNK', 'REPRESENTATION', 'GRAPH_NODE', 'FEATURE', 'MODEL')),
  canonical_id text NOT NULL,
  revision text,
  relation text NOT NULL CHECK (relation IN ('SUBJECT', 'INPUT', 'OUTPUT', 'INVALIDATES', 'DERIVES', 'DEPENDS_ON')),
  PRIMARY KEY (event_id, participant_ordinal),
  CONSTRAINT atlas_workspace_event_participants_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.atlas_workspace_events(event_id)
);

CREATE TABLE IF NOT EXISTS public.atlas_workspace_heads (
  workspace_id text PRIMARY KEY,
  base_snapshot_revision text NOT NULL,
  last_event_sequence bigint NOT NULL DEFAULT 0 CHECK (last_event_sequence >= 0),
  last_event_id uuid REFERENCES public.atlas_workspace_events(event_id),
  last_event_checksum text CHECK (last_event_checksum IS NULL OR last_event_checksum ~ '^(sha256:)?[0-9a-f]{64}$'),
  delta_root_checksum text NOT NULL CHECK (delta_root_checksum ~ '^(sha256:)?[0-9a-f]{64}$'),
  event_count_since_snapshot integer NOT NULL DEFAULT 0 CHECK (event_count_since_snapshot >= 0),
  changed_source_count integer NOT NULL DEFAULT 0 CHECK (changed_source_count >= 0),
  workspace_head_revision text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
  ,CONSTRAINT atlas_workspace_heads_last_event_id_fkey
    FOREIGN KEY (last_event_id) REFERENCES public.atlas_workspace_events(event_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS atlas_workspace_events_workspace_sequence_idx
  ON public.atlas_workspace_events (workspace_id, base_snapshot_revision, sequence);
CREATE INDEX IF NOT EXISTS atlas_workspace_event_participants_canonical_idx
  ON public.atlas_workspace_event_participants (canonical_id, role, relation);

CREATE OR REPLACE FUNCTION public.atlas_workspace_event_immutable_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ATLAS_WORKSPACE_EVENT_IMMUTABLE:%', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS atlas_workspace_events_immutable_v1 ON public.atlas_workspace_events;
CREATE TRIGGER atlas_workspace_events_immutable_v1
  BEFORE UPDATE OR DELETE ON public.atlas_workspace_events
  FOR EACH ROW EXECUTE FUNCTION public.atlas_workspace_event_immutable_v1();

DROP TRIGGER IF EXISTS atlas_workspace_event_participants_immutable_v1 ON public.atlas_workspace_event_participants;
CREATE TRIGGER atlas_workspace_event_participants_immutable_v1
  BEFORE UPDATE OR DELETE ON public.atlas_workspace_event_participants
  FOR EACH ROW EXECUTE FUNCTION public.atlas_workspace_event_immutable_v1();
