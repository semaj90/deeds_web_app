-- Phase 72: AI History and GPU Inference Tables
-- Supports AI chat history, GPU inference sessions, and performance metrics

CREATE TABLE IF NOT EXISTS "ai_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text,
  "prompt" text,
  "response" text,
  "embedding" text,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "error_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message" text NOT NULL,
  "stack_trace" text,
  "embedding" real[],
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "indexed_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "file_path" text NOT NULL,
  "content" text,
  "embedding" real[],
  "summary" text,
  "metadata" jsonb,
  "indexed_at" timestamp DEFAULT now(),
  CONSTRAINT "indexed_files_file_path_unique" UNIQUE("file_path")
);

CREATE TABLE IF NOT EXISTS "ai_engine_status" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "engine_name" text NOT NULL,
  "is_online" boolean DEFAULT false,
  "last_health_check" timestamp DEFAULT now(),
  "response_time" integer,
  "version" text,
  "capabilities" jsonb,
  "configuration" jsonb,
  "error_status" text,
  "metadata" jsonb,
  CONSTRAINT "ai_engine_status_engine_name_unique" UNIQUE("engine_name")
);

CREATE TABLE IF NOT EXISTS "gpu_inference_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "embedding" real[],
  "engine_used" text,
  "response_time" integer,
  "tokens_generated" integer,
  "cache_hit" boolean DEFAULT false,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "gpu_inference_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_name" text NOT NULL,
  "user_id" text,
  "engine_used" text NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "metadata" jsonb,
  "is_active" boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS "gpu_performance_metrics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid,
  "engine_type" text NOT NULL,
  "request_count" integer,
  "avg_response_time" real,
  "cache_hit_rate" real,
  "tokens_per_second" real,
  "gpu_utilization" real,
  "memory_usage" real,
  "error_count" integer,
  "metadata" jsonb,
  "measured_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "documents" (
  "id" serial PRIMARY KEY NOT NULL,
  "uuid" varchar(36) NOT NULL,
  "case_id" integer NOT NULL,
  "filename" varchar(255) NOT NULL,
  "original_name" varchar(255) NOT NULL,
  "content_type" varchar(100) NOT NULL,
  "file_size" integer NOT NULL,
  "minio_path" varchar(500) NOT NULL,
  "extracted_text" text,
  "processing_status" varchar(50) DEFAULT 'pending' NOT NULL,
  "processing_error" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "documents_uuid_unique" UNIQUE("uuid")
);

CREATE TABLE IF NOT EXISTS "extracted_entities" (
  "id" serial PRIMARY KEY NOT NULL,
  "document_id" integer NOT NULL,
  "chunk_id" integer,
  "entity_type" varchar(50) NOT NULL,
  "entity_value" text NOT NULL,
  "confidence" real NOT NULL,
  "start_offset" integer,
  "end_offset" integer,
  "context" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "processing_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "uuid" varchar(36) NOT NULL,
  "document_id" integer,
  "job_type" varchar(50) NOT NULL,
  "status" varchar(50) DEFAULT 'queued' NOT NULL,
  "current_step" varchar(50),
  "progress" integer DEFAULT 0 NOT NULL,
  "result" jsonb,
  "error" text,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "processing_jobs_uuid_unique" UNIQUE("uuid")
);

CREATE TABLE IF NOT EXISTS "rag_queries" (
  "id" serial PRIMARY KEY NOT NULL,
  "uuid" varchar(36) NOT NULL,
  "case_id" integer,
  "query" text NOT NULL,
  "query_embedding" vector(384),
  "response" text,
  "model" varchar(50) NOT NULL,
  "tokens_used" integer,
  "processing_time_ms" integer,
  "similarity_threshold" real DEFAULT 0.7 NOT NULL,
  "results_count" integer,
  "user_feedback" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "rag_queries_uuid_unique" UNIQUE("uuid")
);

CREATE TABLE IF NOT EXISTS "rag_query_results" (
  "id" serial PRIMARY KEY NOT NULL,
  "query_id" integer NOT NULL,
  "chunk_id" integer NOT NULL,
  "similarity_score" real NOT NULL,
  "rank" integer NOT NULL,
  "used" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "case_summary_vectors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "summary" text NOT NULL,
  "embedding" vector(384) NOT NULL,
  "confidence" real DEFAULT 1,
  "last_updated" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "case_summary_vectors_case_id_unique" UNIQUE("case_id")
);

CREATE TABLE IF NOT EXISTS "document_vectors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL,
  "chunk_index" integer NOT NULL,
  "content" text NOT NULL,
  "embedding" vector(384) NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "knowledge_edges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_id" uuid NOT NULL,
  "target_id" uuid NOT NULL,
  "relationship" text NOT NULL,
  "weight" real DEFAULT 1,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "knowledge_nodes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "node_type" text NOT NULL,
  "node_id" uuid NOT NULL,
  "label" text NOT NULL,
  "embedding" vector(384) NOT NULL,
  "properties" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "query_vectors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "query" text NOT NULL,
  "embedding" vector(384) NOT NULL,
  "result_count" integer DEFAULT 0,
  "clicked_results" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "recommendation_cache" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "recommendation_type" text NOT NULL,
  "recommendations" jsonb NOT NULL,
  "score" real DEFAULT 0,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
