-- Migration: 2026-06-06 — create 14 priority missing tables
-- Safe: all IF NOT EXISTS, no DROP, no ALTER

CREATE TABLE IF NOT EXISTS error_brain_analysis (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  route_path text NOT NULL,
  suggestions jsonb NOT NULL,
  selected_suggestion_index integer,
  phase text NOT NULL DEFAULT 'analyzing',
  error_message text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS error_brain_analysis_route_path_idx ON error_brain_analysis(route_path);
CREATE INDEX IF NOT EXISTS error_brain_analysis_created_at_idx ON error_brain_analysis(created_at);
CREATE INDEX IF NOT EXISTS error_brain_analysis_phase_idx ON error_brain_analysis(phase);

CREATE TABLE IF NOT EXISTS error_brain_diffs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  run_id text NOT NULL,
  file_path text NOT NULL,
  diff_text text NOT NULL,
  before_sha256 text NOT NULL,
  after_sha256 text NOT NULL,
  after_text text NOT NULL,
  context_lines integer NOT NULL DEFAULT 3,
  confidence real NOT NULL,
  reason text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS error_cluster (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  route_id text NOT NULL,
  tool text NOT NULL,
  code text NOT NULL,
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  count integer NOT NULL DEFAULT 1,
  file_path text,
  raw_log_snippet text,
  cluster_id text UNIQUE,
  error_code text,
  category text,
  affected_routes jsonb,
  embedding vector(384),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_error_cluster_id ON error_cluster(cluster_id);
CREATE INDEX IF NOT EXISTS idx_error_cluster_code ON error_cluster(error_code);

CREATE TABLE IF NOT EXISTS evidence_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  modality text NOT NULL,
  source_url text,
  storage_uri text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  sha256 text,
  metadata_json jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_items_case_idx ON evidence_items(case_id);
CREATE INDEX IF NOT EXISTS evidence_items_status_idx ON evidence_items(status);

CREATE TABLE IF NOT EXISTS evidence_media_assets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  evidence_id uuid NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  storage_uri text NOT NULL,
  mime_type text,
  metadata_json jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_media_assets_evidence_idx ON evidence_media_assets(evidence_id);

CREATE TABLE IF NOT EXISTS evidence_transcript_segments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  evidence_id uuid NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  start_ms integer NOT NULL,
  end_ms integer NOT NULL,
  text text NOT NULL,
  language text,
  translated_text text,
  confidence numeric(4,3),
  model text,
  metadata_json jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_transcript_segments_evidence_idx ON evidence_transcript_segments(evidence_id);
CREATE INDEX IF NOT EXISTS evidence_transcript_segments_time_idx ON evidence_transcript_segments(start_ms, end_ms);

CREATE TABLE IF NOT EXISTS evidence_processing_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  evidence_id uuid NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running',
  progress numeric(5,2) DEFAULT 0,
  error_text text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_processing_jobs_evidence_idx ON evidence_processing_jobs(evidence_id);

CREATE TABLE IF NOT EXISTS evidence_frames (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  evidence_id uuid NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  timestamp_ms integer NOT NULL,
  storage_uri text NOT NULL,
  caption text,
  objects_json jsonb DEFAULT '[]',
  ocr_text text,
  tags_json jsonb DEFAULT '[]',
  vlm_model text,
  confidence numeric(4,3),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_frames_evidence_idx ON evidence_frames(evidence_id);

CREATE TABLE IF NOT EXISTS ingested_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  filename varchar(500) NOT NULL,
  original_name varchar(500) NOT NULL,
  mime_type varchar(100) NOT NULL,
  file_size bigint NOT NULL,
  content_hash varchar(64) NOT NULL UNIQUE,
  minio_object varchar(500) NOT NULL,
  minio_bucket varchar(100) NOT NULL DEFAULT 'legal-documents',
  minio_url text,
  needs_ocr boolean NOT NULL DEFAULT false,
  ocr_status text DEFAULT 'pending',
  ocr_completed_at timestamptz,
  ocr_metadata jsonb,
  extracted_text text,
  text_length integer,
  embedding_status text DEFAULT 'pending',
  embedding_model varchar(100),
  embedding_completed_at timestamptz,
  qdrant_id uuid,
  qdrant_collection varchar(100) DEFAULT 'legal_documents',
  last_synced_to_qdrant timestamptz,
  case_id uuid REFERENCES cases(id) ON DELETE CASCADE,
  uploaded_by integer REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  processing_errors jsonb DEFAULT '[]',
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ingested_docs_content_hash ON ingested_documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_ingested_docs_case_id ON ingested_documents(case_id);
CREATE INDEX IF NOT EXISTS idx_ingested_docs_ocr_status ON ingested_documents(ocr_status);

CREATE TABLE IF NOT EXISTS web_pages (
  id text PRIMARY KEY,
  url text NOT NULL,
  title text,
  content text NOT NULL,
  source text DEFAULT 'web',
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS web_embeddings (
  id text PRIMARY KEY,
  url text NOT NULL,
  embedding vector(768) NOT NULL,
  token_count integer,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS web_crawl_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer,
  urls jsonb NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  rag_mode varchar(20) DEFAULT 'hybrid',
  enable_gpu boolean DEFAULT true,
  processed_urls integer DEFAULT 0,
  total_urls integer,
  results jsonb,
  error text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL,
  event_type varchar(100) NOT NULL,
  metadata jsonb,
  timestamp timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer,
  job_id uuid,
  model varchar(100) NOT NULL DEFAULT 'gemma4-rotorquant:latest',
  system_prompt text,
  messages jsonb DEFAULT '[]',
  context_vectors jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);