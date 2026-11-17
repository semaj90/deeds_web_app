-- Evidence pose observations v1 (PROPOSAL, not applied to any live database).
--
-- Why new tables in public (not ALTER TABLE, not a new schema):
--   * evidence_frames is one row per selected frame; pose data is one row per person per frame
--     and would multiply that table's write amplification (CLAUDE.md: codebase_chunk_index-style
--     write-amplification concerns apply). A separate table keeps frame rows stable.
--   * A new PostgreSQL schema would be a second namespace with its own migration and Drizzle
--     tablesFilter handling; everything else in this app lives in public.
--   * Pose and track rows are PROPOSALS until reviewed. status is CHECK-constrained; no row
--     becomes REVIEWED from a client-asserted value (enforced by the writer, not this DDL).
--   * Every row is revision-qualified (source_revision + analysis_revision + model revisions).
--     The original evidence row and its bytes are never modified; ON DELETE CASCADE follows
--     evidence_frames.
--
-- Idempotent: IF NOT EXISTS everywhere. Pre-check: the tables must not exist.
-- Post-check: both tables exist with the CHECK constraints listed below.

CREATE TABLE IF NOT EXISTS public.evidence_pose_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES public.evidence(id) ON DELETE CASCADE,
  source_revision text NOT NULL CHECK (source_revision ~ '^sha256:[0-9a-f]{64}$'),
  analysis_revision text NOT NULL CHECK (length(analysis_revision) BETWEEN 1 AND 256),
  tracker text NOT NULL CHECK (length(tracker) BETWEEN 1 AND 64),
  track_key text NOT NULL CHECK (length(track_key) BETWEEN 1 AND 128),
  status text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'REVIEWED', 'REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_pose_tracks_run_key_uniq UNIQUE (evidence_id, analysis_revision, tracker, track_key)
);

CREATE TABLE IF NOT EXISTS public.evidence_pose_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES public.evidence_pose_tracks(id) ON DELETE CASCADE,
  evidence_id uuid NOT NULL REFERENCES public.evidence(id) ON DELETE CASCADE,
  source_revision text NOT NULL CHECK (source_revision ~ '^sha256:[0-9a-f]{64}$'),
  analysis_revision text NOT NULL CHECK (length(analysis_revision) BETWEEN 1 AND 256),
  -- Three explicit time fields (review P0): original-timeline PTS, clip-relative time, and the
  -- decoder's frame index. Times come from decoded frame presentation timestamps, never a constant FPS.
  source_frame_index integer NOT NULL CHECK (source_frame_index >= 0),
  source_pts_us bigint NOT NULL CHECK (source_pts_us >= 0),
  clip_time_us bigint NOT NULL CHECK (clip_time_us >= 0 AND clip_time_us <= source_pts_us),
  -- Source-frame pixels, after inverting any YOLOX crop/letterbox affine transform.
  skeleton text NOT NULL CHECK (length(skeleton) BETWEEN 1 AND 64),
  joint_count integer NOT NULL CHECK (joint_count > 0 AND joint_count <= 133),
  keypoints jsonb NOT NULL,
  bbox_xyxy jsonb CHECK (bbox_xyxy IS NULL OR (jsonb_typeof(bbox_xyxy) = 'array' AND jsonb_array_length(bbox_xyxy) = 4)),
  detector_model text,
  detector_revision text,
  pose_model text NOT NULL CHECK (length(pose_model) BETWEEN 1 AND 128),
  pose_revision text NOT NULL CHECK (length(pose_revision) BETWEEN 1 AND 256),
  status text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'REVIEWED', 'REJECTED')),
  reviewed_by integer,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_pose_observations_keypoints_shape CHECK (
    jsonb_typeof(keypoints) = 'array' AND jsonb_array_length(keypoints) = joint_count
  ),
  CONSTRAINT evidence_pose_observations_review_consistency CHECK (
    (status = 'PROPOSED' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status <> 'PROPOSED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT evidence_pose_observations_track_frame_uniq UNIQUE (track_id, source_frame_index)
);

CREATE INDEX IF NOT EXISTS evidence_pose_observations_evidence_frame_idx
  ON public.evidence_pose_observations (evidence_id, source_frame_index);
CREATE INDEX IF NOT EXISTS evidence_pose_tracks_evidence_idx
  ON public.evidence_pose_tracks (evidence_id);
