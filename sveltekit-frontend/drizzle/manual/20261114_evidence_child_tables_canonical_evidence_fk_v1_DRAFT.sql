-- Review-Only Draft Migration: Bind evidence child tables to canonical evidence(id) table
-- Target: PostgreSQL 18
-- DO NOT APPLY TO LIVE DATABASE YET (Review Only)
-- Scope: evidence_media_assets, evidence_transcript_segments, evidence_frames
-- Explicitly omits: evidence_items, evidence_processing_jobs (canonical parent is public.evidence)

CREATE TABLE IF NOT EXISTS evidence_media_assets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  evidence_id uuid NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  asset_type text NOT NULL, -- 'original' | 'audio_mono' | 'frame' | 'sprite_atlas'
  storage_uri text NOT NULL,
  mime_type text,
  metadata_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_media_assets_evidence_idx ON evidence_media_assets(evidence_id);

CREATE TABLE IF NOT EXISTS evidence_transcript_segments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  evidence_id uuid NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  start_ms integer NOT NULL,
  end_ms integer NOT NULL,
  text text NOT NULL,
  language text,
  translated_text text,
  confidence numeric(4,3),
  model text,
  metadata_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_transcript_segments_evidence_idx ON evidence_transcript_segments(evidence_id);
CREATE INDEX IF NOT EXISTS evidence_transcript_segments_time_idx ON evidence_transcript_segments(start_ms, end_ms);

CREATE TABLE IF NOT EXISTS evidence_frames (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  evidence_id uuid NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  timestamp_ms integer NOT NULL,
  storage_uri text NOT NULL,
  caption text,
  objects_json jsonb DEFAULT '[]'::jsonb,
  ocr_text text,
  tags_json jsonb DEFAULT '[]'::jsonb,
  vlm_model text,
  confidence numeric(4,3),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_frames_evidence_idx ON evidence_frames(evidence_id);
