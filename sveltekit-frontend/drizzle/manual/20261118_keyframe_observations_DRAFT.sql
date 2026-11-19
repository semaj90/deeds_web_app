-- DRAFT, NOT APPLIED. Keyframe observations with typed filter columns and a JSONB payload.
-- Rehearse inside BEGIN ... ROLLBACK. Apply only with explicit write approval.
-- Pre-image: table does not exist (check with to_regclass). Post-check: row count and index presence.
CREATE TABLE IF NOT EXISTS keyframe_observations (
  observation_id uuid PRIMARY KEY,
  evidence_id uuid NOT NULL REFERENCES evidence(id),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^sha256:[a-f0-9]{64}$'),
  frame_pts_ms integer NOT NULL CHECK (frame_pts_ms >= 0),
  class_label text NOT NULL CHECK (length(class_label) BETWEEN 1 AND 64),
  detection_confidence real NOT NULL CHECK (detection_confidence BETWEEN 0 AND 1),
  bbox_xyxy real[] NOT NULL CHECK (array_length(bbox_xyxy, 1) = 4),
  coordinate_frame text NOT NULL CHECK (coordinate_frame IN ('image', 'camera', 'world')),
  status text NOT NULL CHECK (status IN ('observed', 'estimated', 'reviewed')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS keyframe_obs_evidence_time_idx ON keyframe_observations (evidence_id, frame_pts_ms);
CREATE INDEX IF NOT EXISTS keyframe_obs_payload_gin_idx ON keyframe_observations USING gin (payload jsonb_path_ops);
