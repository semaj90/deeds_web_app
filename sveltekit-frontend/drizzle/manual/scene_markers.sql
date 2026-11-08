-- scene_markers: durable persistence for evidence-board markers (PROPOSAL, not applied)
-- Pre-image: none. These tables do not exist in the live catalog as of 2026-11-03
--   (checked read-only: no scene/marker tables; cases.id and evidence.id are uuid).
-- Reuses existing cases(id uuid) and evidence(id uuid). Adds no case or evidence table.
-- Idempotent: IF NOT EXISTS everywhere. Apply only after scratch rehearsal passes.
-- Post-check (read-only): SELECT count(*) FROM scene_markers; -- expect 0 on first apply.

CREATE TABLE IF NOT EXISTS scene_markers (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       uuid        NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  scene_key     text        NOT NULL CHECK (length(scene_key) BETWEEN 1 AND 200),
  marker_key    text        NOT NULL CHECK (length(marker_key) BETWEEN 1 AND 200),
  evidence_id   uuid        NOT NULL REFERENCES evidence(id) ON DELETE RESTRICT,
  pos_x         double precision NOT NULL CHECK (pos_x NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)),
  pos_y         double precision NOT NULL CHECK (pos_y NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)),
  pos_z         double precision NOT NULL CHECK (pos_z NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)),
  label         text        CHECK (label IS NULL OR length(label) <= 500),
  revision      integer     NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_by    integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT scene_markers_natural_key_uq UNIQUE (case_id, scene_key, marker_key)
);

CREATE INDEX IF NOT EXISTS scene_markers_case_scene_idx ON scene_markers (case_id, scene_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS scene_markers_evidence_idx ON scene_markers (evidence_id);

-- Append-only journal. One row per committed command. command_id is the idempotency key.
CREATE TABLE IF NOT EXISTS scene_events (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id       uuid        NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  scene_key     text        NOT NULL,
  command_id    uuid        NOT NULL,
  event_type    text        NOT NULL CHECK (event_type IN ('MARKER_CREATED','MARKER_MOVED','MARKER_LABELED','MARKER_DELETED')),
  marker_id     uuid        REFERENCES scene_markers(id) ON DELETE RESTRICT,
  aggregate_revision integer NOT NULL CHECK (aggregate_revision >= 1),
  payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by    integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scene_events_command_uq UNIQUE (command_id)
);

CREATE INDEX IF NOT EXISTS scene_events_case_scene_idx ON scene_events (case_id, scene_key, id);

-- Transactional outbox. Written in the same transaction as the marker and event.
CREATE TABLE IF NOT EXISTS scene_event_outbox (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id      bigint      NOT NULL REFERENCES scene_events(id) ON DELETE RESTRICT,
  status        text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed')),
  attempt_count integer     NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  delivered_at  timestamptz,
  CONSTRAINT scene_event_outbox_event_uq UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS scene_event_outbox_pending_idx ON scene_event_outbox (created_at) WHERE status = 'pending';
